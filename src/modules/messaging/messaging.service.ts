import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConversationType,
  NotificationType,
  Role,
} from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeService } from '@/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { readableConversationWhere } from './conversation-access.policy';
import { SendMessageDto, StartConversationDto } from './dto/messaging.dto';
import {
  canInitiateConversation,
  canSendInExisting,
  MessagingActor,
} from './messaging.permissions';

const MEMBER_CARD = {
  select: {
    id: true,
    username: true,
    fullName: true,
    avatarUrl: true,
    role: true,
  },
};

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Start (or fetch existing) direct conversation, enforcing messaging rules. */
  async startDirect(user: AuthUser, dto: StartConversationDto) {
    if (dto.recipientId === user.id) {
      throw new ForbiddenException('Cannot message yourself');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId },
      select: {
        id: true,
        role: true,
        classId: true,
        messagePermission: true,
        schoolId: true,
        status: true,
      },
    });
    if (!recipient || recipient.status !== 'ACTIVE') throw new NotFoundException('Recipient not found');
    if (recipient.schoolId !== user.schoolId) {
      throw new ForbiddenException('Recipient is in a different school');
    }

    const existing = await this.findDirectConversation(user.id, dto.recipientId);
    if (existing) {
      if (dto.message) {
        await this.send(user, existing.id, { body: dto.message });
      }
      return this.getConversation(user, existing.id);
    }

    // No existing thread — enforce initiation permission.
    const verdict = canInitiateConversation(
      this.toActor(user),
      recipient as MessagingActor,
    );
    if (!verdict.allowed) {
      throw new ForbiddenException(verdict.reason);
    }

    const conversation = await this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        members: {
          create: [{ userId: user.id }, { userId: dto.recipientId }],
        },
      },
    });

    // Subscribe both users' sockets to the new conversation room.
    this.realtime.joinConversation(user.id, conversation.id);
    this.realtime.joinConversation(dto.recipientId, conversation.id);

    if (dto.message) {
      await this.send(user, conversation.id, { body: dto.message });
    }
    return this.getConversation(user, conversation.id);
  }

  async send(user: AuthUser, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.requireMember(conversationId, user);
    if (dto.mediaId && !await this.prisma.media.findFirst({ where: { id: dto.mediaId, ownerId: user.id }, select: { id: true } })) {
      throw new NotFoundException('Attachment not found');
    }
    if (dto.replyToId && !await this.prisma.message.findFirst({ where: { id: dto.replyToId, conversationId, isDeleted: false }, select: { id: true } })) {
      throw new NotFoundException('Reply message not found');
    }

    const verdict = canSendInExisting(this.toActor(user));
    if (!verdict.allowed) throw new ForbiddenException(verdict.reason);

    const recipients = conversation.members.filter(m =>
      m.userId !== user.id && m.user.status === 'ACTIVE' &&
      (!conversation.group || conversation.group.members.some(g => g.userId === m.userId)),
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: user.id,
        body: dto.body,
        mediaId: dto.mediaId,
        replyToId: dto.replyToId,
        receipts: {
          create: recipients.map((r) => ({ userId: r.userId })),
        },
      },
      include: { sender: MEMBER_CARD },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Realtime fan-out to the conversation room.
    await this.realtime.emitToConversation(conversationId, 'message:new', message);

    // Push + persisted notification for offline recipients.
    await this.notifications.notifyMany(
      recipients.map((r) => r.userId),
      {
        actorId: user.id,
        type: NotificationType.MESSAGE,
        title: 'New message',
        body: dto.body?.slice(0, 120) ?? 'Sent an attachment',
        data: { conversationId, messageId: message.id },
      },
    );

    return message;
  }

  async listConversations(user: AuthUser, dto: PaginationDto) {
    const where = readableConversationWhere(user);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: {
          members: { include: { user: MEMBER_CARD } },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { sender: MEMBER_CARD },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async getConversation(user: AuthUser, conversationId: string) {
    await this.requireMember(conversationId, user);
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { user: MEMBER_CARD } } },
    });
  }

  async listMessages(
    user: AuthUser,
    conversationId: string,
    dto: PaginationDto,
  ) {
    await this.requireMember(conversationId, user);
    const where = { conversationId, isDeleted: false, sender: { schoolId: user.schoolId } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        include: { sender: MEMBER_CARD },
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.message.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async markRead(user: AuthUser, conversationId: string) {
    const userId = user.id;
    await this.requireMember(conversationId, user);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now },
      }),
      this.prisma.messageReceipt.updateMany({
        where: { userId, readAt: null, message: { conversationId } },
        data: { readAt: now },
      }),
    ]);
    await this.realtime.emitToConversation(conversationId, 'message:read', {
      conversationId,
      userId,
      readAt: now,
    });
    return { success: true };
  }

  // ───────────────────────── helpers ─────────────────────────

  private toActor(user: AuthUser): MessagingActor {
    return {
      id: user.id,
      role: user.role as Role,
      classId: user.classId,
      messagePermission: user.messagePermission as any,
    };
  }

  private async findDirectConversation(a: string, b: string) {
    return this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { members: { some: { userId: a } } },
          { members: { some: { userId: b } } },
        ],
      },
      select: { id: true },
    });
  }

  private async requireMember(conversationId: string, user: AuthUser) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { AND: [{ id: conversationId }, readableConversationWhere(user)] },
      include: {
        members: { include: { user: { select: { status: true } } } },
        group: { include: { members: { where: { isApproved: true }, select: { userId: true } } } },
      },
    });
    if (!conversation) throw new ForbiddenException('You are not part of this conversation');
    return conversation;
  }
}
