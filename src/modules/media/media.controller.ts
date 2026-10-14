import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UploadSignatureDto } from './dto/upload-signature.dto';
import { MediaService } from './media.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private mediaService: MediaService) {}

  @Post('upload-signature')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Signed params to upload a listing photo or video straight to Cloudinary (post the file with these to upload_url)',
  })
  uploadSignature(
    @Req() request: AuthenticatedRequest,
    @Body() { kind, listing }: UploadSignatureDto,
  ) {
    return this.mediaService.signUpload(
      String(request.user._id),
      kind,
      listing,
    );
  }
}
