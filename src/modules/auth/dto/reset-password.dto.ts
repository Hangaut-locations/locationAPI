import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';
import { EmailCodeDto } from './email-code.dto';

export class ResetPasswordDto extends EmailCodeDto {
  @ApiProperty({ example: 'Password123@@@', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must contain uppercase, lowercase, number and special character',
  })
  password!: string;
}
