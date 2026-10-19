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

const viewer = () =>
  Matches(/^[a-zA-Z0-9_-]{8,40}$/, { message: 'Bad viewer' });

export class ViewerDto {
  @ApiProperty({ example: 'viewer_abc12345' })
  @viewer()
  viewerId!: string;

  @ApiPropertyOptional({
    description: 'Key from the private link, needed for private parties',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;
}

export class HostSignalDto {
  @ApiProperty()
  @viewer()
  viewerId!: string;

  @ApiProperty({ enum: ['offer', 'ice'] })
  @IsIn(['offer', 'ice'])
  kind!: 'offer' | 'ice';

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  payload!: string;
}

export class ViewerSignalDto extends ViewerDto {
  @ApiProperty({ enum: ['answer', 'ice'] })
  @IsIn(['answer', 'ice'])
  kind!: 'answer' | 'ice';

  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  payload!: string;
}

export class LiveCommentDto extends ViewerDto {
  @ApiPropertyOptional({ example: 'Ada' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(24)
  name?: string;

  @ApiProperty({ example: 'This place is loud' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Write something first' })
  @MaxLength(200)
  text!: string;
}
