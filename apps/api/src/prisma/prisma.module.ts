import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Always imported. PrismaService is a no-op when DATABASE_URL is unset, so
 * the API boots and `/levels` mock mode keeps working without a database.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PrismaModule {}
