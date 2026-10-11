import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CheckInDto {
  @ApiProperty({ example: 'K7M2-QX9P', description: "The guest's code" })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  code!: string;
}
