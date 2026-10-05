import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
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

  @ApiPropertyOptional({ enum: ChargeType, default: ChargeType.PERSON })
  @IsOptional()
  @IsEnum(ChargeType)
  charge_type?: ChargeType;

  @ApiProperty({ enum: SpaceType, example: SpaceType.ENTIRE })
  @IsEnum(SpaceType)
  space_type!: SpaceType;

  @ApiPropertyOptional({ enum: StatusType, default: StatusType.PUBLISHED })
  @IsOptional()
  @IsEnum(StatusType)
  status?: StatusType;

  @ApiPropertyOptional({ example: 'No outside drinks. RSVP is required.' })
  @IsOptional()
  @IsString()
  property_rules?: string;

  @ApiProperty({ example: 'approve-first' })
  @IsString()
  @IsNotEmpty()
  booking_setting!: string;

  @ApiProperty({ example: 'Nature and Adventure' })
  @IsString()
  @IsNotEmpty()
  property_type!: string;

  @ApiProperty({ example: 25, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

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

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'TV'] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined || Array.isArray(value) ? value : [value],
  )
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];
}
