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

@Injectable()
export class GoogleMapsClient {
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GOOGLE_MAPS_API_KEY');
    this.timeoutMs = config.get<number>('GOOGLE_MAPS_TIMEOUT_MS') ?? 8_000;
  }

  async postJson(url: string, fieldMask: string, body: unknown): Promise<unknown> {
    if (!this.apiKey) throw new GoogleMapsConfigurationError();

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
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
