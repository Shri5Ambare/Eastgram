import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '@/prisma/prisma.service';
import { ConfirmUploadDto, PresignUploadDto } from './dto/media.dto';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

/**
 * Cloudflare R2 (S3-compatible) media service. Clients request a presigned
 * PUT URL, upload directly to R2, then confirm to persist the Media row.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly presignTtl: number;
  private readonly configured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const endpoint = this.config.get<string>('r2.endpoint');
    this.bucket = this.config.get<string>('r2.bucket')!;
    this.publicUrl = this.config.get<string>('r2.publicUrl')!;
    this.presignTtl = this.config.get<number>('r2.presignTtl')!;
    this.configured = Boolean(
      endpoint &&
        this.config.get('r2.accessKeyId') &&
        this.config.get('r2.secretAccessKey'),
    );

    this.s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: this.config.get<string>('r2.accessKeyId')!,
        secretAccessKey: this.config.get<string>('r2.secretAccessKey')!,
      },
    });
  }

  async createPresignedUpload(userId: string, dto: PresignUploadDto) {
    if (!this.configured) {
      throw new InternalServerErrorException('R2 storage is not configured');
    }

    const ext = dto.fileName.includes('.')
      ? dto.fileName.split('.').pop()
      : 'bin';
    const key = `${dto.type.toLowerCase()}/${userId}/${Date.now()}-${nanoid()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, {
      expiresIn: this.presignTtl,
    });

    return {
      key,
      uploadUrl,
      publicUrl: this.toPublicUrl(key),
      expiresIn: this.presignTtl,
      method: 'PUT',
      headers: { 'Content-Type': dto.mimeType },
    };
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    return this.prisma.media.create({
      data: {
        ownerId: userId,
        type: dto.type,
        key: dto.key,
        url: this.toPublicUrl(dto.key),
        mimeType: dto.mimeType,
        sizeBytes: dto.sizeBytes,
        width: dto.width,
        height: dto.height,
        durationMs: dto.durationMs,
        thumbnailUrl: dto.thumbnailUrl,
      },
    });
  }

  private toPublicUrl(key: string): string {
    const base = this.publicUrl?.replace(/\/$/, '') || '';
    return `${base}/${key}`;
  }
}
