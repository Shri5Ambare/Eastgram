import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class StartConversationDto {
  @ApiProperty({ description: 'User id to start a direct conversation with' })
  @IsString()
  recipientId: string;

  @ApiPropertyOptional({ description: 'Optional first message' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({ maxLength: 4000 })
  @ValidateIf((o) => !o.mediaId)
  @IsString()
  @MaxLength(4000)
  body?: string;

  @ApiPropertyOptional({ description: 'Attached media id' })
  @IsOptional()
  @IsString()
  mediaId?: string;

  @ApiPropertyOptional({ description: 'Message id being replied to' })
  @IsOptional()
  @IsString()
  replyToId?: string;
}
