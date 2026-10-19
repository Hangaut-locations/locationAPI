import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'party_live' })
export class LiveSession extends Document {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Party',
    required: true,
    unique: true,
  })
  partyId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  hostId!: Types.ObjectId;

  @Prop({ default: false })
  active!: boolean;

  @Prop()
  startedAt?: Date;

  @Prop({ default: 0 })
  signalSeq!: number;
}

export const LiveSessionSchema = SchemaFactory.createForClass(LiveSession);

@Schema({ timestamps: true, collection: 'party_live_viewers' })
export class LiveViewer extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Party', required: true })
  partyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;

  @Prop({ required: true })
  lastSeen!: Date;
}

export const LiveViewerSchema = SchemaFactory.createForClass(LiveViewer);
LiveViewerSchema.index({ partyId: 1, viewerId: 1 }, { unique: true });
LiveViewerSchema.index({ lastSeen: 1 }, { expireAfterSeconds: 60 });

@Schema({ timestamps: true, collection: 'party_live_signals' })
export class LiveSignal extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Party', required: true })
  partyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;

  @Prop({ required: true, enum: ['host', 'viewer'] })
  from!: 'host' | 'viewer';

  @Prop({ required: true, enum: ['offer', 'answer', 'ice'] })
  kind!: 'offer' | 'answer' | 'ice';

  @Prop({ required: true })
  payload!: string;

  @Prop({ required: true })
  seq!: number;
}

export const LiveSignalSchema = SchemaFactory.createForClass(LiveSignal);
LiveSignalSchema.index({ partyId: 1, seq: 1 });
LiveSignalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 });

@Schema({ timestamps: true, collection: 'party_live_comments' })
export class LiveComment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Party', required: true })
  partyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;

  @Prop({ required: true, trim: true, maxlength: 24 })
  name!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  text!: string;

  createdAt!: Date;
}

export const LiveCommentSchema = SchemaFactory.createForClass(LiveComment);
LiveCommentSchema.index({ partyId: 1, createdAt: 1 });

@Schema({ timestamps: true, collection: 'party_live_loves' })
export class LiveLove extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Party', required: true })
  partyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;
}

export const LiveLoveSchema = SchemaFactory.createForClass(LiveLove);
LiveLoveSchema.index({ partyId: 1, viewerId: 1 }, { unique: true });
