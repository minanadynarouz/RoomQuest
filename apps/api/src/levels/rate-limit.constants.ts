/** Per-IP POST /api/v1/levels budget (`@nestjs/throttler`), including /result. */
export const IP_RATE_LIMIT = 60;
export const IP_RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Cache-miss budget per `X-Device-Id`. Hits (valid cached plans) do not
 * count. In-memory in this process — resets on restart (Render sleep,
 * deploys). MVP: no Redis.
 */
export const CACHE_MISS_LIMIT = 10;
export const CACHE_MISS_WINDOW_MS = 60 * 60 * 1000;

/**
 * Upper bound on waiting for a cache upsert inside the 7 s whole-request
 * budget. The write continues in the background if this elapses.
 */
export const CACHE_WRITE_MAX_WAIT_MS = 200;
