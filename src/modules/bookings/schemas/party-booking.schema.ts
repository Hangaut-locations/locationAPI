import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingStatus } from './booking-status';
import { Ticket, ticketCodeIndex, TicketSchema } from './ticket.schema';

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

  @Prop({ required: false, min: 1 })
  days?: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({
    default: BookingStatus.CONFIRMED,
    enum: Object.values(BookingStatus),
  })
  status!: BookingStatus;

  @Prop({ required: false, trim: true })
  note?: string;

  // Requests the host hasn't answered by then get declined.
  @Prop({ type: Date, index: true })
  respond_by?: Date;

  // Bookings from before codes have none.
  @Prop({ type: [TicketSchema], default: [] })
  tickets!: Ticket[];

  // Copy of the party when it was booked. Parties are deleted after they end.
  @Prop({ trim: true })
  title!: string;

  @Prop()
  image?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  rules?: string;

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

  /** Which extra ticket they bought. Blank means the party's main price. Kept for older bookings. */
  @Prop({ required: false, trim: true })
  ticket_name?: string;

  /** Tickets in this booking, up to three. An empty string means the main Regular price. */
  @Prop({ type: [String], required: false, default: undefined })
  ticket_names?: string[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const PartyBookingSchema = SchemaFactory.createForClass(PartyBooking);

PartyBookingSchema.index(ticketCodeIndex.fields, ticketCodeIndex.options);
