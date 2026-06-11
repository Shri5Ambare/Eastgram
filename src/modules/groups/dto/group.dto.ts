import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GroupJoinPolicy, GroupRole, GroupType } from '@prisma/client';

export class CreateGroupDto {
  @ApiProperty({ example: 'Robotics Club' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ enum: GroupType, default: GroupType.CLUB })
  @IsOptional()
  @IsEnum(GroupType)
  type?: GroupType;

  @ApiPropertyOptional({ enum: GroupJoinPolicy, default: GroupJoinPolicy.REQUEST })
  @IsOptional()
  @IsEnum(GroupJoinPolicy)
  joinPolicy?: GroupJoinPolicy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: GroupJoinPolicy })
  @IsOptional()
  @IsEnum(GroupJoinPolicy)
  joinPolicy?: GroupJoinPolicy;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverUrl?: string;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: GroupRole })
  @IsEnum(GroupRole)
  role: GroupRole;
}
