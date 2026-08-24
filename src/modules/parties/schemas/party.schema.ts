import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ChargeType {
  PERSON = 'person',
  HOUR = 'hour',
}

@Schema({ timestamps: true })
export class Party extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, trim: true })
  location!: string;

  @Prop({ type: [String], default: [] })
  photos_url!: string[];

  @Prop({ required: true, min: 1 })
  guest_capacity!: number;

  @Prop({ required: true, enum: Object.values(ChargeType) })
  charge_type!: ChargeType;

  @Prop({ required: true, trim: true })
  party_rules!: string;

  @Prop({ required: true, default: false })
  is_ticket_sales!: boolean;

  @Prop({ required: true, min: 0 })
  price!: number;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PartySchema = SchemaFactory.createForClass(Party);
