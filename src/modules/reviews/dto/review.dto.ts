import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { COMMENT_MAX_LENGTH } from '../schemas/listing-comment.schema';

export class LikeListingDto {
  @ApiPropertyOptional({
    description: 'Key from the private link, needed for private listings',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;
}

export class CreateCommentDto extends LikeListingDto {
  @ApiProperty({ example: 'Great vibes, the DJ was amazing' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Write something first' })
  @MaxLength(COMMENT_MAX_LENGTH)
  comment!: string;
}

export class ReplyDto {
  @ApiProperty({ example: 'Thanks for coming, see you next time!' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Write something first' })
  @MaxLength(COMMENT_MAX_LENGTH)
  reply!: string;
}
