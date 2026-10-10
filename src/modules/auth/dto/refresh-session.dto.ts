import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshSessionDto {
  @ApiProperty({
    example: '6650c0f1a2b3c4d5e6f70812.Zm9vYmFyYmF6...',
    description: 'The refreshToken you got from login with remember: true',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  refreshToken!: string;
}
