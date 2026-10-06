import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { School } from '@prisma/client';
import { PrismaService } from './prisma.service';

/** One deployment serves exactly one school; clients cannot select it. */
@Injectable()
export class SchoolContextService implements OnModuleInit {
  private school: School;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async onModuleInit() {
    const configuredId = this.config.get<string>('APP_SCHOOL_ID');
    if (configuredId) {
      const school = await this.prisma.school.findUnique({ where: { id: configuredId } });
      if (!school) throw new Error('APP_SCHOOL_ID does not identify an existing school');
      this.school = school;
    } else {
      const schools = await this.prisma.school.findMany({ take: 2 });
      if (schools.length !== 1) throw new Error('Seed one school or set APP_SCHOOL_ID to the existing school before starting');
      this.school = schools[0];
    }
  }

  get current(): School { return this.school; }
  get id(): string { return this.school.id; }
}
