import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'password123',
    description: 'User password',
    minLength: 6,
  })
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Remember me: also returns a refreshToken that keeps you logged in for 30 days (extended each time it is used)',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
