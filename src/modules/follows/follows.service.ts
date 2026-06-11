import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FollowStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async follow(followerId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true, isPrivate: true, fullName: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === followerId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    // Private profiles require approval; public profiles auto-accept.
    const status = target.isPrivate
      ? FollowStatus.PENDING
      : FollowStatus.ACCEPTED;

    const follow = await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId,
          followingId: target.id,
        },
      },
      create: { followerId, followingId: target.id, status },
      update: {}, // existing relation is left as-is
    });

    await this.notifications.notify({
      recipientId: target.id,
      actorId: followerId,
      type:
        status === FollowStatus.PENDING
          ? NotificationType.FOLLOW_REQUEST
          : NotificationType.FOLLOW,
      title:
        status === FollowStatus.PENDING
          ? 'New follow request'
          : 'New follower',
      data: { followerId },
    });

    return follow;
  }

  async unfollow(followerId: string, targetUsername: string) {
    const target = await this.prisma.user.findUnique({
      where: { username: targetUsername },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.follow.deleteMany({
      where: { followerId, followingId: target.id },
    });
    return { success: true };
  }

  /** Target user approves a pending follow request. */
  async acceptRequest(userId: string, followerId: string) {
    const result = await this.prisma.follow.updateMany({
      where: {
        followerId,
        followingId: userId,
        status: FollowStatus.PENDING,
      },
      data: { status: FollowStatus.ACCEPTED },
    });
    if (result.count === 0) {
      throw new NotFoundException('No pending request from this user');
    }
    await this.notifications.notify({
      recipientId: followerId,
      actorId: userId,
      type: NotificationType.FOLLOW,
      title: 'Follow request accepted',
      data: { userId },
    });
    return { success: true };
  }

  async followers(username: string, dto: PaginationDto) {
    const user = await this.requireUser(username);
    const where = { followingId: user.id, status: FollowStatus.ACCEPTED };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({
        where,
        include: { follower: this.userCard() },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where }),
    ]);
    return paginate(
      items.map((f) => f.follower),
      total,
      dto.page,
      dto.limit,
    );
  }

  async following(username: string, dto: PaginationDto) {
    const user = await this.requireUser(username);
    const where = { followerId: user.id, status: FollowStatus.ACCEPTED };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({
        where,
        include: { following: this.userCard() },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where }),
    ]);
    return paginate(
      items.map((f) => f.following),
      total,
      dto.page,
      dto.limit,
    );
  }

  async pendingRequests(userId: string, dto: PaginationDto) {
    const where = { followingId: userId, status: FollowStatus.PENDING };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({
        where,
        include: { follower: this.userCard() },
        skip: dto.skip,
        take: dto.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.follow.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  private async requireUser(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private userCard() {
    return {
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        isVerified: true,
      },
    };
  }
}
