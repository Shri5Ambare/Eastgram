import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, ReactionType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Toggle a reaction on a post. Re-reacting with the same type removes it. */
  async togglePost(userId: string, postId: string, type: ReactionType) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.reaction.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing && existing.type === type) {
      const [, updatedPost] = await this.prisma.$transaction([
        this.prisma.reaction.delete({ where: { id: existing.id } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        }),
      ]);
      return { reacted: false, likeCount: updatedPost.likeCount };
    }

    if (existing) {
      await this.prisma.reaction.update({
        where: { id: existing.id },
        data: { type },
      });
      const postDetail = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { likeCount: true },
      });
      return { reacted: true, type, likeCount: postDetail?.likeCount ?? 0 };
    }

    const [, updatedPost] = await this.prisma.$transaction([
      this.prisma.reaction.create({ data: { userId, postId, type } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      }),
    ]);

    await this.notifications.notify({
      recipientId: post.authorId,
      actorId: userId,
      type: NotificationType.LIKE,
      title: 'Someone reacted to your post',
      data: { postId },
    });

    return { reacted: true, type, likeCount: updatedPost.likeCount };
  }

  async toggleComment(userId: string, commentId: string, type: ReactionType) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const existing = await this.prisma.reaction.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing && existing.type === type) {
      await this.prisma.$transaction([
        this.prisma.reaction.delete({ where: { id: existing.id } }),
        this.prisma.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      return { reacted: false };
    }

    if (existing) {
      await this.prisma.reaction.update({
        where: { id: existing.id },
        data: { type },
      });
      return { reacted: true, type };
    }

    await this.prisma.$transaction([
      this.prisma.reaction.create({ data: { userId, commentId, type } }),
      this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      }),
    ]);
    return { reacted: true, type };
  }
}
