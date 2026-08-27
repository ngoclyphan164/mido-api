import type { PlacePhotoRef } from './places-provider';

export const PLACE_PHOTO_PROVIDER = Symbol('PLACE_PHOTO_PROVIDER');

export interface PlacePhotoProvider {
  /**
   * Đổi photo reference thành URL ảnh dùng được ngay ở client.
   * Trả `undefined` khi provider không lấy được ảnh — ảnh là phần trang trí,
   * không được làm hỏng cả response `/suggest`.
   */
  resolvePhotoUri(photo: PlacePhotoRef): Promise<string | undefined>;
}
