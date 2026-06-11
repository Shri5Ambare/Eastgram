import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FollowStatus, Post, PostType, Prisma } from '@prisma/client';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { paginate, PaginationDto } from '@common/dto/pagination.dto';
import { PrismaService } from '@/prisma/prisma.service';
import { CreatePostDto, UpdatePostDto } from './dto/post.dto';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const POST_INCLUDE = {
  author: {
    select: {
      id: true,
      username: true,
      fullName: true,
      avatarUrl: true,
      isVerified: true,
      role: true,
    },
  },
  media: {
    orderBy: { position: 'asc' },
    include: { media: true },
  },
  _count: { select: { comments: true, reactions: true } },
} satisfies Prisma.PostInclude;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreatePostDto) {
    const type = dto.type ?? PostType.POST;

    // Verify the referenced media belongs to the author.
    if (dto.mediaIds?.length) {
      const owned = await this.prisma.media.count({
        where: { id: { in: dto.mediaIds }, ownerId: user.id },
      });
      if (owned !== dto.mediaIds.length) {
        throw new ForbiddenException('One or more media items are not yours');
      }
    }

    const expiresAt =
      type === PostType.STORY ? new Date(Date.now() + STORY_TTL_MS) : null;

    return this.prisma.post.create({
      data: {
        authorId: user.id,
        type,
        visibility: dto.visibility,
        caption: dto.caption,
        groupId: dto.groupId,
        expiresAt,
        media: dto.mediaIds?.length
          ? {
              create: dto.mediaIds.map((mediaId, position) => ({
                mediaId,
                position,
              })),
            }
          : undefined,
      },
      include: POST_INCLUDE,
    });
  }

  /** Personalised feed: posts from people the user follows + their own +
   *  school-wide posts, newest first. Stories/reels are served separately. */
  async feed(user: AuthUser, dto: PaginationDto) {
    const following = await this.prisma.follow.findMany({
      where: { followerId: user.id, status: FollowStatus.ACCEPTED },
      select: { followingId: true },
    });
    const authorIds = [...following.map((f) => f.followingId), user.id];

    const where: Prisma.PostWhereInput = {
      type: PostType.POST,
      isArchived: false,
      author: { schoolId: user.schoolId },
      OR: [{ authorId: { in: authorIds } }, { visibility: 'SCHOOL' }],
    };

    return this.queryPosts(where, dto);
  }

  /** Reels feed — short videos across the school, newest first. */
  async reels(user: AuthUser, dto: PaginationDto) {
    return this.queryPosts(
      {
        type: PostType.REEL,
        isArchived: false,
        author: { schoolId: user.schoolId },
      },
      dto,
    );
  }

  /** Active (non-expired) stories grouped is left to the client; here we
   *  return the raw active stories from followed users + self. */
  async stories(user: AuthUser) {
    const following = await this.prisma.follow.findMany({
      where: { followerId: user.id, status: FollowStatus.ACCEPTED },
      select: { followingId: true },
    });
    const authorIds = [...following.map((f) => f.followingId), user.id];

    return this.prisma.post.findMany({
      where: {
        type: PostType.STORY,
        authorId: { in: authorIds },
        expiresAt: { gt: new Date() },
      },
      include: POST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async userPosts(username: string, type: PostType, dto: PaginationDto) {
    const author = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!author) throw new NotFoundException('User not found');

    return this.queryPosts(
      { authorId: author.id, type, isArchived: false },
      dto,
    );
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: POST_INCLUDE,
    });
    if (!post || post.isArchived) throw new NotFoundException('Post not found');
    return post;
  }

  async update(user: AuthUser, id: string, dto: UpdatePostDto) {
    await this.ensureOwnerOrStaff(user, id);
    return this.prisma.post.update({
      where: { id },
      data: dto,
      include: POST_INCLUDE,
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.ensureOwnerOrStaff(user, id);
    await this.prisma.post.delete({ where: { id } });
    return { success: true };
  }

  async registerView(id: string) {
    await this.prisma.post.updateMany({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    return { success: true };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async queryPosts(where: Prisma.PostWhereInput, dto: PaginationDto) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        include: POST_INCLUDE,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: dto.skip,
        take: dto.limit,
      }),
      this.prisma.post.count({ where }),
    ]);
    return paginate(items, total, dto.page, dto.limit);
  }

  private async ensureOwnerOrStaff(user: AuthUser, postId: string): Promise<Post> {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const isStaff = ['ADMIN', 'PRINCIPAL', 'TEACHER'].includes(user.role);
    if (post.authorId !== user.id && !isStaff) {
      throw new ForbiddenException('You cannot modify this post');
    }
    return post;
  }
}
