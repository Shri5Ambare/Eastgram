import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { AdminUpdateUserDto, UpdateProfileDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my own profile' })
  me(@CurrentUser('id') userId: string) {
    return this.users.me(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List / search users in my school' })
  list(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.users.list(user.schoolId, dto);
  }

  @Get(':username')
  @ApiOperation({ summary: 'Get a user profile by username' })
  profile(
    @Param('username') username: string,
    @CurrentUser('id') viewerId: string,
  ) {
    return this.users.getProfile(username, viewerId);
  }

  @Patch(':id/admin')
  @Roles(Role.ADMIN, Role.PRINCIPAL)
  @ApiOperation({
    summary: 'Admin/Principal: set role, status, messaging permission',
  })
  adminUpdate(@Param('id') id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.adminUpdate(id, dto);
  }
}
