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
      },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.schoolId !== user.schoolId) {
      throw new ForbiddenException('Recipient is in a different school');
    }

    const existing = await this.findDirectConversation(user.id, dto.recipientId);
    if (existing) {
      if (dto.message) {
        await this.send(user, existing.id, { body: dto.message });
      }
      return this.getConversation(user.id, existing.id);
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
    return this.getConversation(user.id, conversation.id);
  }

  async send(user: AuthUser, conversationId: string, dto: SendMessageDto) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: user.id },
      },
      include: { conversation: { include: { members: true } } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not part of this conversation');
    }

    const verdict = canSendInExisting(this.toActor(user));
    if (!verdict.allowed) throw new ForbiddenException(verdict.reason);

    const recipients = membership.conversation.members.filter(
      (m) => m.userId !== user.id,
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
    this.realtime.emitToConversation(conversationId, 'message:new', message);

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

  async listConversations(userId: string, dto: PaginationDto) {
    const where = { members: { some: { userId } } };
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

  async getConversation(userId: string, conversationId: string) {
    await this.requireMember(conversationId, userId);
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { include: { user: MEMBER_CARD } } },
    });
  }

  async listMessages(
    userId: string,
    conversationId: string,
    dto: PaginationDto,
  ) {
    await this.requireMember(conversationId, userId);
    const where = { conversationId, isDeleted: false };
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

  async markRead(userId: string, conversationId: string) {
    await this.requireMember(conversationId, userId);
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
    this.realtime.emitToConversation(conversationId, 'message:read', {
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

  private async requireMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException('You are not part of this conversation');
    }
  }
}
