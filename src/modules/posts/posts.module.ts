import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { ReactionsService } from './reactions.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService, CommentsService, ReactionsService],
  exports: [PostsService],
})
export class PostsModule {}
