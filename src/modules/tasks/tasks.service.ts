import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollStatus, PostType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/** Background maintenance jobs (story expiry, poll auto-open/close). */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Remove expired stories every 15 minutes.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async expireStories() {
    const { count } = await this.prisma.post.deleteMany({
      where: { type: PostType.STORY, expiresAt: { lt: new Date() } },
    });
    if (count) this.logger.log(`Expired ${count} stories`);
  }

  // Open scheduled polls and close polls past their close time.
  @Cron(CronExpression.EVERY_MINUTE)
  async syncPollStatuses() {
    const now = new Date();
    const [opened, closed] = await this.prisma.$transaction([
      this.prisma.poll.updateMany({
        where: { status: PollStatus.SCHEDULED, opensAt: { lte: now } },
        data: { status: PollStatus.OPEN },
      }),
      this.prisma.poll.updateMany({
        where: { status: PollStatus.OPEN, closesAt: { lte: now } },
        data: { status: PollStatus.CLOSED },
      }),
    ]);
    if (opened.count || closed.count) {
      this.logger.log(
        `Polls: opened ${opened.count}, closed ${closed.count}`,
      );
    }
  }
}
