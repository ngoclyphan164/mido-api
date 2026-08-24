export type FairnessMode = 'BALANCED' | 'FAIREST' | 'FASTEST' | 'WEIGHTED';

export type CandidateInput = {
  id: string;
  travelTimesSeconds: readonly number[];
  participantWeights?: readonly number[];
  rating?: number;
  userRatingCount?: number;
  preference?: number;
  context?: number;
};

export type ScoreBreakdown = {
  fairness: number;
  efficiency: number;
  maxTime: number;
  quality: number;
  preference: number;
  context: number;
  meanTimeSeconds: number;
  maxTimeSeconds: number;
  withinTimeCap: boolean;
};

export type ScoredCandidate = CandidateInput & { score: number; breakdown: ScoreBreakdown };

const MODE_WEIGHTS: Record<
  FairnessMode,
  Readonly<
    Pick<
      ScoreBreakdown,
      'fairness' | 'efficiency' | 'maxTime' | 'quality' | 'preference' | 'context'
    >
  >
> = {
  BALANCED: {
    fairness: 0.35,
    efficiency: 0.2,
    maxTime: 0,
    quality: 0.2,
    preference: 0.15,
    context: 0.1,
  },
  FAIREST: {
    fairness: 0,
    efficiency: 0.15,
    maxTime: 0.6,
    quality: 0.15,
    preference: 0.05,
    context: 0.05,
  },
  FASTEST: {
    fairness: 0.1,
    efficiency: 0.5,
    maxTime: 0,
    quality: 0.2,
    preference: 0.1,
    context: 0.1,
  },
  WEIGHTED: {
    fairness: 0.35,
    efficiency: 0.25,
    maxTime: 0.1,
    quality: 0.15,
    preference: 0.1,
    context: 0.05,
  },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function validateTimes(times: readonly number[]): void {
  if (times.length === 0) throw new RangeError('at least one travel time is required');
  if (times.some((time) => !Number.isFinite(time) || time < 0)) {
    throw new RangeError('travel times must be finite and non-negative');
  }
}

function normalizedWeights(count: number, weights: readonly number[] | undefined): number[] {
  if (!weights) return new Array<number>(count).fill(1);
  if (weights.length !== count) throw new RangeError('participantWeights must match travelTimes');
  if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
    throw new RangeError('participant weights must be positive');
  }
  return [...weights];
}

function weightedMean(values: readonly number[], weights: readonly number[]): number {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return values.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), 0) / weightSum;
}

export function jainFairnessIndex(
  times: readonly number[],
  participantWeights?: readonly number[],
): number {
  validateTimes(times);
  const weights = normalizedWeights(times.length, participantWeights);
  const weightedSum = times.reduce((sum, time, index) => sum + time * (weights[index] ?? 0), 0);
  const weightedSquares = times.reduce(
    (sum, time, index) => sum + time * time * (weights[index] ?? 0),
    0,
  );
  if (weightedSquares === 0) return 1;
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  return clamp01((weightedSum * weightedSum) / (weightSum * weightedSquares));
}

export function bayesianQuality(rating?: number, ratingCount?: number): number {
  if (rating === undefined || ratingCount === undefined) return 0.5;
  const safeRating = Math.min(5, Math.max(1, rating));
  const safeCount = Math.max(0, ratingCount);
  const priorRating = 4;
  const priorCount = 20;
  const adjusted = (safeCount * safeRating + priorCount * priorRating) / (safeCount + priorCount);
  return clamp01((adjusted - 1) / 4);
}

export function scoreCandidate(
  candidate: CandidateInput,
  mode: FairnessMode,
  timeCapSeconds = 1_800,
): ScoredCandidate {
  validateTimes(candidate.travelTimesSeconds);
  if (!Number.isFinite(timeCapSeconds) || timeCapSeconds <= 0) {
    throw new RangeError('timeCapSeconds must be positive');
  }

  const metricWeights =
    mode === 'WEIGHTED'
      ? normalizedWeights(candidate.travelTimesSeconds.length, candidate.participantWeights)
      : normalizedWeights(candidate.travelTimesSeconds.length, undefined);
  const meanTimeSeconds = weightedMean(candidate.travelTimesSeconds, metricWeights);
  const maxTimeSeconds = Math.max(...candidate.travelTimesSeconds);
  const breakdown: ScoreBreakdown = {
    // Fairness đo độ chênh thực tế giữa người với người. Priority weight chỉ
    // tác động efficiency/seed; đưa nó vào Jain sẽ vô tình thưởng việc để người
    // priority cao đi xa hơn.
    fairness: jainFairnessIndex(candidate.travelTimesSeconds),
    efficiency: clamp01(1 - meanTimeSeconds / timeCapSeconds),
    maxTime: clamp01(1 - maxTimeSeconds / timeCapSeconds),
    quality: bayesianQuality(candidate.rating, candidate.userRatingCount),
    preference: clamp01(candidate.preference ?? 0.5),
    context: clamp01(candidate.context ?? 0.5),
    meanTimeSeconds,
    maxTimeSeconds,
    withinTimeCap: candidate.travelTimesSeconds.every((time) => time <= timeCapSeconds),
  };
  const weights = MODE_WEIGHTS[mode];
  const score =
    weights.fairness * breakdown.fairness +
    weights.efficiency * breakdown.efficiency +
    weights.maxTime * breakdown.maxTime +
    weights.quality * breakdown.quality +
    weights.preference * breakdown.preference +
    weights.context * breakdown.context;

  return { ...candidate, score: clamp01(score), breakdown };
}

export function rankCandidates(
  candidates: readonly CandidateInput[],
  mode: FairnessMode,
  timeCapSeconds = 1_800,
): { candidates: ScoredCandidate[]; capRelaxed: boolean } {
  const scored = candidates.map((candidate) => scoreCandidate(candidate, mode, timeCapSeconds));
  const feasible = scored.filter((candidate) => candidate.breakdown.withinTimeCap);
  const capRelaxed = feasible.length === 0 && scored.length > 0;
  const pool = feasible.length > 0 ? feasible : scored;

  pool.sort((left, right) => {
    if (mode === 'FAIREST') {
      return (
        left.breakdown.maxTimeSeconds - right.breakdown.maxTimeSeconds ||
        left.breakdown.meanTimeSeconds - right.breakdown.meanTimeSeconds ||
        right.score - left.score
      );
    }
    return (
      right.score - left.score || left.breakdown.maxTimeSeconds - right.breakdown.maxTimeSeconds
    );
  });

  return { candidates: pool, capRelaxed };
}
