import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AchievementsService } from './achievements.service';
import {
  AwardAchievementDto,
  CreateAchievementDto,
} from './dto/achievement.dto';

@ApiTags('achievements')
@ApiBearerAuth()
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Post('catalog')
  @Roles(Role.TEACHER, Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({ summary: 'Define a new achievement type (staff)' })
  createCatalog(@CurrentUser() user: AuthUser, @Body() dto: CreateAchievementDto) {
    return this.achievements.createCatalog(user, dto);
  }

  @Get('catalog')
  @ApiOperation({ summary: 'List achievement catalog' })
  listCatalog(@Query() dto: PaginationDto) {
    return this.achievements.listCatalog(dto);
  }

  @Post('award')
  @Roles(Role.TEACHER, Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({ summary: 'Award an achievement to a student (staff)' })
  award(@CurrentUser() user: AuthUser, @Body() dto: AwardAchievementDto) {
    return this.achievements.award(user, dto);
  }

  @Get('users/:username')
  @ApiOperation({ summary: 'List a user achievements' })
  userAchievements(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
    @Query() dto: PaginationDto,
  ) {
    return this.achievements.userAchievements(user, username, dto);
  }
}
