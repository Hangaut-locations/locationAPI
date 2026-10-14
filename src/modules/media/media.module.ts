import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PartyBooking,
  PartyBookingSchema,
} from '../bookings/schemas/party-booking.schema';
import {
  PropertyBooking,
  PropertyBookingSchema,
} from '../bookings/schemas/property-booking.schema';
import { Party, PartySchema } from '../parties/schemas/party.schema';
import { Property, PropertySchema } from '../property/schemas/property.schema';
import { MediaCleanupService } from './media-cleanup.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Property.name, schema: PropertySchema },
      { name: Party.name, schema: PartySchema },
      { name: PropertyBooking.name, schema: PropertyBookingSchema },
      { name: PartyBooking.name, schema: PartyBookingSchema },
    ]),
  ],
  controllers: [MediaController],
  providers: [MediaService, MediaCleanupService],
  exports: [MediaService],
})
export class MediaModule {}
