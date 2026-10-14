import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { MediaKind, MediaListing } from '../media.service';

export class UploadSignatureDto {
  @ApiProperty({ enum: ['photo', 'video'], example: 'photo' })
  @IsIn(['photo', 'video'])
  kind!: MediaKind;

  @ApiProperty({ enum: ['property', 'party'], example: 'property' })
  @IsIn(['property', 'party'])
  listing!: MediaListing;
}
