import { Global, Module } from '@nestjs/common';
import { SchoolContextService } from './school-context.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, SchoolContextService],
  exports: [PrismaService, SchoolContextService],
})
export class PrismaModule {}
