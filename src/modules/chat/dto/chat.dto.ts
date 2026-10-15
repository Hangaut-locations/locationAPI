import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ListingType } from '../../reviews/schemas/listing-type';
import {
  REPORT_REASONS,
  type ReportReason,
} from '../schemas/chat-report.schema';
import { MESSAGE_MAX_LENGTH } from '../schemas/message.schema';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** How long a live location can be shared for, in minutes. */
export const LIVE_MINUTES = [15, 60, 480] as const;

export const CHAT_PHOTO_PATTERN = /^hangaut\/chat\/[\w-]+$/;

export class StartChatDto {
  @ApiProperty({ description: 'Who to message', example: '665f1c...' })
  @IsMongoId({ message: "That person wasn't found" })
  userId!: string;

  @ApiProperty({ enum: Object.values(ListingType), example: 'party' })
  @IsEnum(ListingType)
  listingType!: ListingType;

  @ApiProperty({
    description:
      "The listing it's about. The person has to be its host, or have liked, reviewed or replied on it",
  })
  @IsMongoId({ message: "That listing wasn't found" })
  listingId!: string;

  @ApiPropertyOptional({ description: 'Key from the private link' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;
}

export class LocationDto {
  @ApiProperty({ example: 6.4474 })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 3.4721 })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  lng!: number;
}

export class SendLocationDto extends LocationDto {
  @ApiPropertyOptional({
    enum: LIVE_MINUTES,
    description:
      'Share live for this many minutes, leave out for a one-off pin',
  })
  @IsOptional()
  @IsIn(LIVE_MINUTES)
  live_minutes?: (typeof LIVE_MINUTES)[number];
}

export class SendMessageDto {
  @ApiPropertyOptional({ example: 'Hi, is the place free this weekend?' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MESSAGE_MAX_LENGTH)
  text?: string;

  @ApiPropertyOptional({
    description: 'public_id from POST /chat/photo-signature + the upload',
    example: 'hangaut/chat/abc123',
  })
  @IsOptional()
  @IsString()
  @Matches(CHAT_PHOTO_PATTERN, { message: 'Upload the photo again' })
  photo?: string;

  @ApiPropertyOptional({ type: SendLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SendLocationDto)
  location?: SendLocationDto;
}

export class ReportDto {
  @ApiProperty({ description: 'Who is being reported' })
  @IsMongoId({ message: "That person wasn't found" })
  userId!: string;

  @ApiPropertyOptional({ description: 'The chat it happened in' })
  @IsOptional()
  @IsMongoId()
  conversationId?: string;

  @ApiProperty({ enum: REPORT_REASONS })
  @IsIn(REPORT_REASONS, { message: 'Pick a reason' })
  reason!: ReportReason;

  @ApiPropertyOptional({ example: 'Keeps asking me to pay outside Hangaut' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class MessagesQuery {
  @ApiPropertyOptional({
    description:
      'Polling: only messages new or changed after this time (use `now` from the last response)',
  })
  @IsOptional()
  @IsString()
  since?: string;

  @ApiPropertyOptional({
    description: 'Older messages: before this message id',
  })
  @IsOptional()
  @IsMongoId()
  before?: string;
}
