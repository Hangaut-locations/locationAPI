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
  Min,
  MinLength,
} from 'class-validator';
import { ChargeType, SpaceType, StatusType } from '../schemas/property.schema';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Summer rooftop property' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ example: 'An evening of music, food, and good company.' })
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ example: '12 Marina Road, Lagos' })
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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guest_capacity!: number;

  // @ApiProperty({ enum: ChargeType, example: ChargeType.PERSON })
  // @IsEnum(ChargeType)
  // charge_type!: ChargeType;

  @ApiProperty({ enum: ChargeType, example: SpaceType.ENTIRE })
  @IsEnum(SpaceType)
  space_type!: SpaceType;

  @ApiProperty({
    enum: StatusType,
    default: 'published',
    example: StatusType.PUBLISHED,
  })
  @IsEnum(StatusType)
  status!: 'published';

  @ApiProperty({ example: 'No outside drinks. RSVP is required.' })
  @IsString()
  @IsNotEmpty()
  property_rules!: string;

  @ApiProperty({ example: 'approve-first' })
  @IsString()
  @IsNotEmpty()
  booking_setting!: string;

  @ApiProperty({ example: 'Nature and Adventure' })
  @IsString()
  @IsNotEmpty()
  property_type!: string;

  @ApiProperty({ example: true, default: 'true' })
  @IsOptional()
  is_ticket_sales!: string;

  @ApiProperty({ example: 25, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  // @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsDateString()
  start_date!: string;

  // @ApiProperty({ example: '' })
  @IsNotEmpty()
  @IsDateString()
  end_date!: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bedrooms!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  beds!: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  bathrooms!: number;

  @ApiProperty({ example: ['wifi', 'TV'] })
  @IsArray()
  @MinLength(1)
  amenties!: [];
}
