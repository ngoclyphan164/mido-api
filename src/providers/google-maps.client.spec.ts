import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GoogleMapsClient,
  GoogleMapsConfigurationError,
  GoogleMapsHttpError,
} from './google-maps.client';

describe('GoogleMapsClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('gửi API key trong header và parse JSON mà không đưa secret vào URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GoogleMapsClient(
      new ConfigService({ GOOGLE_MAPS_API_KEY: 'fixture-key-at-least-20-chars' }),
    );

    await expect(
      client.postJson('https://maps.example/search', 'places.id', { maxResultCount: 1 }),
    ).resolves.toEqual({ places: [] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://maps.example/search');
    expect(init.headers).toMatchObject({
      'X-Goog-Api-Key': 'fixture-key-at-least-20-chars',
      'X-Goog-FieldMask': 'places.id',
    });
  });

  it('getJson đưa query vào URL nhưng vẫn giữ API key trong header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ photoUri: 'https://lh3/photo' })));
    vi.stubGlobal('fetch', fetchMock);
    const client = new GoogleMapsClient(
      new ConfigService({ GOOGLE_MAPS_API_KEY: 'fixture-key-at-least-20-chars' }),
    );

    await expect(
      client.getJson('https://maps.example/media', { maxWidthPx: 800, skipHttpRedirect: true }),
    ).resolves.toEqual({ photoUri: 'https://lh3/photo' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://maps.example/media?maxWidthPx=800&skipHttpRedirect=true');
    expect(url).not.toContain('fixture-key');
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'fixture-key-at-least-20-chars' });
  });

  it('fail rõ ràng trước network khi API key chưa cấu hình', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new GoogleMapsClient(new ConfigService());

    await expect(client.postJson('https://maps.example', 'places.id', {})).rejects.toBeInstanceOf(
      GoogleMapsConfigurationError,
    );
    await expect(client.getJson('https://maps.example/media')).rejects.toBeInstanceOf(
      GoogleMapsConfigurationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('đánh dấu 429 là retryable để circuit breaker tính lỗi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('quota exceeded', { status: 429 })),
    );
    const client = new GoogleMapsClient(
      new ConfigService({ GOOGLE_MAPS_API_KEY: 'fixture-key-at-least-20-chars' }),
    );

    const error = await client
      .postJson('https://maps.example', 'places.id', {})
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(GoogleMapsHttpError);
    expect(error).toMatchObject({ status: 429, retryable: true });
  });
});
