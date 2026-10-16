import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const REPORT_REASONS = [
  'spam',
  'scam',
  'harassment',
  'inappropriate',
  'other',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

@Schema({ timestamps: true, collection: 'chat_reports' })
export class ChatReport extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporterId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  reportedId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Conversation' })
  conversationId?: Types.ObjectId;

  @Prop({ required: true, enum: REPORT_REASONS })
  reason!: ReportReason;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  details!: string;

  createdAt!: Date;
}

export const ChatReportSchema = SchemaFactory.createForClass(ChatReport);
