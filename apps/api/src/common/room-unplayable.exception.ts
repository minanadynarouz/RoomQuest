import { HttpException, HttpStatus } from '@nestjs/common';

export interface RoomUnplayableBody {
  error: {
    code: 'ROOM_UNPLAYABLE';
    message: string;
  };
}

export class RoomUnplayableException extends HttpException {
  constructor() {
    const body: RoomUnplayableBody = {
      error: {
        code: 'ROOM_UNPLAYABLE',
        message: 'Room cannot produce a valid plan even with relaxed rules',
      },
    };
    super(body, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
