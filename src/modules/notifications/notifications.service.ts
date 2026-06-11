import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RealtimeService } from '@/realtime/realtime.service';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { FcmService } from './fcm.service';

export interface NotifyInput {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Prisma.InputJsonValue;
  push?: boolean; // also send FCM push (default true)
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Central entry point used across the app to deliver a notification through
   *  three channels: persisted row, realtime socket event, and FCM push. */
  async notify(input: NotifyInput) {
    if (input.recipientId === input.actorId) return; // never self-notify

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        actorId: input.actorId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
      },
    });

    this.realtime.emitToUser(input.recipientId, 'notification:new', notification);

    if (input.push !== false) {
      await this.fcm.sendToUser(input.recipientId, {
        title: input.title,
        body: input.body,
        data: { type: input.type, notificationId: notification.id },
      });
    }

    return notification;
  }

  /** Fan-out the same notification to many recipients (events, announcements). */
  async notifyMany(recipientIds: string[], input: Omit<NotifyInput, 'recipientId'>) {
    await Promise.all(
      recipientIds.map((recipientId) => this.notify({ ...input, recipientId })),
    );
  }

  async list(userId: string, dto: PaginationDto) {
    const where = { recipientId: userId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: {
          actor: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, recipientId: userId },
      data: { isRead: true },
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  async registerDevice(
    userId: string,
    dto: { fcmToken: string; platform?: string },
  ) {
    return this.prisma.device.upsert({
      where: { fcmToken: dto.fcmToken },
      create: { userId, fcmToken: dto.fcmToken, platform: dto.platform },
      update: { userId, platform: dto.platform, lastUsedAt: new Date() },
    });
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.device.deleteMany({
      where: { userId, fcmToken: token },
    });
    return { success: true };
  }
}
