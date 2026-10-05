import { MediaModule } from '../media/media.module';
import { Module } from '@nestjs/common';
import { PostAccessService } from './post-access.service';
import { CommentsService } from './comments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { ReactionsService } from './reactions.service';

@Module({
  imports: [MediaModule],
  controllers: [PostsController],
  providers: [PostAccessService, PostsService, CommentsService, ReactionsService],
  exports: [PostsService],
})
export class PostsModule {}
