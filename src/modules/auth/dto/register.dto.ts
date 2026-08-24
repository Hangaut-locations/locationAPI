import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  Matches,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({
    example: 'John',
    description: 'User first name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  firstName!: string;

  @ApiProperty({
    example: 'Doe',
    description: 'User last name',
  })
  @Transform(({ value }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  lastName!: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    example: 'password123@@@',
    description: 'User password',
    minLength: 8,
  })
  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  @IsString()
  password!: string;

  @ApiProperty({
    example: 'Nigeria',
    description: 'User country',
  })
  @IsNotEmpty()
  @MaxLength(35)
  @IsString()
  country!: string;

  @ApiProperty({
    example: 'Lagos',
    description: 'User State',
  })
  @IsNotEmpty()
  @MaxLength(35)
  @IsString()
  state!: string;

  @ApiProperty({
    example: 'Lekki',
    description: 'User City',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(45)
  city!: string;

  @ApiProperty({
    example: '123, main street',
    description: 'User home address',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(105)
  address!: string;

  @ApiProperty({
    example: 'My name is john doe, and I like to travel',
    description: 'User bio',
  })
  @IsOptional()
  @IsString()
  @MaxLength(401)
  bio!: string;
}
