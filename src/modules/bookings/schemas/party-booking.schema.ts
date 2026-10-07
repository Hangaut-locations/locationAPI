import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingStatus } from './booking-status';

@Schema({ timestamps: true, collection: 'party_bookings' })
export class PartyBooking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Party', required: true, index: true })
  partyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  guestId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  hostId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  guests!: number;

  @Prop({ required: false, min: 1 })
  hours?: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({
    default: BookingStatus.CONFIRMED,
    enum: Object.values(BookingStatus),
  })
  status!: BookingStatus;

  @Prop({ required: false, trim: true })
  note?: string;

  // Copy of the party when it was booked. Parties are deleted after they end.
  @Prop({ trim: true })
  title!: string;

  @Prop()
  image?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ type: Date })
  start_date?: Date;

  @Prop({ type: Date })
  end_date?: Date;

  @Prop()
  start_time?: string;

  @Prop()
  charge_type?: string;

  @Prop({ min: 0 })
  price?: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PartyBookingSchema = SchemaFactory.createForClass(PartyBooking);
