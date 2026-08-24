import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', description: 'User first name' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'User last name' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'johndoe@mail.com',
    description: 'Email address',
  })
  @IsString()
  @IsNotEmpty()
  email?: string;

  @ApiPropertyOptional({
    example: '+2348012345678',
    description: 'Phone number',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  @IsNotEmpty()
  phone?: string;

  @ApiPropertyOptional({ example: 'Nigeria', description: 'User country' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(35)
  country?: string;

  @ApiPropertyOptional({ example: 'Lagos', description: 'User state' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(35)
  state?: string;

  @ApiPropertyOptional({ example: 'Lekki', description: 'User city' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  city?: string;

  @ApiPropertyOptional({ example: '123, Main Street' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(105)
  address?: string;

  @ApiPropertyOptional({ example: 'I enjoy discovering new places.' })
  @IsOptional()
  @IsString()
  @MaxLength(401)
  bio?: string;
}
