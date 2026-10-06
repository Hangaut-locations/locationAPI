import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { RequiredUnlessDraft } from '../../listings/draft';
import { ChargeType, StatusType } from '../schemas/party.schema';

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
  @ArrayMaxSize(5)
  // @IsUrl({}, { each: true })
  images?: string[];

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

  @ApiProperty({ example: 'No outside drinks. RSVP is required.' })
  @RequiredUnlessDraft()
  @IsString()
  @IsNotEmpty()
  party_rules!: string;

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
