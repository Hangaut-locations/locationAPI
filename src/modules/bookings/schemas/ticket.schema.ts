import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** One person in a booking. The code gets them in once. */
@Schema({ _id: false })
export class Ticket {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  code!: string;

  @Prop({ type: Date })
  checked_in_at?: Date;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

/** Codes are unique across bookings. Old bookings without codes are left out. */
export const ticketCodeIndex = {
  fields: { 'tickets.code': 1 as const },
  options: {
    unique: true,
    partialFilterExpression: { 'tickets.code': { $exists: true } },
  },
};
