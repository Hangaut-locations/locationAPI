import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RequiredUnlessDraft } from '../../listings/draft';
import { VIDEO_ID_PATTERN } from '../../listings/video';
import { Visibility } from '../../listings/visibility';
import { ChargeType, StatusType } from '../schemas/party.schema';

/** The create form sends this list as one JSON string. */
const toTicketOptions = (value: unknown): unknown => {
  if (value == null || value === '') return [];
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  return value;
};

export class TicketOptionDto {
  @ApiProperty({ example: 'VIP' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name!: string;

  @ApiProperty({ example: 80, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiProperty({ example: 20, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  available!: number;

  @ApiPropertyOptional({
    example: 'A seat at a round table with drinks included.',
    maxLength: 280,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(280)
  details?: string;
}

export class CreatePartyDto {
  @ApiProperty({ example: 'Summer rooftop party' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'An evening of music, food, and good company.' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: '12 Marina Road, Lagos' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://example.com/party.jpg'],
  })
  @IsOptional()
  @IsArray()
  // @IsUrl({}, { each: true })
  images?: string[];

  @ApiPropertyOptional({
    example: 'hangaut/parties/videos/abc123',
    description:
      'public_id from the Cloudinary video upload (see POST /media/upload-signature), "" removes the video',
  })
  @IsOptional()
  @IsString()
  @Matches(VIDEO_ID_PATTERN, { message: 'Upload the video again' })
  video?: string;

  @ApiProperty({ example: 50, minimum: 1 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guest_capacity!: number;

  @ApiProperty({ enum: ChargeType, example: ChargeType.PERSON })
  @RequiredUnlessDraft()
  @IsEnum(ChargeType)
  charge_type!: ChargeType;

  @ApiProperty({
    enum: StatusType,
    default: 'published',
    example: StatusType.PUBLISHED,
  })
  @IsEnum(StatusType)
  status!: StatusType;

  @ApiPropertyOptional({ enum: Visibility, default: Visibility.PUBLIC })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiProperty({ example: 'No outside drinks. RSVP is required.' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  party_rules!: string;

  @ApiPropertyOptional({
    enum: ['instant', 'approve-first'],
    default: 'instant',
    description:
      'approve-first means you confirm each booking before guests get their codes',
  })
  @IsOptional()
  @IsIn(['instant', 'approve-first'])
  booking_setting?: string;

  @ApiProperty({ example: 'Nature and Adventure' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  party_type!: string;

  @ApiProperty({ example: true, default: 'true' })
  @IsOptional()
  is_ticket_sales!: string;

  @ApiProperty({ example: 25, minimum: 0 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({
    type: [TicketOptionDto],
    description:
      'Extra tickets the host is selling, each with its own price and how many are for sale. Send a JSON string from the form.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const parsed = toTicketOptions(value);
    return Array.isArray(parsed)
      ? plainToInstance(TicketOptionDto, parsed)
      : parsed;
  })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  ticket_options?: TicketOptionDto[];

  // @ApiProperty({ example: '' })
  @RequiredUnlessDraft()
  @IsNotEmpty()
  @IsDateString()
  start_date!: string;

  // @ApiProperty({ example: '' })
  @RequiredUnlessDraft()
  @IsNotEmpty()
  @IsDateString()
  end_date!: string;

  @ApiPropertyOptional({
    example: '18:30',
    description: 'Start time, 24-hour "HH:mm" (Nigeria time)',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Start time must look like 18:30',
  })
  start_time?: string;

  @ApiPropertyOptional({
    example: '23:00',
    description: 'Stopping time, 24-hour "HH:mm" (Nigeria time)',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'End time must look like 23:00',
  })
  end_time?: string | null;

  @ApiProperty({ example: 2, minimum: 0 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  beds!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms!: number;
}

export const PARTY_PUBLISH_FIELDS = [
  'title',
  'description',
  'location',
  'guest_capacity',
  'charge_type',
  'party_rules',
  'party_type',
  'price',
  'start_date',
  'end_date',
] as const;
