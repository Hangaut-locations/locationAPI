import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ListingType } from '../../reviews/schemas/listing-type';
import { MessageKind } from './message.schema';

/** The listing the chat started from, shown at the top of the chat. Copied so it survives the listing ending. */
@Schema({ _id: false })
export class ChatListing {
  @Prop({ required: true, enum: Object.values(ListingType) })
  type!: ListingType;

  @Prop({ type: Types.ObjectId, required: true })
  id!: Types.ObjectId;

  @Prop({ default: '' })
  title!: string;

  @Prop()
  image?: string;
}

export const ChatListingSchema = SchemaFactory.createForClass(ChatListing);

@Schema({ _id: false })
export class LastMessage {
  @Prop({ type: Types.ObjectId, required: true })
  senderId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(MessageKind) })
  kind!: MessageKind;

  @Prop({ default: '' })
  text!: string;

  @Prop({ required: true })
  at!: Date;
}

export const LastMessageSchema = SchemaFactory.createForClass(LastMessage);

/** One chat between two people. */
@Schema({ timestamps: true, collection: 'chat_conversations' })
export class Conversation extends Document {
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  members!: Types.ObjectId[];

  /** "<smaller id>:<bigger id>", keeps it to one chat per pair. */
  @Prop({ required: true, unique: true })
  pair!: string;

  @Prop({ type: ChatListingSchema })
  listing?: ChatListing;

  @Prop({ type: LastMessageSchema })
  lastMessage?: LastMessage;

  @Prop({ index: true })
  lastMessageAt?: Date;

  /** Unread count per member id. */
  @Prop({ type: Map, of: Number, default: {} })
  unread!: Map<string, number>;

  /** When each member last opened the chat, for "Seen". */
  @Prop({ type: Map, of: Date, default: {} })
  readAt!: Map<string, Date>;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ members: 1, lastMessageAt: -1 });

export const pairOf = (a: string, b: string) => [a, b].sort().join(':');
