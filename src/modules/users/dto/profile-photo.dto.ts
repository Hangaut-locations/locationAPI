import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ProfilePhotoDto {
  @ApiProperty({ example: 'hangaut/profiles/abc' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  publicId!: string;
}
