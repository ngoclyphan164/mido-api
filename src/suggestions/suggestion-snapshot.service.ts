import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  PLACE_DETAILS_PROVIDER,
  type PlaceDetailsProvider,
} from '../places/place-details-provider';
import { PLACE_PHOTO_PROVIDER, type PlacePhotoProvider } from '../places/place-photo-provider';
import { placeTypeLabels } from '../places/place-types';
import {
  SuggestionSnapshotRepository,
  type StoredTravelTime,
  type SuggestionSnapshotRow,
  type PickerView,
} from './suggestion-snapshot.repository';

/**
 * `photoUri` của Google sống được vài phút. Giữ lại trong khoảng ngắn hơn thế
 * để mở đi mở lại không tốn thêm request Place Photo, nhưng client không bao
 * giờ nhận về link đã chết.
 */
const PHOTO_URI_REUSE_MS = 5 * 60 * 1000;

export type StoredSuggestionPage = {
  suggestions: StoredSuggestionView[];
  /** Tổng option đang active, để client biết khi nào phải quay vòng. */
  total: number;
  offset: number;
};

export type StoredSuggestionView = {
  suggestionId: string;
  id: string;
  provider: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  primaryType?: string;
  types: string[];
  primaryTypeLabel?: string;
  typeLabels: string[];
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  mapsUri?: string;
  images: string[];
  availability: string;
  score?: number;
  scoreBreakdown?: unknown;
  travelTimes: StoredTravelTime[];
  /** Ai đã tick chọn quán này. Rỗng thì bỏ hẳn field. */
  pickedBy?: PickerView[];
  /** Khi nào nội dung này được đọc từ provider. */
  fetchedAt: string;
};

/**
 * Đọc lại nội dung provider đã lưu, thay cho việc gọi `/suggest` lần hai.
 *
 * Đây là chỗ duy nhất trong API cố ý giữ nội dung Places/Routes lâu dài — xem
 * chú thích của bảng `suggestion_places` trong `database/schema.ts`.
 */
@Injectable()
export class SuggestionSnapshotService {
  private readonly logger = new Logger(SuggestionSnapshotService.name);

  constructor(
    private readonly repository: SuggestionSnapshotRepository,
    @Inject(PLACE_DETAILS_PROVIDER)
    private readonly detailsProvider: PlaceDetailsProvider,
    @Inject(PLACE_PHOTO_PROVIDER)
    private readonly photoProvider: PlacePhotoProvider,
  ) {}

  /**
   * Đường đọc lại cho client: trả danh sách đã lưu, hoặc rỗng nếu kèo chưa từng
   * suggest. Rỗng là tín hiệu cho client biết phải gọi `POST /suggest`.
   */
  async listForMember(
    hangoutId: string,
    userId: string,
    offset = 0,
    limit = 5,
  ): Promise<StoredSuggestionPage> {
    if (!(await this.repository.isHangoutMember(hangoutId, userId))) {
      throw new NotFoundException('Hangout not found, or you are not a member of its group');
    }
    return this.listForHangout(hangoutId, offset, limit);
  }

  /**
   * Một option cụ thể. Màn chi tiết cần đường riêng vì danh sách được phân
   * trang — option đang xem có thể không nằm ở trang đầu.
   */
  async getForMember(
    hangoutId: string,
    suggestionId: string,
    userId: string,
  ): Promise<StoredSuggestionView> {
    if (!(await this.repository.isHangoutMember(hangoutId, userId))) {
      throw new NotFoundException('Hangout not found, or you are not a member of its group');
    }

    const row = await this.repository.findBySuggestion(suggestionId);
    if (!row || row.hangoutId !== hangoutId) {
      throw new NotFoundException('Suggestion not found in this hangout');
    }

    const pickers = await this.repository.pickers([suggestionId]);
    return this.toView(row, pickers.get(suggestionId));
  }

  /**
   * Danh sách option đã lưu của một kèo, kèm người đã tick từng quán. Không
   * bao giờ throw: đây là đường đọc lại, hỏng thì client quay về gọi `/suggest`.
   */
  async listForHangout(hangoutId: string, offset = 0, limit = 5): Promise<StoredSuggestionPage> {
    try {
      const rows = await this.repository.listActiveForHangout(hangoutId, offset, limit);
      if (rows.length === 0) {
        return {
          suggestions: [],
          total: await this.repository.countActiveForHangout(hangoutId),
          offset,
        };
      }

      const [pickers, total] = await Promise.all([
        this.repository.pickers(rows.map((row) => row.suggestionId)),
        this.repository.countActiveForHangout(hangoutId),
      ]);

      return {
        suggestions: await Promise.all(
          rows.map((row) => this.toView(row, pickers.get(row.suggestionId))),
        ),
        total,
        offset,
      };
    } catch (error) {
      this.logger.error(
        `Could not read stored suggestions for hangout ${hangoutId}: ${this.reason(error)}`,
      );
      return { suggestions: [], total: 0, offset };
    }
  }

  /**
   * Địa điểm đã chốt, để đính vào chi tiết kèo. Kèo chốt trước khi có bảng này
   * chưa có snapshot, nên lần đọc đầu tiên tự lấp — không phải backfill tay.
   *
   * Không bao giờ throw: địa điểm là phần thêm vào chi tiết kèo, chưa chạy
   * migration hay Google chết cũng không được kéo sập cả `GET /hangouts/:id`.
   */
  async getChosenForHangout(hangoutId: string): Promise<StoredSuggestionView | undefined> {
    try {
      const existing = await this.repository.findChosenForHangout(hangoutId);
      if (existing) return await this.toView(existing);

      const captured = await this.captureChosen(hangoutId);
      return captured ? await this.toView(captured) : undefined;
    } catch (error) {
      this.logger.error(
        `Could not read the decided place for hangout ${hangoutId}: ${this.reason(error)}`,
      );
      return undefined;
    }
  }

  /**
   * Lấp snapshot cho kèo đã chốt từ trước khi bảng này tồn tại: đọc lại nội
   * dung từ place ID rồi ghi vào đúng hàng của option đã chốt. `travelTimes`
   * để rỗng — số phút ước tính của lần suggest đó đã mất.
   *
   * Best-effort và không throw: kèo đã nằm trong DB rồi, một lỗi ở đây không
   * được biến một lần chốt thành công thành 500 ở client.
   */
  async captureChosen(hangoutId: string): Promise<SuggestionSnapshotRow | undefined> {
    try {
      const ref = await this.repository.findChosenPlaceRef(hangoutId);
      if (!ref) return undefined;

      const details = await this.detailsProvider.getDetails(ref.externalPlaceId);
      if (!details) {
        this.logger.warn(`Could not capture a place snapshot for hangout ${hangoutId}`);
        return undefined;
      }

      await this.repository.saveMany([
        {
          suggestionId: ref.suggestionId,
          provider: details.provider,
          externalPlaceId: details.externalId,
          name: details.name,
          address: details.address,
          location: details.location,
          primaryType: details.primaryType,
          types: details.types,
          rating: details.rating,
          userRatingCount: details.userRatingCount,
          priceLevel: details.priceLevel,
          mapsUri: details.mapsUri ?? details.googleMapsUri,
          photoNames: (details.photos ?? []).map((photo) => photo.name),
          availability: 'unknown',
          travelTimes: [],
        },
      ]);

      return await this.repository.findChosenForHangout(hangoutId);
    } catch (error) {
      this.logger.error(
        `Could not store the place snapshot for hangout ${hangoutId}: ${this.reason(error)}`,
      );
      return undefined;
    }
  }

  private async toView(
    row: SuggestionSnapshotRow,
    pickedBy?: PickerView[],
  ): Promise<StoredSuggestionView> {
    const typeLabels = placeTypeLabels(row.types, row.primaryType ?? undefined);
    return {
      suggestionId: row.suggestionId,
      id: row.externalPlaceId,
      provider: row.provider,
      name: row.name,
      address: row.formattedAddress ?? undefined,
      location: { lat: row.lat, lng: row.lng },
      primaryType: row.primaryType ?? undefined,
      types: row.types,
      primaryTypeLabel: typeLabels[0],
      typeLabels,
      rating: row.rating === null ? undefined : Number(row.rating),
      userRatingCount: row.userRatingCount ?? undefined,
      priceLevel: row.priceLevel ?? undefined,
      mapsUri: row.mapsUri ?? undefined,
      images: await this.resolveImages(row),
      availability: row.availability,
      score: row.score === null ? undefined : Number(row.score),
      scoreBreakdown: row.scoreBreakdown ?? undefined,
      travelTimes: Array.isArray(row.travelTimes) ? (row.travelTimes as StoredTravelTime[]) : [],
      pickedBy: pickedBy?.length ? pickedBy : undefined,
      fetchedAt: row.fetchedAt.toISOString(),
    };
  }

  /** Chỉ ảnh đầu, giống `/suggest` — mỗi ảnh là một request Place Photo. */
  private async resolveImages(row: SuggestionSnapshotRow): Promise<string[]> {
    const first = row.photoNames[0];
    if (!first) return [];

    const stillValid =
      row.photoUri !== null &&
      row.photoUriFetchedAt !== null &&
      Date.now() - row.photoUriFetchedAt.getTime() < PHOTO_URI_REUSE_MS;
    if (stillValid) return [row.photoUri!];

    const uri = await this.photoProvider.resolvePhotoUri({ name: first });
    await this.repository.savePhotoUri(row.id, uri ?? null);
    return uri ? [uri] : [];
  }

  private reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
