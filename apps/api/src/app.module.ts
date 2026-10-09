import { Module, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { validateEnv, type Env } from './config/env';
import { HealthModule } from './health/health.module';
import { LevelsModule } from './levels/levels.module';

function requestIdFrom(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  const first = Array.isArray(header) ? header[0] : undefined;
  if (typeof first === 'string' && first.length > 0) {
    return first;
  }
  return randomUUID();
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (config: Record<string, unknown>) => validateEnv(config),
      envFilePath: ['.env', '../../.env'],
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        const pinoHttp: Options = {
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = requestIdFrom(req);
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: {
            paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
          },
          level:
            nodeEnv === 'test'
              ? 'silent'
              : nodeEnv === 'production'
                ? 'info'
                : 'debug',
        };
        if (nodeEnv === 'development') {
          pinoHttp.transport = {
            target: 'pino-pretty',
            options: { colorize: true, singleLine: true },
          };
        }
        return {
          pinoHttp,
          forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
        };
      },
    }),
    HealthModule,
    LevelsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
