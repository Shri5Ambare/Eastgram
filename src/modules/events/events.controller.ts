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
import { CreateEventDto, RsvpDto, UpdateEventDto } from './dto/event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@ApiBearerAuth()
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an event (permission-controlled)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.events.create(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List upcoming events' })
  list(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.events.list(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an event' })
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an event (organizer/staff)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(user, id, dto);
  }

  @Post(':id/rsvp')
  @ApiOperation({ summary: 'RSVP to an event' })
  rsvp(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RsvpDto,
  ) {
    return this.events.rsvp(user, id, dto);
  }

  @Get(':id/attendees')
  @ApiOperation({ summary: 'List event attendees' })
  attendees(@Param('id') id: string, @Query() dto: PaginationDto) {
    return this.events.attendees(id, dto);
  }
}
