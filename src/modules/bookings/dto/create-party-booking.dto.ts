import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PartyFriendDto {
  @ApiProperty({ example: 'Ada Obi' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: "Add your friend's name" })
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({
    example: 'ada@example.com',
    description: "Leave it out and this friend's code is sent to you instead",
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !value.trim() ? undefined : value,
  )
  @IsOptional()
  @IsEmail({}, { message: "That email doesn't look right" })
  @MaxLength(254)
  email?: string;
}

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
    type: [PartyFriendDto],
    description:
      'People coming with you, up to guests - 1. Everyone gets their own code, spots without a friend send the code to you',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PartyFriendDto)
  friends?: PartyFriendDto[];

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
