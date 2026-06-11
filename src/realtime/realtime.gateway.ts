import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { RealtimeService } from './realtime.service';
import { authenticateSocket } from './ws-auth';

interface AuthedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);
    this.logger.log('Realtime gateway initialised');
  }

  async handleConnection(client: AuthedSocket) {
    const auth = await authenticateSocket(
      client,
      this.jwt,
      this.config.get<string>('jwt.accessSecret')!,
    );
    if (!auth) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    client.userId = auth.userId;
    client.join(`user:${auth.userId}`);

    // Re-join all of the user's conversation rooms so they receive messages.
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId: auth.userId },
      select: { conversationId: true },
    });
    memberships.forEach((m) => client.join(`conversation:${m.conversationId}`));

    await this.redis.setOnline(auth.userId, client.id);
    this.realtime.emitToUser(auth.userId, 'presence:self', { online: true });
    this.logger.debug(`User ${auth.userId} connected (${client.id})`);
  }

  async handleDisconnect(client: AuthedSocket) {
    if (!client.userId) return;
    const remaining = await this.redis.setOffline(client.userId, client.id);
    if (remaining === 0) {
      await this.prisma.user
        .update({
          where: { id: client.userId },
          data: { lastSeenAt: new Date() },
        })
        .catch(() => undefined);
    }
  }
}
