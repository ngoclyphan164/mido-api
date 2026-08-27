import { describe, expect, it } from 'vitest';

import { placeTypeLabel, placeTypeLabels } from './place-types';

describe('placeTypeLabels', () => {
  it('đưa primaryType lên đầu và bỏ type chỉ là nhiễu', () => {
    // Đúng shape Google trả cho một quán cà phê.
    expect(
      placeTypeLabels(
        ['cafe', 'coffee_shop', 'food', 'point_of_interest', 'establishment'],
        'cafe',
      ),
    ).toEqual(['Quán cà phê']);
  });

  it('gộp các type khác key nhưng cùng nghĩa', () => {
    expect(placeTypeLabels(['coffee_shop', 'cafe', 'bakery'])).toEqual([
      'Quán cà phê',
      'Tiệm bánh',
    ]);
  });

  it('map trọn bộ activity type mà /suggest đang dùng', () => {
    expect(
      placeTypeLabels(['restaurant', 'bar', 'pub', 'movie_theater', 'karaoke', 'bowling_alley']),
    ).toEqual(['Nhà hàng', 'Quán bar', 'Quán pub', 'Rạp phim', 'Karaoke', 'Bowling']);
  });

  it('không bao giờ trả snake_case ra client, kể cả type Google mới thêm', () => {
    expect(placeTypeLabel('pickleball_court')).toBe('Pickleball court');
    expect(placeTypeLabels(['shopping_mall', 'point_of_interest'], 'shopping_mall')).toEqual([
      'Trung tâm thương mại',
    ]);
  });

  it('trả rỗng khi place chỉ có type hành chính', () => {
    expect(placeTypeLabels(['political', 'locality', 'geocode'])).toEqual([]);
    expect(placeTypeLabel('point_of_interest')).toBeUndefined();
    expect(placeTypeLabel('  ')).toBeUndefined();
  });
});
