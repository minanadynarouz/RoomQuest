import {
  Injectable,
  type ExecutionContext,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import { RateLimitedException } from '../common/rate-limited.exception';

/**
 * Per-IP `@nestjs/throttler` guard that maps 429s onto the architecture
 * envelope `{error:{code:"RATE_LIMITED", retryAfterS}}` plus `Retry-After`.
 */
@Injectable()
export class IpThrottlerGuard extends ThrottlerGuard {
  protected throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail
  ): Promise<void> {
    const retryAfterS = Math.max(
      1,
      throttlerLimitDetail.timeToBlockExpire > 0
        ? throttlerLimitDetail.timeToBlockExpire
        : throttlerLimitDetail.timeToExpire
    );
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, 'Retry-After', retryAfterS);
    throw new RateLimitedException(retryAfterS);
  }
}
