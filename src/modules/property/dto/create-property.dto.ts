import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { RequiredUnlessDraft } from '../../listings/draft';
import { Visibility } from '../../listings/visibility';
import { ChargeType, SpaceType, StatusType } from '../schemas/property.schema';

export const BLOCKED_DATES_MAX = 400;

/** Form data sends lists as a JSON string (or one field per item). Sorted, no repeats. */
const toDateList = (value: unknown) => {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = value.trim().startsWith('[') ? JSON.parse(value) : [value];
    } catch {
      return value;
    }
  }
  if (!Array.isArray(list)) return list;
  return [...new Set(list as unknown[])].sort();
};

export class CreatePropertyDto {
  @ApiProperty({ example: 'Summer rooftop property' })
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
    example: ['https://example.com/property.jpg'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  // @IsUrl({}, { each: true })
  images?: string[];

  @ApiProperty({ example: 50, minimum: 1 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guest_capacity!: number;

  @ApiPropertyOptional({ enum: ChargeType, default: ChargeType.PERSON })
  @IsOptional()
  @IsEnum(ChargeType)
  charge_type?: ChargeType;

  @ApiProperty({ enum: SpaceType, example: SpaceType.ENTIRE })
  @RequiredUnlessDraft()
  @IsEnum(SpaceType)
  space_type!: SpaceType;

  @ApiPropertyOptional({ enum: StatusType, default: StatusType.PUBLISHED })
  @IsOptional()
  @IsEnum(StatusType)
  status?: StatusType;

  @ApiPropertyOptional({ enum: Visibility, default: Visibility.PUBLIC })
  @IsOptional()
  @IsEnum(Visibility)
  visibility?: Visibility;

  @ApiPropertyOptional({ example: 'No outside drinks. RSVP is required.' })
  @IsOptional()
  @IsString()
  property_rules?: string;

  @ApiProperty({ example: 'approve-first' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  booking_setting!: string;

  @ApiProperty({ example: 'Nature and Adventure' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  property_type!: string;

  @ApiProperty({ example: 25, minimum: 0 })
  @RequiredUnlessDraft()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

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

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'TV'] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({
    type: [String],
    example: ['2026-12-24', '2026-12-25'],
    description:
      "Days (Nigeria time) the place can't be booked. Send a JSON array string so an empty list clears them",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toDateList(value))
  @IsArray()
  @ArrayMaxSize(BLOCKED_DATES_MAX)
  @IsISO8601(
    { strict: true },
    { each: true, message: 'Blocked dates must look like 2026-12-24' },
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'Blocked dates must look like 2026-12-24',
  })
  blocked_dates?: string[];
}

export const PROPERTY_PUBLISH_FIELDS = [
  'title',
  'description',
  'location',
  'guest_capacity',
  'space_type',
  'booking_setting',
  'property_type',
  'price',
] as const;
