import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PollType } from '@prisma/client';

export class PollOptionInput {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  label: string;
}

export class PollCandidateInput {
  @ApiProperty({ description: 'Display name / pageant entrant' })
  @IsString()
  @MaxLength(120)
  displayName: string;

  @ApiPropertyOptional({ description: 'Registered user id of candidate' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Category e.g. "Mister School"' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  manifesto?: string;
}

export class CreatePollDto {
  @ApiPropertyOptional({ enum: PollType, default: PollType.QUICK })
  @IsOptional()
  @IsEnum(PollType)
  type?: PollType;

  @ApiProperty({ example: 'Who should be class representative?' })
  @IsString()
  @MaxLength(280)
  question: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'Scope poll to a group / club' })
  @IsOptional()
  @IsString()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Open time (ISO). Defaults to now.' })
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional({ description: 'Close time (ISO)' })
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({ type: [PollOptionInput], description: 'For QUICK polls' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionInput)
  @ArrayMinSize(2)
  options?: PollOptionInput[];

  @ApiPropertyOptional({
    type: [PollCandidateInput],
    description: 'For ELECTION / PAGEANT polls',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollCandidateInput)
  candidates?: PollCandidateInput[];
}

export class VoteDto {
  @ApiPropertyOptional({ description: 'Option id (QUICK poll)' })
  @IsOptional()
  @IsString()
  optionId?: string;

  @ApiPropertyOptional({ description: 'Candidate id (ELECTION / PAGEANT)' })
  @IsOptional()
  @IsString()
  candidateId?: string;

  @ApiPropertyOptional({ description: 'Category for pageant (one vote each)' })
  @IsOptional()
  @IsString()
  category?: string;
}
