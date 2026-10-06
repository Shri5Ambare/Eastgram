import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaType } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { AuthUser } from '@common/decorators/current-user.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { readablePostWhere } from '../posts/post-access.policy';
import { readableConversationWhere } from '../messaging/conversation-access.policy';
import { ConfirmUploadDto, PresignUploadDto } from './dto/media.dto';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);
const MAX_BYTES = 524_288_000;
const MIME_TYPES: Record<MediaType, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm'],
  DOCUMENT: ['application/pdf', 'text/plain'],
};

@Injectable()
export class MediaService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly presignTtl: number;
  private readonly configured: boolean;

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {
    const endpoint = config.get<string>('r2.endpoint');
    this.bucket = config.get<string>('r2.bucket')!;
    this.publicUrl = config.get<string>('r2.publicUrl')!;
    this.presignTtl = config.get<number>('r2.presignTtl') ?? 900;
    this.configured = Boolean(endpoint && this.bucket && config.get('r2.accessKeyId') && config.get('r2.secretAccessKey'));
    this.s3 = new S3Client({
      region: 'auto', endpoint,
      credentials: { accessKeyId: config.get<string>('r2.accessKeyId')!, secretAccessKey: config.get<string>('r2.secretAccessKey')! },
    });
  }

  async createPresignedUpload(userId: string, dto: PresignUploadDto) {
    this.requireConfigured();
    this.requireMime(dto.type, dto.mimeType);
    if (dto.sizeBytes != null && (dto.sizeBytes < 1 || dto.sizeBytes > MAX_BYTES)) throw new BadRequestException('Invalid file size');
    const extension = dto.fileName.split('.').pop()?.toLowerCase();
    const ext = extension && /^[a-z0-9]{1,10}$/.test(extension) ? extension : 'bin';
    const key = `${dto.type.toLowerCase()}/${userId}/${Date.now()}-${nanoid()}.${ext}`;
    const command = new PutObjectCommand({
      Bucket: this.bucket, Key: key, ContentType: dto.mimeType,
      Metadata: { ownerid: userId, mediatype: dto.type },
    });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: this.presignTtl });
    return {
      key, uploadUrl, expiresIn: this.presignTtl, method: 'PUT',
      headers: { 'Content-Type': dto.mimeType, 'x-amz-meta-ownerid': userId, 'x-amz-meta-mediatype': dto.type },
    };
  }

  async confirmUpload(userId: string, dto: ConfirmUploadDto) {
    const prefix = `${dto.type.toLowerCase()}/${userId}/`;
    if (!dto.key.startsWith(prefix) || !/^\d+-[a-z0-9]{16}\.[a-z0-9]{1,10}$/.test(dto.key.slice(prefix.length))) {
      throw new ForbiddenException('Upload key does not belong to you');
    }
    this.requireConfigured();
    let object;
    try { object = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: dto.key })); }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) throw new NotFoundException('Uploaded object not found');
      throw new InternalServerErrorException('Could not verify uploaded object');
    }
    if (object.Metadata?.ownerid !== userId || object.Metadata?.mediatype !== dto.type) throw new ForbiddenException('Upload ownership could not be verified');
    this.requireMime(dto.type, object.ContentType ?? '');
    if (!object.ContentLength || object.ContentLength > MAX_BYTES) throw new BadRequestException('Invalid file size');
    if (dto.sizeBytes != null && dto.sizeBytes !== object.ContentLength) throw new BadRequestException('File size does not match upload');
    if (dto.mimeType != null && dto.mimeType !== object.ContentType) throw new BadRequestException('File type does not match upload');
    const values = {
      ownerId: userId, type: dto.type, key: dto.key, url: this.toPublicUrl(dto.key),
      mimeType: object.ContentType, sizeBytes: object.ContentLength,
      width: dto.width, height: dto.height, durationMs: dto.durationMs,
      thumbnailUrl: null,
    };
    // Confirmation retries cannot duplicate a media record or borrow another owner's key.
    const media = await this.prisma.media.upsert({
      where: { key: dto.key }, create: values, update: {},
    });
    if (media.ownerId !== userId) throw new ForbiddenException('Upload key does not belong to you');
    return { ...media, url: await this.signedReadUrl(media.key), thumbnailUrl: null };
  }

  async access(user: AuthUser, id: string) {
    const media = await this.prisma.media.findFirst({
      where: { id, owner: { schoolId: user.schoolId } },
    });
    if (!media) throw new NotFoundException('Media not found');
    const permitted = media.ownerId === user.id || Boolean(await this.prisma.postMedia.findFirst({
      where: { mediaId: id, post: readablePostWhere(user) }, select: { id: true },
    })) || Boolean(await this.prisma.message.findFirst({
      where: { mediaId: id, isDeleted: false, conversation: readableConversationWhere(user) }, select: { id: true },
    }));
    if (!permitted) throw new NotFoundException('Media not found');
    return { url: await this.signedReadUrl(media.key), expiresIn: 300 };
  }

  /** Internal callers must authorize the owning post/message before requesting a URL. */
  async signedReadUrl(key: string) {
    this.requireConfigured();
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 });
  }

  private requireMime(type: MediaType, mime: string) {
    if (!MIME_TYPES[type]?.includes(mime)) throw new BadRequestException('Unsupported file type');
  }
  private requireConfigured() {
    if (!this.configured) throw new InternalServerErrorException('R2 storage is not configured');
  }
  private toPublicUrl(key: string) { return `${this.publicUrl?.replace(/\/$/, '') || ''}/${key}`; }
}
