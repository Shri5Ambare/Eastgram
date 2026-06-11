import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateClassDto, CreateSchoolDto } from './dto/school.dto';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService) {}

  createSchool(dto: CreateSchoolDto) {
    return this.prisma.school.create({ data: dto });
  }

  listSchools() {
    return this.prisma.school.findMany({ orderBy: { name: 'asc' } });
  }

  createClass(schoolId: string, dto: CreateClassDto) {
    return this.prisma.schoolClass.create({
      data: { schoolId, ...dto },
    });
  }

  listClasses(schoolId: string) {
    return this.prisma.schoolClass.findMany({
      where: { schoolId },
      orderBy: { name: 'asc' },
    });
  }
}
