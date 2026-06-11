import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'student@school.edu' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'rahul_10a' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{3,30}$/, {
    message: 'username must be 3-30 chars (letters, numbers, _ or .)',
  })
  username: string;

  @ApiProperty({ example: 'Rahul Sharma' })
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ description: 'School the user belongs to' })
  @IsString()
  schoolId: string;

  @ApiPropertyOptional({ description: 'Class / grade id' })
  @IsOptional()
  @IsString()
  classId?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'student@school.edu' })
  @IsString()
  identifier: string; // email or username

  @ApiProperty({ example: 'S3curePass!' })
  @IsString()
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM registration token' })
  @IsString()
  fcmToken: string;

  @ApiPropertyOptional({ enum: ['ios', 'android', 'web'] })
  @IsOptional()
  @IsString()
  platform?: string;
}
