import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser } from '@common/decorators/current-user.decorator';
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

  async follow(user: AuthUser, targetUsername: string) {
    const followerId = user.id;
    const target = await this.prisma.user.findFirst({
      where: { username: targetUsername, schoolId: user.schoolId },
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

  async unfollow(user: AuthUser, targetUsername: string) {
    const followerId = user.id;
    const target = await this.prisma.user.findFirst({
      where: { username: targetUsername, schoolId: user.schoolId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.follow.deleteMany({
      where: { followerId, followingId: target.id },
    });
    return { success: true };
  }

  /** Target user approves a pending follow request. */
  async acceptRequest(user: AuthUser, followerId: string) {
    const userId = user.id;
    const result = await this.prisma.follow.updateMany({
      where: {
        followerId,
        followingId: userId,
        status: FollowStatus.PENDING,
        follower: { schoolId: user.schoolId },
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

  async followers(viewer: AuthUser, username: string, dto: PaginationDto) {
    const user = await this.requireUser(viewer, username);
    const where = { followingId: user.id, status: FollowStatus.ACCEPTED, follower: { schoolId: viewer.schoolId } };
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

  async following(viewer: AuthUser, username: string, dto: PaginationDto) {
    const user = await this.requireUser(viewer, username);
    const where = { followerId: user.id, status: FollowStatus.ACCEPTED, following: { schoolId: viewer.schoolId } };
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

  async pendingRequests(user: AuthUser, dto: PaginationDto) {
    const where = { followingId: user.id, status: FollowStatus.PENDING, follower: { schoolId: user.schoolId } };
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

  private async requireUser(viewer: AuthUser, username: string) {
    const user = await this.prisma.user.findFirst({
      where: { username, schoolId: viewer.schoolId },
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
