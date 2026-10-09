import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePartyBookingDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsMongoId()
  partyId!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Needed when the party charges per hour',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  hours?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Needed when the party charges per day',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;

  @ApiPropertyOptional({
    description: 'Key from the private link, needed for private parties',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @ApiPropertyOptional({ example: 'Coming with my sister' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
