import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Favorite, FavoriteSchema } from '../favorites/schemas/favorite.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Property, PropertySchema } from './schemas/property.schema';
import { PropertyController } from './property.controller';
import { PropertyService } from './property.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
    ]),
    MongooseModule.forFeature([
      { name: Favorite.name, schema: FavoriteSchema },
    ]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [PropertyController],
  providers: [PropertyService],
})
export class PropertyModule {}
