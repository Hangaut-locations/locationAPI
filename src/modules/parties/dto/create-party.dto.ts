import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ChargeType } from '../schemas/party.schema';

export class CreatePartyDto {
  @ApiProperty({ example: 'Summer rooftop party' })
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
    example: ['https://example.com/party.jpg'],
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

  @ApiProperty({ enum: ChargeType, example: ChargeType.PERSON })
  @IsEnum(ChargeType)
  charge_type!: ChargeType;

  @ApiProperty({ example: 'No outside drinks. RSVP is required.' })
  @IsString()
  @IsNotEmpty()
  party_rules!: string;

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
}
