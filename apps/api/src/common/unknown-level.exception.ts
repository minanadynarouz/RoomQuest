import { HttpException, HttpStatus } from '@nestjs/common';

export interface UnknownLevelBody {
  error: {
    code: 'UNKNOWN_LEVEL';
    message: string;
  };
}

export class UnknownLevelException extends HttpException {
  constructor() {
    const body: UnknownLevelBody = {
      error: {
        code: 'UNKNOWN_LEVEL',
        message: 'Unknown cache key',
      },
    };
    super(body, HttpStatus.NOT_FOUND);
  }
}
