import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PostType, PostVisibility, ReactionType } from '@prisma/client';

export class CreatePostDto {
  @ApiPropertyOptional({ enum: PostType, default: PostType.POST })
  @IsOptional()
  @IsEnum(PostType)
  type?: PostType;

  @ApiPropertyOptional({ enum: PostVisibility, default: PostVisibility.SCHOOL })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;

  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Ordered Media ids attached to the post',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  mediaIds?: string[];

  @ApiPropertyOptional({ description: 'Associate post with a group / club' })
  @IsOptional()
  @IsString()
  groupId?: string;
}

export class UpdatePostDto {
  @ApiPropertyOptional({ maxLength: 2200 })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional({ enum: PostVisibility })
  @IsOptional()
  @IsEnum(PostVisibility)
  visibility?: PostVisibility;
}

export class CreateCommentDto {
  @ApiProperty({ maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  body: string;

  @ApiPropertyOptional({ description: 'Parent comment id for a threaded reply' })
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class ReactDto {
  @ApiPropertyOptional({ enum: ReactionType, default: ReactionType.LIKE })
  @IsOptional()
  @IsEnum(ReactionType)
  type?: ReactionType;
}
