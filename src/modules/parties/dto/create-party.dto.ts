import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
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
  @IsUrl({}, { each: true })
  photos_url?: string[];

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

  @ApiProperty({ example: true })
  @IsBoolean()
  is_ticket_sales!: boolean;

  @ApiProperty({ example: 25, minimum: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;
}
