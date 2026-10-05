import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Lets the user clear a field by sending an empty string. */
const isFilled = (_: unknown, value: unknown) =>
  value !== undefined && value !== null && value !== '';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', description: 'User first name' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(20)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'User last name' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(20)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'johndoe@mail.com',
    description: 'Email address',
  })
  @Transform(trim)
  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address' })
  email?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Phone number in international format. Send "" to remove it.',
  })
  @Transform(trim)
  @ValidateIf(isFilled)
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'Enter a valid phone number, e.g. +2348012345678',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'Nigeria', description: 'User country' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Country is required' })
  @MaxLength(35)
  country?: string;

  @ApiPropertyOptional({ example: 'Lagos', description: 'User state' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'State is required' })
  @MaxLength(35)
  state?: string;

  @ApiPropertyOptional({ example: 'Lekki', description: 'User city' })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'City is required' })
  @MaxLength(45)
  city?: string;

  @ApiPropertyOptional({
    example: '123, Main Street',
    description: 'Send "" to remove it.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(105)
  address?: string;

  @ApiPropertyOptional({
    example: 'I enjoy discovering new places.',
    description: 'Send "" to remove it.',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(401)
  bio?: string;
}
