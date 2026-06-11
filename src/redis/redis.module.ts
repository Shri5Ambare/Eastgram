import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT, REDIS_SUBSCRIBER } from './redis.constants';

const logger = new Logger('Redis');

function buildClient(config: ConfigService): Redis {
  const client = new Redis({
    host: config.get<string>('redis.host'),
    port: config.get<number>('redis.port'),
    password: config.get<string>('redis.password'),
    db: config.get<number>('redis.db'),
    maxRetriesPerRequest: null,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  // Attaching an error handler prevents unhandled-error crashes when Redis is
  // briefly unreachable; ioredis will keep retrying per the strategy above.
  client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
  client.on('connect', () => logger.log('Redis connected'));

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: buildClient,
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [ConfigService],
      useFactory: buildClient,
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT, REDIS_SUBSCRIBER],
})
export class RedisModule {}
