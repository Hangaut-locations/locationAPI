import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FriendDto } from './friend.dto';

export class CreatePropertyBookingDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsMongoId()
  propertyId!: string;

  @ApiProperty({ example: '2026-10-20', description: 'Day of the booking' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: '14:00',
    description:
      '24-hour, Nigeria time. Needed unless the place charges per day',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'start_time must look like 14:00',
  })
  start_time?: string;

  @ApiPropertyOptional({
    example: 3,
    description: 'Needed unless the place charges per day',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  hours?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Nights from the check-in date to the morning of check-out. Required when the place charges per day. A longer stay on any place holds those nights, including days the host crossed out',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @ApiPropertyOptional({
    type: [FriendDto],
    description:
      'People coming with you, up to guests - 1. Everyone gets their own code, spots without a friend send the code to you',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FriendDto)
  friends?: FriendDto[];

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
