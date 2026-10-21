import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'stories' })
export class Story extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: ['photo', 'video'] })
  kind!: 'photo' | 'video';

  @Prop({ required: true })
  publicId!: string;

  @Prop({ required: true })
  url!: string;

  @Prop()
  poster?: string;

  @Prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
}

export const StorySchema = SchemaFactory.createForClass(Story);
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ userId: 1, expiresAt: 1 });

@Schema({ timestamps: true, collection: 'story_comments' })
export class StoryComment extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Story', required: true })
  storyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;

  @Prop({ required: true })
  name!: string;

  @Prop()
  location?: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
}

export const StoryCommentSchema = SchemaFactory.createForClass(StoryComment);
StoryCommentSchema.index({ storyId: 1, createdAt: 1 });
StoryCommentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

@Schema({ timestamps: true, collection: 'story_loves' })
export class StoryLove extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Story', required: true })
  storyId!: Types.ObjectId;

  @Prop({ required: true })
  viewerId!: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const StoryLoveSchema = SchemaFactory.createForClass(StoryLove);
StoryLoveSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
StoryLoveSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
