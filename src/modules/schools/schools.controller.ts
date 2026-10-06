import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { CreateClassDto } from './dto/school.dto';
import { SchoolsService } from './schools.service';

@ApiTags('school')
@Controller('school')
export class SchoolsController {
  constructor(private readonly schools: SchoolsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get this school' })
  current() { return this.schools.currentSchool(); }

  @Public()
  @Get('classes')
  @ApiOperation({ summary: 'List this school’s classes' })
  classes() { return this.schools.listClasses(); }

  @Post('classes')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({ summary: 'Create a class in this school' })
  createClass(@CurrentUser() user: AuthUser, @Body() dto: CreateClassDto) {
    return this.schools.createClass(user, dto);
  }
}
