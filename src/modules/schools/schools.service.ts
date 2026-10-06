import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@common/decorators/current-user.decorator';
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

  createClass(user: AuthUser, schoolId: string, dto: CreateClassDto) {
    if (!['ADMIN', 'PRINCIPAL'].includes(user.role)) throw new ForbiddenException('Only school administrators can create classes');
    if (schoolId !== user.schoolId) throw new NotFoundException('School not found');
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
