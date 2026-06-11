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
import { SendMessageDto, StartConversationDto } from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post()
  @ApiOperation({ summary: 'Start (or fetch) a direct conversation' })
  start(@CurrentUser() user: AuthUser, @Body() dto: StartConversationDto) {
    return this.messaging.startDirect(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my conversations' })
  list(@CurrentUser('id') userId: string, @Query() dto: PaginationDto) {
    return this.messaging.listConversations(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a conversation' })
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messaging.getConversation(userId, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages in a conversation' })
  messages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() dto: PaginationDto,
  ) {
    return this.messaging.listMessages(userId, id, dto);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message' })
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.send(user, id, dto);
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.messaging.markRead(userId, id);
  }
}
