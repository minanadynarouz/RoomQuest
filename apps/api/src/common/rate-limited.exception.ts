import { HttpException, HttpStatus } from '@nestjs/common';

export interface RateLimitedBody {
  error: {
    code: 'RATE_LIMITED';
    message: string;
    retryAfterS: number;
  };
}

export class RateLimitedException extends HttpException {
  readonly retryAfterS: number;

  constructor(retryAfterS: number) {
    const seconds = Math.max(0, Math.ceil(retryAfterS));
    const body: RateLimitedBody = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        retryAfterS: seconds,
      },
    };
    super(body, HttpStatus.TOO_MANY_REQUESTS);
    this.retryAfterS = seconds;
  }
}
