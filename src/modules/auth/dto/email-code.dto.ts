import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  Matches,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class EmailDto {
  @ApiProperty({ example: 'user@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @IsNotEmpty()
  email!: string;
}

export class EmailCodeDto extends EmailDto {
  @ApiProperty({
    example: '042913',
    description: 'The 6 digit code from the email',
  })
  @Transform(trim)
  @Matches(/^\d{6}$/, { message: 'The code is 6 digits' })
  code!: string;
}

export class VerifyEmailDto extends EmailCodeDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Remember me, same as on login',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class ResendCodeDto extends EmailDto {
  @ApiProperty({ enum: ['verify', 'reset'], example: 'verify' })
  @IsIn(['verify', 'reset'])
  purpose!: 'verify' | 'reset';
}
