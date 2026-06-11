import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { CreatePollDto, VoteDto } from './dto/poll.dto';
import { PollsService } from './polls.service';

@ApiTags('polls')
@ApiBearerAuth()
@Controller('polls')
export class PollsController {
  constructor(private readonly polls: PollsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a poll, election or Miss/Mister pageant vote',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePollDto) {
    return this.polls.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List polls in my school' })
  list(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.polls.list(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a poll (with my votes)' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.polls.findOne(user, id);
  }

  @Post(':id/vote')
  @ApiOperation({ summary: 'Cast a vote' })
  vote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VoteDto,
  ) {
    return this.polls.vote(user, id, dto);
  }

  @Get(':id/results')
  @ApiOperation({ summary: 'Get poll results / tally' })
  results(@Param('id') id: string) {
    return this.polls.results(id);
  }

  @Post(':id/open')
  @ApiOperation({ summary: 'Open a poll for voting (creator/staff)' })
  open(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.polls.open(user, id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close a poll (creator/staff)' })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.polls.close(user, id);
  }
}
