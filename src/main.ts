/**
 * Vercel tự phát hiện NestJS qua đúng file này (`src/main.ts`) và biến cả app
 * thành một Vercel Function chạy trên Fluid compute. Không cần wrapper
 * `api/index.ts` như các hướng dẫn cũ — và đừng đổi tên/đường dẫn file này.
 */
import 'reflect-metadata';

import { Logger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ZodValidationPipe } from 'nestjs-zod';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

function shouldExposeDocs(): boolean {
  // Bật trên local và trên preview deployment, tắt trên production
  return process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet({ contentSecurityPolicy: false }));

  app.enableCors({
    origin: config.get<string[]>('ALLOWED_ORIGINS') ?? '*',
    credentials: true,
  });

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: '/', method: RequestMethod.GET },
    ],
  });

  // Validation đi qua Zod (nestjs-zod) chứ không phải class-validator, để khi
  // Nest v12 hỗ trợ Standard Schema native thì gần như không phải sửa gì.
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (shouldExposeDocs()) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('mido API')
        .setDescription('Tìm điểm hẹn ở giữa cho nhóm bạn')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs/json' });
  }

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  logger.log(`mido-api đang chạy tại ${await app.getUrl()}`);
  if (shouldExposeDocs()) logger.log('Swagger: /docs');
}

void bootstrap();
