import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { PrismaService } from '@/prisma/prisma.service';

/** Delivery checks current account and club state; stale socket rooms grant no access. */
@Injectable()
export class RealtimeService {
  private server?: Server;
  private readonly logger = new Logger(RealtimeService.name);
  constructor(private readonly prisma: PrismaService) {}

  bind(server: Server) { this.server = server; }

  async emitToUser(userId: string, event: string, payload: unknown) {
    return this.emitToUsers([userId], event, payload);
  }

  async emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server || !userIds.length) return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, status: 'ACTIVE' }, select: { id: true },
      });
      if (users.length) this.server.to(users.map(u => `user:${u.id}`)).emit(event, payload);
    } catch {
      this.logger.warn('Realtime account check failed; delivery withheld');
    }
  }

  async emitToConversation(conversationId: string, event: string, payload: unknown) {
    if (!this.server) return;
    try {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          members: { include: { user: { select: { schoolId: true, status: true } } } },
          group: { include: { members: { where: { isApproved: true }, select: { userId: true } } } },
        },
      });
      if (!conversation?.members.length) return;
      const schoolId = conversation.members[0].user.schoolId;
      if (conversation.members.some(m => m.user.schoolId !== schoolId)) return;
      const group = conversation.group;
      if (group && (group.isArchived || group.schoolId !== schoolId)) return;
      const recipients = conversation.members.filter(m => m.user.status === 'ACTIVE' &&
        (!group || group.members.some(g => g.userId === m.userId)));
      if (recipients.length) this.server.to(recipients.map(m => `user:${m.userId}`)).emit(event, payload);
    } catch {
      this.logger.warn('Realtime conversation check failed; delivery withheld');
    }
  }

  disconnectUser(userId: string) {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
  }

  joinConversation(userId: string, conversationId: string) {
    this.server?.in(`user:${userId}`).socketsJoin(`conversation:${conversationId}`);
  }
}
