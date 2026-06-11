import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  ) {}

  async create(user: AuthUser, postId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

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

  async list(postId: string, dto: PaginationDto) {
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

  async replies(commentId: string, dto: PaginationDto) {
    const where = { parentId: commentId };
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
      select: { id: true, authorId: true, postId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const isStaff = ['ADMIN', 'PRINCIPAL', 'TEACHER'].includes(user.role);
    if (comment.authorId !== user.id && !isStaff) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.prisma.$transaction([
      this.prisma.comment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: 1 } },
      }),
    ]);
    return { success: true };
  }
}
