import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Thin wrapper over ioredis with helpers for caching, presence tracking and
 * pub/sub used by the realtime gateways.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }

  // ───────────── generic cache helpers ─────────────
  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  // ───────────── presence (online users) ─────────────
  private presenceKey(userId: string) {
    return `presence:${userId}`;
  }

  async setOnline(userId: string, socketId: string): Promise<void> {
    await this.client.sadd(this.presenceKey(userId), socketId);
    await this.client.expire(this.presenceKey(userId), 60 * 60);
  }

  async setOffline(userId: string, socketId: string): Promise<number> {
    await this.client.srem(this.presenceKey(userId), socketId);
    return this.client.scard(this.presenceKey(userId));
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.client.scard(this.presenceKey(userId))) > 0;
  }
}
