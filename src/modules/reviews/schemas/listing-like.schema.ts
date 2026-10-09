import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ListingType } from './listing-type';

@Schema({ timestamps: true, collection: 'listing_likes' })
export class ListingLike extends Document {
  @Prop({ required: true, enum: Object.values(ListingType) })
  listingType!: ListingType;

  @Prop({ type: Types.ObjectId, required: true })
  listingId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ListingLikeSchema = SchemaFactory.createForClass(ListingLike);
ListingLikeSchema.index(
  { listingType: 1, listingId: 1, userId: 1 },
  { unique: true },
);
