import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

/**
 * Holds the Socket.IO server reference and exposes typed emit helpers so any
 * module can push realtime events without depending on the gateway directly.
 * Rooms: `user:<userId>` (per-user), `conversation:<id>` (chat threads).
 */
@Injectable()
export class RealtimeService {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToUsers(userIds: string[], event: string, payload: unknown) {
    if (!this.server) return;
    const rooms = userIds.map((id) => `user:${id}`);
    this.server.to(rooms).emit(event, payload);
  }

  emitToConversation(conversationId: string, event: string, payload: unknown) {
    this.server?.to(`conversation:${conversationId}`).emit(event, payload);
  }

  joinConversation(userId: string, conversationId: string) {
    this.server
      ?.in(`user:${userId}`)
      .socketsJoin(`conversation:${conversationId}`);
  }
}
