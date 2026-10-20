import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PartyBooking,
  PartyBookingSchema,
} from '../bookings/schemas/party-booking.schema';
import { Favorite, FavoriteSchema } from '../favorites/schemas/favorite.schema';
import { MediaModule } from '../media/media.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Party, PartySchema } from './schemas/party.schema';
import { PartiesController } from './parties.controller';
import { PartiesService } from './parties.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Party.name, schema: PartySchema }]),
    MongooseModule.forFeature([
      { name: Favorite.name, schema: FavoriteSchema },
    ]),
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MongooseModule.forFeature([
      { name: PartyBooking.name, schema: PartyBookingSchema },
    ]),
    MediaModule,
  ],
  controllers: [PartiesController],
  providers: [PartiesService],
  exports: [PartiesService],
})
export class PartiesModule {}
