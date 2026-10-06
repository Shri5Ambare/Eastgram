import { ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { SchoolContextService } from '@/prisma/school-context.service';
import { CreateClassDto } from './dto/school.dto';

@Injectable()
export class SchoolsService {
  constructor(private readonly prisma: PrismaService, private readonly school: SchoolContextService) {}

  currentSchool() { return this.school.current; }

  createClass(user: AuthUser, dto: CreateClassDto) {
    if (!['ADMIN', 'PRINCIPAL'].includes(user.role) || user.schoolId !== this.school.id) {
      throw new ForbiddenException('Only this school’s administrators can create classes');
    }
    return this.prisma.schoolClass.create({ data: { ...dto, schoolId: this.school.id } });
  }

  listClasses() {
    return this.prisma.schoolClass.findMany({ where: { schoolId: this.school.id }, orderBy: { name: 'asc' } });
  }
}
