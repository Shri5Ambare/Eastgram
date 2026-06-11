import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSchoolDto {
  @ApiProperty()
  @IsString()
  @MaxLength(140)
  name: string;

  @ApiProperty({ example: 'greenwood-high' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class CreateClassDto {
  @ApiProperty({ example: 'Grade 10 - A' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  section?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  year?: number;
}
