import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness / readiness probe' })
  async check() {
    const [db, cache] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`.then(() => 'up')
        .catch(() => 'down'),
      this.redis.client
        .ping()
        .then(() => 'up')
        .catch(() => 'down'),
    ]);
    const ok = db === 'up' && cache === 'up';
    return {
      status: ok ? 'ok' : 'degraded',
      services: { database: db, redis: cache },
      timestamp: new Date().toISOString(),
    };
  }
}
