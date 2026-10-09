import './cache-env';

/**
 * Must run before `createApp` / `AppModule` import so ConfigModule.forRoot
 * sees GIT_SHA (Nest reads process.env when the module class is decorated).
 */
process.env.GIT_SHA = 'b09testsha';
