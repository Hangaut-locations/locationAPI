import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FriendDto } from './friend.dto';

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

  @ApiPropertyOptional({
    example: 'VIP',
    description: 'Name of an extra ticket. Leave it off to pay the main price.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(40)
  ticket_name?: string;

  @ApiPropertyOptional({
    description:
      'Reserve a free spot. Only works when the host turned ticket sales off',
  })
  @IsOptional()
  @IsBoolean()
  without_ticket?: boolean;
}
