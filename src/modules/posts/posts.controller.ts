import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PostType } from '@prisma/client';
import {
  AuthUser,
  CurrentUser,
} from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/dto/pagination.dto';
import { CommentsService } from './comments.service';
import {
  CreateCommentDto,
  CreatePostDto,
  ReactDto,
  UpdatePostDto,
} from './dto/post.dto';
import { PostsService } from './posts.service';
import { ReactionsService } from './reactions.service';

@ApiTags('posts')
@ApiBearerAuth()
@Controller()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly comments: CommentsService,
    private readonly reactions: ReactionsService,
  ) {}

  // ───────────────────────── feeds ─────────────────────────

  @Get('feed')
  @ApiOperation({ summary: 'Personalised home feed' })
  feed(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.posts.feed(user, dto);
  }

  @Get('reels')
  @ApiOperation({ summary: 'Reels feed (short videos)' })
  reels(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.posts.reels(user, dto);
  }

  @Get('stories')
  @ApiOperation({ summary: 'Active stories from followed users (24h)' })
  stories(@CurrentUser() user: AuthUser) {
    return this.posts.stories(user);
  }

  @Get('users/:username/posts')
  @ApiOperation({ summary: 'Posts authored by a user' })
  @ApiQuery({ name: 'type', enum: PostType, required: false })
  userPosts(
    @Param('username') username: string,
    @Query() dto: PaginationDto,
    @Query('type') type: PostType = PostType.POST,
  ) {
    return this.posts.userPosts(username, type, dto);
  }

  // ───────────────────────── posts ─────────────────────────

  @Post('posts')
  @ApiOperation({ summary: 'Create a post / reel / story / achievement' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    return this.posts.create(user, dto);
  }

  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a single post' })
  findOne(@Param('id') id: string) {
    return this.posts.findOne(id);
  }

  @Patch('posts/:id')
  @ApiOperation({ summary: 'Update a post (owner or staff)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ) {
    return this.posts.update(user, id, dto);
  }

  @Delete('posts/:id')
  @ApiOperation({ summary: 'Delete a post (owner or staff)' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.posts.remove(user, id);
  }

  @Post('posts/:id/view')
  @ApiOperation({ summary: 'Register a view (reels/stories)' })
  view(@Param('id') id: string) {
    return this.posts.registerView(id);
  }

  // ───────────────────────── reactions ─────────────────────────

  @Post('posts/:id/react')
  @ApiOperation({ summary: 'Toggle a reaction on a post' })
  reactPost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReactDto,
  ) {
    return this.reactions.togglePost(userId, id, dto.type ?? 'LIKE');
  }

  @Post('comments/:id/react')
  @ApiOperation({ summary: 'Toggle a reaction on a comment' })
  reactComment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReactDto,
  ) {
    return this.reactions.toggleComment(userId, id, dto.type ?? 'LIKE');
  }

  // ───────────────────────── comments ─────────────────────────

  @Post('posts/:id/comments')
  @ApiOperation({ summary: 'Comment on a post' })
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(user, id, dto);
  }

  @Get('posts/:id/comments')
  @ApiOperation({ summary: 'List top-level comments on a post' })
  listComments(@Param('id') id: string, @Query() dto: PaginationDto) {
    return this.comments.list(id, dto);
  }

  @Get('comments/:id/replies')
  @ApiOperation({ summary: 'List replies to a comment' })
  replies(@Param('id') id: string, @Query() dto: PaginationDto) {
    return this.comments.replies(id, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete a comment (owner or staff)' })
  removeComment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.comments.remove(user, id);
  }
}
