import type { PlaceCandidate, PlaceOpeningPeriod } from '../places/places-provider';

export type PlaceAvailability = 'open' | 'closed' | 'unknown';

export type EvaluatedPlace = {
  place: PlaceCandidate;
  availability: PlaceAvailability;
  budgetMatch: 'match' | 'over' | 'unknown';
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function pointToWeekMinute(point: { day: number; hour: number; minute: number }): number {
  return point.day * MINUTES_PER_DAY + point.hour * 60 + point.minute;
}

function periodContains(period: PlaceOpeningPeriod, target: number): boolean {
  if (!period.close) return true;
  const open = pointToWeekMinute(period.open);
  let close = pointToWeekMinute(period.close);
  if (close <= open) close += MINUTES_PER_WEEK;

  return (
    (target >= open && target < close) ||
    (target + MINUTES_PER_WEEK >= open && target + MINUTES_PER_WEEK < close)
  );
}

export function placeAvailabilityAt(place: PlaceCandidate, instant: Date): PlaceAvailability {
  const periods = place.regularOpeningHours?.periods;
  if (!periods) return 'unknown';
  if (periods.length === 0) return 'closed';

  const localInstant = new Date(instant.getTime() + (place.utcOffsetMinutes ?? 0) * 60_000);
  const target =
    localInstant.getUTCDay() * MINUTES_PER_DAY +
    localInstant.getUTCHours() * 60 +
    localInstant.getUTCMinutes();

  return periods.some((period) => periodContains(period, target)) ? 'open' : 'closed';
}

/** Heuristic MVP: budget là VND/người, priceLevel là thang tương đối 0..4 của provider. */
export function maximumPriceLevel(budgetMax?: number): number | undefined {
  if (budgetMax === undefined) return undefined;
  if (budgetMax <= 50_000) return 0;
  if (budgetMax <= 120_000) return 1;
  if (budgetMax <= 300_000) return 2;
  if (budgetMax <= 700_000) return 3;
  return 4;
}

export function evaluatePlaces(
  places: readonly PlaceCandidate[],
  plannedAt: Date,
  budgetMax?: number,
  minimumRating?: number,
): EvaluatedPlace[] {
  const maximumLevel = maximumPriceLevel(budgetMax);

  return places.flatMap((place) => {
    if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return [];
    if (minimumRating !== undefined && place.rating !== undefined && place.rating < minimumRating) {
      return [];
    }

    const availability = placeAvailabilityAt(place, plannedAt);
    if (availability === 'closed') return [];

    const budgetMatch =
      maximumLevel === undefined || place.priceLevel === undefined
        ? 'unknown'
        : place.priceLevel <= maximumLevel
          ? 'match'
          : 'over';
    if (budgetMatch === 'over') return [];

    return [{ place, availability, budgetMatch }];
  });
}
