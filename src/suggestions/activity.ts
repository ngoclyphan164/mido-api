const ACTIVITY_TYPES: Record<string, readonly string[]> = {
  food: ['restaurant'],
  restaurant: ['restaurant'],
  an: ['restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  ca_phe: ['cafe', 'coffee_shop'],
  drinks: ['bar', 'pub'],
  nhau: ['bar', 'pub'],
  movie: ['movie_theater'],
  phim: ['movie_theater'],
  karaoke: ['karaoke'],
  bowling: ['bowling_alley'],
};

export function normalizeActivityType(activity: string): string {
  return activity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function placeTypesForActivity(activity: string): readonly string[] | undefined {
  return ACTIVITY_TYPES[normalizeActivityType(activity)];
}
