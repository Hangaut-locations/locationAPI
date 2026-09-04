import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId } from 'class-validator';
import { FavoriteTargetType } from '../schemas/favorite.schema';

export class CreateFavoriteDto {
  @ApiProperty({ example: '65f1c2e3a4b5c6d7e8f90123' })
  @IsMongoId()
  targetId!: string;

  @ApiProperty({ enum: FavoriteTargetType, example: FavoriteTargetType.PARTY })
  @IsEnum(FavoriteTargetType)
  targetType!: FavoriteTargetType;
}
