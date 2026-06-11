import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ConfirmUploadDto, PresignUploadDto } from './dto/media.dto';
import { MediaService } from './media.service';

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('presign')
  @ApiOperation({ summary: 'Get a presigned R2 URL for direct upload' })
  presign(@CurrentUser('id') userId: string, @Body() dto: PresignUploadDto) {
    return this.media.createPresignedUpload(userId, dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm an upload and persist the media record' })
  confirm(@CurrentUser('id') userId: string, @Body() dto: ConfirmUploadDto) {
    return this.media.confirmUpload(userId, dto);
  }
}
