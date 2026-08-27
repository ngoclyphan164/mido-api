import type { PlaceCandidate } from './places-provider';

export const PLACE_DETAILS_PROVIDER = Symbol('PLACE_DETAILS_PROVIDER');

export interface PlaceDetailsProvider {
  /**
   * Đọc lại nội dung của một place từ ID đã lưu. Trả `undefined` khi provider
   * không còn place đó (Google xoá hoặc merge place ID vẫn xảy ra) — caller
   * phải chịu được việc thiếu nội dung chứ không được fail cả request.
   */
  getDetails(externalPlaceId: string): Promise<PlaceCandidate | undefined>;
}
