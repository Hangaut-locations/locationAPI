import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ListingType } from './listing-type';

export const COMMENT_MAX_LENGTH = 1000;
export const THREAD_MAX_REPLIES = 200;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ReviewReply {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: COMMENT_MAX_LENGTH })
  text!: string;

  @Prop()
  editedAt?: Date;

  createdAt!: Date;
}

export const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

@Schema({ timestamps: true, collection: 'listing_comments' })
export class ListingComment extends Document {
  @Prop({ required: true, enum: Object.values(ListingType) })
  listingType!: ListingType;

  @Prop({ type: Types.ObjectId, required: true })
  listingId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: COMMENT_MAX_LENGTH })
  comment!: string;

  // host <-> reviewer back and forth, oldest first
  @Prop({ type: [ReviewReplySchema], default: [] })
  replies!: Types.DocumentArray<ReviewReply>;

  // old single host reply, moved into replies the first time it's touched
  @Prop({ trim: true, maxlength: COMMENT_MAX_LENGTH })
  reply?: string;

  @Prop()
  repliedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ListingCommentSchema =
  SchemaFactory.createForClass(ListingComment);
ListingCommentSchema.index({ listingType: 1, listingId: 1, createdAt: -1 });
