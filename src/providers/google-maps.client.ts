import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class GoogleMapsConfigurationError extends Error {
  constructor() {
    super('GOOGLE_MAPS_API_KEY chưa được cấu hình');
    this.name = 'GoogleMapsConfigurationError';
  }
}

export class GoogleMapsHttpError extends Error {
  readonly retryable: boolean;

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleMapsHttpError';
    this.retryable = status === 429 || status >= 500;
  }
}

type QueryValue = string | number | boolean | undefined;

@Injectable()
export class GoogleMapsClient {
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_MAPS_API_KEY');
    this.timeoutMs = config.get<number>('GOOGLE_MAPS_TIMEOUT_MS') ?? 8_000;
  }

  async postJson(url: string, fieldMask: string, body: unknown): Promise<unknown> {
    return this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.requireApiKey(),
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
    });
  }

  /** Place Details (New) là GET nhưng vẫn bắt buộc field mask như các endpoint POST. */
  async getJsonWithFieldMask(url: string, fieldMask: string): Promise<unknown> {
    return this.request(url, {
      headers: {
        Accept: 'application/json',
        'X-Goog-Api-Key': this.requireApiKey(),
        'X-Goog-FieldMask': fieldMask,
      },
    });
  }

  /** Dùng cho endpoint REST không nhận field mask, ví dụ Place Photo (New). */
  async getJson(url: string, query: Record<string, QueryValue> = {}): Promise<unknown> {
    const target = new URL(url);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }

    return this.request(target.toString(), {
      headers: { Accept: 'application/json', 'X-Goog-Api-Key': this.requireApiKey() },
    });
  }

  private requireApiKey(): string {
    if (!this.apiKey) throw new GoogleMapsConfigurationError();
    return this.apiKey;
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'network error';
      throw new GoogleMapsHttpError(503, `Google Maps request failed: ${message}`);
    }

    if (!response.ok) {
      const payload = await response.text();
      throw new GoogleMapsHttpError(
        response.status,
        `Google Maps returned ${response.status}: ${payload.slice(0, 500)}`,
      );
    }

    const payload: unknown = await response.json();
    return payload;
  }
}
