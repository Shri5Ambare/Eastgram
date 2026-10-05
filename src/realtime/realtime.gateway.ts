import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { RealtimeService } from './realtime.service';
import { authenticateSocket } from './ws-auth';

interface AuthedSocket extends Socket {
  userId?: string;
  expiryTimer?: ReturnType<typeof setTimeout>;
}

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

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
    try {
      const auth = await authenticateSocket(client, this.jwt, this.config.get<string>('jwt.accessSecret')!);
      if (!auth) { client.disconnect(true); return; }
      const active = async () => Boolean(await this.prisma.user.findFirst({
        where: { id: auth.userId, status: UserStatus.ACTIVE }, select: { id: true },
      }));
      if (!await active() || !client.connected) { client.disconnect(true); return; }
      client.userId = auth.userId;
      await client.join(`user:${auth.userId}`);
      // Recheck after joining so a concurrent admin disconnect cannot miss this socket.
      if (!await active() || auth.expiresAt <= Date.now() || !client.connected) {
        client.disconnect(true); return;
      }
      client.expiryTimer = setTimeout(() => {
        client.emit('session:expired');
        client.disconnect(true);
      }, Math.min(auth.expiresAt - Date.now(), 2_147_483_647));
      client.expiryTimer.unref?.();
      // Delivery uses authorized per-user rooms, not conversation-room membership.
      await this.redis.setOnline(auth.userId, client.id);
      if (!client.connected) { await this.redis.setOffline(auth.userId, client.id); return; }
      await this.realtime.emitToUser(auth.userId, 'presence:self', { online: true });
    } catch {
      client.disconnect(true);
      this.logger.warn('Realtime connection validation failed');
    }
  }

  async handleDisconnect(client: AuthedSocket) {
    if (client.expiryTimer) clearTimeout(client.expiryTimer);
    if (!client.userId) return;
    const remaining = await this.redis.setOffline(client.userId, client.id);
    if (remaining === 0) {
      await this.prisma.user.update({ where: { id: client.userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
  }
}
