import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PostAccessService } from './post-access.service';
import { CreateCommentDto } from './dto/post.dto';

const COMMENT_INCLUDE = {
  author: {
    select: {
      id: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      isVerified: true,
    },
  },
  _count: { select: { replies: true, reactions: true } },
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly access: PostAccessService,
  ) {}

  async create(user: AuthUser, postId: string, dto: CreateCommentDto) {
    const post = await this.access.requireReadable(user, postId);
    if (dto.parentId) {
      const parent = await this.prisma.comment.findFirst({ where: { id: dto.parentId, postId }, select: { id: true } });
      if (!parent) throw new NotFoundException('Parent comment not found');
    }

    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          postId,
          authorId: user.id,
          parentId: dto.parentId,
          body: dto.body,
        },
        include: COMMENT_INCLUDE,
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    await this.notifications.notify({
      recipientId: post.authorId,
      actorId: user.id,
      type: NotificationType.COMMENT,
      title: 'New comment on your post',
      body: dto.body.slice(0, 120),
      data: { postId, commentId: comment.id },
    });

    return comment;
  }

  async list(user: AuthUser, postId: string, dto: PaginationDto) {
    await this.access.requireReadable(user, postId);
    const where = { postId, parentId: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: COMMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async replies(user: AuthUser, commentId: string, dto: PaginationDto) {
    const parent = await this.prisma.comment.findUnique({ where: { id: commentId }, select: { postId: true } });
    if (!parent) throw new NotFoundException('Comment not found');
    await this.access.requireReadable(user, parent.postId);
    const where = { parentId: commentId, postId: parent.postId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        include: COMMENT_INCLUDE,
        orderBy: { createdAt: 'asc' },
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.comment.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  async remove(user: AuthUser, commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true, post: { select: { author: { select: { schoolId: true } } } } },
    });
    if (!comment || comment.post.author.schoolId !== user.schoolId) throw new NotFoundException('Comment not found');

    const isStaff = ['ADMIN', 'PRINCIPAL', 'TEACHER'].includes(user.role);
    if (comment.authorId !== user.id && !isStaff) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    // Replies cascade at arbitrary depth; recount the remaining rows atomically.
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prisma.$transaction(async tx => {
          await tx.comment.deleteMany({ where: { id: commentId, postId: comment.postId } });
          const remaining = await tx.comment.count({ where: { postId: comment.postId } });
          await tx.post.update({ where: { id: comment.postId }, data: { commentCount: remaining } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        break;
      } catch (error) {
        if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') continue;
        throw error;
      }
    }
    return { success: true };
  }
}
