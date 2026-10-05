import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { FollowsService } from './follows.service';

@ApiTags('follows')
@ApiBearerAuth()
@Controller()
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post('users/:username/follow')
  @ApiOperation({ summary: 'Follow a user (request if private)' })
  follow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ) {
    return this.follows.follow(user, username);
  }

  @Delete('users/:username/follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ) {
    return this.follows.unfollow(user, username);
  }

  @Get('users/:username/followers')
  @ApiOperation({ summary: 'List a user followers' })
  followers(@CurrentUser() user: AuthUser, @Param('username') username: string, @Query() dto: PaginationDto) {
    return this.follows.followers(user, username, dto);
  }

  @Get('users/:username/following')
  @ApiOperation({ summary: 'List who a user follows' })
  following(@CurrentUser() user: AuthUser, @Param('username') username: string, @Query() dto: PaginationDto) {
    return this.follows.following(user, username, dto);
  }

  @Get('follow-requests')
  @ApiOperation({ summary: 'List my pending follow requests' })
  requests(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.follows.pendingRequests(user, dto);
  }

  @Post('follow-requests/:followerId/accept')
  @ApiOperation({ summary: 'Accept a pending follow request' })
  accept(
    @CurrentUser() user: AuthUser,
    @Param('followerId') followerId: string,
  ) {
    return this.follows.acceptRequest(user, followerId);
  }
}
