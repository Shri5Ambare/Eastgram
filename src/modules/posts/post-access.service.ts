import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PostVisibility } from '@prisma/client';
import type { AuthUser } from '@common/decorators/current-user.decorator';
import { PrismaService } from '@/prisma/prisma.service';

import { readablePostWhere } from './post-access.policy';

@Injectable()
export class PostAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireReadable(user: AuthUser, id: string) {
    const post = await this.prisma.post.findFirst({
      where: { AND: [{ id }, readablePostWhere(user)] },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async validateAudience(user: AuthUser, visibility: PostVisibility, groupId?: string | null) {
    if (visibility === 'CLASS' && !user.classId) {
      throw new BadRequestException('Class posts require a class assignment');
    }
    if (visibility === 'CLUB' && !groupId) {
      throw new BadRequestException('Club posts require a group');
    }
    if (groupId) {
      const group = await this.prisma.group.findFirst({
        where: {
          id: groupId, schoolId: user.schoolId, isArchived: false,
          members: { some: { userId: user.id, isApproved: true } },
        },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Group not found');
    }
  }
}
