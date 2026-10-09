import { Module } from '@nestjs/common';
import { DirectorService } from './director.service';
import {
  defaultDirectorChatFactory,
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
} from './models';

@Module({
  providers: [
    {
      provide: DIRECTOR_CHAT_FACTORY,
      useValue: defaultDirectorChatFactory,
    },
    {
      provide: DIRECTOR_RUNTIME,
      useValue: {},
    },
    DirectorService,
  ],
  exports: [DirectorService, DIRECTOR_CHAT_FACTORY, DIRECTOR_RUNTIME],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DirectorModule {}
