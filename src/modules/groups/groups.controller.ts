import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';
import { GroupsService } from './groups.service';

@ApiTags('groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a group / club (permission-controlled)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.groups.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List / search groups in my school' })
  list(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.groups.list(user, dto);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a group by slug' })
  findOne(@Param('slug') slug: string) {
    return this.groups.findOne(slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a group (managers)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user, id, dto);
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join / request to join a group' })
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.join(user, id);
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a group' })
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.groups.leave(user, id);
  }

  @Post(':id/members/:userId/approve')
  @ApiOperation({ summary: 'Approve a pending member (managers)' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.groups.approveMember(user, id, userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List group members' })
  members(@Param('id') id: string, @Query() dto: PaginationDto) {
    return this.groups.members(id, dto);
  }
}
