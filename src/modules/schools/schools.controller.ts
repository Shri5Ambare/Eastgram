import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { CreateClassDto, CreateSchoolDto } from './dto/school.dto';
import { SchoolsService } from './schools.service';

@ApiTags('schools')
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List schools (for registration picker)' })
  list() {
    return this.schools.listSchools();
  }

  @Post()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({ summary: 'Create a school (admin)' })
  create(@Body() dto: CreateSchoolDto) {
    return this.schools.createSchool(dto);
  }

  @Public()
  @Get(':id/classes')
  @ApiOperation({ summary: 'List classes in a school' })
  classes(@Param('id') id: string) {
    return this.schools.listClasses(id);
  }

  @Post(':id/classes')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({ summary: 'Create a class (admin)' })
  createClass(@Param('id') id: string, @Body() dto: CreateClassDto) {
    return this.schools.createClass(id, dto);
  }
}
