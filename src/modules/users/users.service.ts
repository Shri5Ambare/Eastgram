import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { AuthUser } from '@common/decorators/current-user.decorator';
import { RealtimeService } from '@/realtime/realtime.service';
import { PrismaService } from '@/prisma/prisma.service';
import {
  paginate,
  PaginationDto,
} from '@common/dto/pagination.dto';
import { AdminUpdateUserDto, UpdateProfileDto } from './dto/user.dto';

const PUBLIC_SELECT = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  bio: true,
  role: true,
  isVerified: true,
  isPrivate: true,
  schoolId: true,
  classId: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly realtime: RealtimeService) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_SELECT,
        email: true,
        phone: true,
        status: true,
        messagePermission: true,
        lastSeenAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getProfile(username: string, viewer: AuthUser) {
    const user = await this.prisma.user.findFirst({
      where: { username, schoolId: viewer.schoolId },
      select: {
        ...PUBLIC_SELECT,
        _count: {
          select: { followers: true, following: true, posts: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const isFollowing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: viewer.id, followingId: user.id },
      },
      select: { status: true },
    });

    return { ...user, viewerFollowStatus: isFollowing?.status ?? null };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: PUBLIC_SELECT,
    });
  }

  async list(schoolId: string, dto: PaginationDto) {
    const where: Prisma.UserWhereInput = {
      schoolId,
      ...(dto.q
        ? {
            OR: [
              { fullName: { contains: dto.q, mode: 'insensitive' } },
              { username: { contains: dto.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_SELECT,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(items, total, dto.page, dto.limit);
  }

  /** Admin / Principal: update role, status, messaging permission, class. */
  async adminUpdate(actor: AuthUser, userId: string, dto: AdminUpdateUserDto) {
    if (!['ADMIN', 'PRINCIPAL'].includes(actor.role)) {
      throw new ForbiddenException('Only school administrators can change users');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({ where: { id: userId, schoolId: actor.schoolId }, select: { id: true } });
      if (!target) throw new NotFoundException('User not found');
      if (dto.classId) {
        const schoolClass = await tx.schoolClass.findFirst({ where: { id: dto.classId, schoolId: actor.schoolId }, select: { id: true } });
        if (!schoolClass) throw new NotFoundException('Class not found');
      }
      const user = await tx.user.update({
        where: { id: userId, schoolId: actor.schoolId }, data: dto,
        select: { ...PUBLIC_SELECT, status: true, messagePermission: true },
      });
      if (dto.status != null && dto.status !== UserStatus.ACTIVE) {
        await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      return user;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    // Disconnect after commit; permission/class changes also need fresh client state.
    if (dto.status != null || dto.role != null || dto.messagePermission != null || dto.classId !== undefined) {
      this.realtime.disconnectUser(userId);
    }
    return updated;
  }
}
