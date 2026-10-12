import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class FriendDto {
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
