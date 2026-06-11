import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
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
    @CurrentUser('id') userId: string,
    @Param('username') username: string,
  ) {
    return this.follows.follow(userId, username);
  }

  @Delete('users/:username/follow')
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(
    @CurrentUser('id') userId: string,
    @Param('username') username: string,
  ) {
    return this.follows.unfollow(userId, username);
  }

  @Get('users/:username/followers')
  @ApiOperation({ summary: 'List a user followers' })
  followers(@Param('username') username: string, @Query() dto: PaginationDto) {
    return this.follows.followers(username, dto);
  }

  @Get('users/:username/following')
  @ApiOperation({ summary: 'List who a user follows' })
  following(@Param('username') username: string, @Query() dto: PaginationDto) {
    return this.follows.following(username, dto);
  }

  @Get('follow-requests')
  @ApiOperation({ summary: 'List my pending follow requests' })
  requests(@CurrentUser('id') userId: string, @Query() dto: PaginationDto) {
    return this.follows.pendingRequests(userId, dto);
  }

  @Post('follow-requests/:followerId/accept')
  @ApiOperation({ summary: 'Accept a pending follow request' })
  accept(
    @CurrentUser('id') userId: string,
    @Param('followerId') followerId: string,
  ) {
    return this.follows.acceptRequest(userId, followerId);
  }
}
