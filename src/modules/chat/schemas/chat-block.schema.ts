import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'chat_blocks' })
export class ChatBlock extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockerId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockedId!: Types.ObjectId;

  createdAt!: Date;
}

export const ChatBlockSchema = SchemaFactory.createForClass(ChatBlock);
ChatBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
ChatBlockSchema.index({ blockedId: 1 });
