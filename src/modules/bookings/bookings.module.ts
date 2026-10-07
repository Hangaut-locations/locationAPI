import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Party, PartySchema } from '../parties/schemas/party.schema';
import { Property, PropertySchema } from '../property/schemas/property.schema';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import {
  PartyBooking,
  PartyBookingSchema,
} from './schemas/party-booking.schema';
import {
  PropertyBooking,
  PropertyBookingSchema,
} from './schemas/property-booking.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PartyBooking.name, schema: PartyBookingSchema },
      { name: PropertyBooking.name, schema: PropertyBookingSchema },
      { name: Party.name, schema: PartySchema },
      { name: Property.name, schema: PropertySchema },
    ]),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
})
export class BookingsModule {}
