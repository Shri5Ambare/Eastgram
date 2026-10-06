import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AwardAchievementDto,
  CreateAchievementDto,
} from './dto/achievement.dto';

@Injectable()
export class AchievementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private requireStaff(user: AuthUser) {
    if (!['TEACHER', 'ADMIN', 'PRINCIPAL'].includes(user.role)) throw new ForbiddenException('Only school staff can manage achievements');
  }

  /** Staff define achievement types in a catalog. */
  createCatalog(user: AuthUser, dto: CreateAchievementDto) {
    this.requireStaff(user);
    return this.prisma.achievement.create({ data: dto });
  }

  async listCatalog(dto: PaginationDto) {
    const where = dto.q
      ? { name: { contains: dto.q, mode: 'insensitive' as const } }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.achievement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.achievement.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  /** Staff award an achievement to a student. Notifies the recipient. */
  async award(granter: AuthUser, dto: AwardAchievementDto) {
    this.requireStaff(granter);
    const recipient = await this.prisma.user.findFirst({ where: { id: dto.recipientId, schoolId: granter.schoolId }, select: { id: true } });
    if (!recipient) throw new NotFoundException('User not found');
    const achievement = await this.prisma.achievement.findUnique({
      where: { id: dto.achievementId },
    });
    if (!achievement) throw new NotFoundException('Achievement not found');

    const award = await this.prisma.userAchievement.upsert({
      where: {
        achievementId_recipientId: {
          achievementId: dto.achievementId,
          recipientId: dto.recipientId,
        },
      },
      create: {
        achievementId: dto.achievementId,
        recipientId: dto.recipientId,
        granterId: granter.id,
        note: dto.note,
      },
      update: { note: dto.note, granterId: granter.id },
      include: { achievement: true },
    });

    await this.notifications.notify({
      recipientId: dto.recipientId,
      actorId: granter.id,
      type: NotificationType.ACHIEVEMENT_AWARDED,
      title: `You earned "${achievement.name}"! 🏆`,
      body: dto.note,
      data: { achievementId: dto.achievementId },
    });

    return award;
  }

  async userAchievements(viewer: AuthUser, username: string, dto: PaginationDto) {
    const user = await this.prisma.user.findFirst({
      where: { username, schoolId: viewer.schoolId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const where = { recipientId: user.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.userAchievement.findMany({
        where,
        include: { achievement: true },
        orderBy: { awardedAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.userAchievement.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }
}
