import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingStatus } from './booking-status';

@Schema({ timestamps: true, collection: 'property_bookings' })
export class PropertyBooking extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Property', required: true })
  propertyId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  guestId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  hostId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  guests!: number;

  @Prop({ required: true, type: Date })
  start_at!: Date;

  @Prop({ required: true, type: Date })
  end_at!: Date;

  @Prop({ required: true, min: 1 })
  hours!: number;

  @Prop({ required: true, min: 0 })
  total!: number;

  @Prop({
    default: BookingStatus.PENDING,
    enum: Object.values(BookingStatus),
  })
  status!: BookingStatus;

  @Prop({ required: false, trim: true })
  note?: string;

  // Copy of the property when it was booked, so old trips still show if the listing changes.
  @Prop({ trim: true })
  title!: string;

  @Prop()
  image?: string;

  @Prop({ trim: true })
  location?: string;

  @Prop()
  charge_type?: string;

  @Prop({ min: 0 })
  price?: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PropertyBookingSchema =
  SchemaFactory.createForClass(PropertyBooking);

PropertyBookingSchema.index({ propertyId: 1, start_at: 1 });
