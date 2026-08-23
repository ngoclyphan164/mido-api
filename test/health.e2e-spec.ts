import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('mido-api (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    // Phải khớp với cấu hình trong src/main.ts, nếu lệch thì test sẽ nói dối
    app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health nằm ngoài prefix v1', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toMatchObject({ status: 'ok', service: 'mido-api' });
  });

  it('GET /v1/health không tồn tại — health cố tình bị loại khỏi prefix', async () => {
    await request(app.getHttpServer()).get('/v1/health').expect(404);
  });

  it('route cron bị chặn khi không có Authorization đúng', async () => {
    const res = await request(app.getHttpServer()).get('/v1/cron/prune-cache').expect(401);

    expect(res.body.statusCode).toBe(401);
  });

  it('lỗi trả về theo đúng shape của AllExceptionsFilter', async () => {
    const res = await request(app.getHttpServer()).get('/khong-ton-tai').expect(404);

    expect(res.body).toMatchObject({ statusCode: 404, path: '/khong-ton-tai' });
    expect(typeof res.body.timestamp).toBe('string');
  });
});
