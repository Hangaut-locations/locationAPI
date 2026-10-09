import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePropertyBookingDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsMongoId()
  propertyId!: string;

  @ApiProperty({ example: '2026-10-20', description: 'Day of the booking' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '14:00', description: '24-hour, Nigeria time' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'start_time must look like 14:00',
  })
  start_time!: string;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  hours!: number;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @ApiPropertyOptional({
    description: 'Key from the private link, needed for private places',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  key?: string;

  @ApiPropertyOptional({ example: 'Small birthday hangout' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
