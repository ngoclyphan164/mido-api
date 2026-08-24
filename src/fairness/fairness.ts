export type ActualTravelTime = Readonly<{
  participantId: string;
  userId: string;
  durationSeconds: number;
}>;

export type FairnessDelta = ActualTravelTime & Readonly<{ deltaSeconds: number }>;

export const FAIRNESS_DEBT_SCALE_SECONDS = 3_600;
export const FAIRNESS_WEIGHT_ADJUSTMENT_LIMIT = 0.4;

/**
 * Chuyển thời gian thực tế thành delta so với trung bình nhóm. Làm tròn theo
 * cách bảo toàn tổng bằng 0 để ledger không tự sinh thêm hoặc làm mất debt.
 */
export function calculateFairnessDeltas(travelTimes: readonly ActualTravelTime[]): {
  meanDurationSeconds: number;
  entries: FairnessDelta[];
} {
  if (travelTimes.length < 2 || travelTimes.length > 10) {
    throw new RangeError('fairness ledger requires between 2 and 10 participants');
  }

  const participantIds = new Set<string>();
  for (const travelTime of travelTimes) {
    if (participantIds.has(travelTime.participantId)) {
      throw new RangeError('participant IDs must be unique');
    }
    participantIds.add(travelTime.participantId);
    if (
      !Number.isInteger(travelTime.durationSeconds) ||
      travelTime.durationSeconds < 0 ||
      travelTime.durationSeconds > 86_400
    ) {
      throw new RangeError('durationSeconds must be an integer between 0 and 86400');
    }
  }

  const total = travelTimes.reduce((sum, travelTime) => sum + travelTime.durationSeconds, 0);
  const meanDurationSeconds = total / travelTimes.length;
  const entries = travelTimes.map((travelTime) => ({
    ...travelTime,
    deltaSeconds: Math.round(travelTime.durationSeconds - meanDurationSeconds),
  }));

  // Tổng các số đã round có thể lệch vài giây. Phân phối sai số theo participant
  // ID để kết quả idempotent, không phụ thuộc thứ tự body client gửi lên.
  let roundingError = entries.reduce((sum, entry) => sum + entry.deltaSeconds, 0);
  const correctionOrder = [...entries].sort((left, right) =>
    left.participantId.localeCompare(right.participantId),
  );
  let correctionIndex = 0;
  while (roundingError !== 0) {
    const entry = correctionOrder[correctionIndex % correctionOrder.length]!;
    entry.deltaSeconds += roundingError > 0 ? -1 : 1;
    roundingError += roundingError > 0 ? -1 : 1;
    correctionIndex += 1;
  }

  return { meanDurationSeconds, entries };
}

/** Debt dương kéo midpoint về gần user đó hơn; adjustment bị chặn ở ±40%. */
export function fairnessPriorityWeight(
  debtSeconds: number,
  scaleSeconds = FAIRNESS_DEBT_SCALE_SECONDS,
): number {
  if (!Number.isFinite(debtSeconds)) throw new RangeError('debtSeconds must be finite');
  if (!Number.isFinite(scaleSeconds) || scaleSeconds <= 0) {
    throw new RangeError('scaleSeconds must be positive');
  }

  const adjustment = Math.min(
    FAIRNESS_WEIGHT_ADJUSTMENT_LIMIT,
    Math.max(-FAIRNESS_WEIGHT_ADJUSTMENT_LIMIT, debtSeconds / scaleSeconds),
  );
  return 1 + adjustment;
}
