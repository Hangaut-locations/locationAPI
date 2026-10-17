import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const MESSAGE_MAX_LENGTH = 2000;

export enum MessageKind {
  TEXT = 'text',
  PHOTO = 'photo',
  LOCATION = 'location',
}

@Schema({ _id: false })
export class SharedLocation {
  @Prop({ required: true, min: -90, max: 90 })
  lat!: number;

  @Prop({ required: true, min: -180, max: 180 })
  lng!: number;

  /** Set when it's a live location, the sender's phone keeps moving the pin till then. */
  @Prop()
  live_until?: Date;
}

export const SharedLocationSchema =
  SchemaFactory.createForClass(SharedLocation);

@Schema({ timestamps: true, collection: 'chat_messages' })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(MessageKind) })
  kind!: MessageKind;

  @Prop({ trim: true, maxlength: MESSAGE_MAX_LENGTH })
  text?: string;

  @Prop()
  photo?: string;

  @Prop({ type: SharedLocationSchema })
  location?: SharedLocation;

  /** Set once the sender changes the text. The hour limit is still counted from createdAt. */
  @Prop()
  editedAt?: Date;

  /** Soft delete so the other person's open chat drops it on the next poll. */
  @Prop()
  deletedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
MessageSchema.index({ conversationId: 1, createdAt: -1 });
// polling asks for anything new or changed (live locations move) since the last check
MessageSchema.index({ conversationId: 1, updatedAt: 1 });
