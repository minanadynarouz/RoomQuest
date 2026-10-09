import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env';
import { createApp } from './create-app';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
}

void bootstrap();
