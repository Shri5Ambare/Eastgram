import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

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

  async getProfile(username: string, viewerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
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
        followerId_followingId: { followerId: viewerId, followingId: user.id },
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
  async adminUpdate(userId: string, dto: AdminUpdateUserDto) {
    await this.ensureExists(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        ...PUBLIC_SELECT,
        status: true,
        messagePermission: true,
      },
    });
  }

  private async ensureExists(userId: string) {
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw new NotFoundException('User not found');
  }
}
