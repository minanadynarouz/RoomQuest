import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { JSON_BODY_LIMIT_BYTES } from './common/constants';
import { isAllowedOrigin, parseCorsOrigins } from './common/cors';
import type { Env } from './config/env';

function payloadLimitHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const raw = req.headers['content-length'];
  if (raw === undefined) {
    next();
    return;
  }
  const length = Number.parseInt(raw, 10);
  if (Number.isFinite(length) && length > JSON_BODY_LIMIT_BYTES) {
    res.status(413).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body exceeds 16 KB limit',
      },
    });
    return;
  }
  next();
}

function isEntityTooLarge(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  return 'type' in err && err.type === 'entity.too.large';
}

function bodyParserErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isEntityTooLarge(err)) {
    res.status(413).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body exceeds 16 KB limit',
      },
    });
    return;
  }

  if (err instanceof SyntaxError) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Invalid JSON body',
        issues: [],
      },
    });
    return;
  }

  next(err);
}

export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Env, true>);
  const allowlist = parseCorsOrigins(
    config.get('CORS_ORIGINS', { infer: true })
  );

  app.use(
    helmet({
      // JSON API consumed by the Vite client on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(payloadLimitHandler);
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT_BYTES });
  app.use(bodyParserErrorHandler);

  app.setGlobalPrefix('api');
  // Render (and other reverse proxies) set X-Forwarded-For. Needed so the
  // per-IP throttler sees the client, not the proxy.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (origin === undefined || origin.length === 0) {
        callback(null, true);
        return;
      }
      callback(null, isAllowedOrigin(origin, allowlist));
    },
    allowedHeaders: [
      'Content-Type',
      'X-Device-Id',
      'X-Client-Version',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    methods: ['GET', 'POST', 'OPTIONS'],
    maxAge: 600,
  });
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  return app;
}
