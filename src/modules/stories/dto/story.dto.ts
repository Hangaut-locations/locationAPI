import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class StoryUploadDto {
  @ApiProperty({ enum: ['photo', 'video'] })
  @IsIn(['photo', 'video'])
  kind!: 'photo' | 'video';
}

export class CreateStoryDto extends StoryUploadDto {
  @ApiProperty({ example: 'hangaut/stories/abc' })
  @IsString()
  @MaxLength(200)
  publicId!: string;
}

export class StoryViewerDto {
  @ApiProperty({ example: 'viewer_abc12345' })
  @Matches(/^[a-zA-Z0-9_-]{8,40}$/, { message: 'Bad viewer' })
  viewerId!: string;
}

export class StoryCommentDto extends StoryViewerDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(24)
  name?: string;

  @ApiPropertyOptional({ example: 'Lekki' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  location?: string;

  @ApiProperty({ example: 'Looks fun' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Write something first' })
  @MaxLength(200)
  text!: string;
}
