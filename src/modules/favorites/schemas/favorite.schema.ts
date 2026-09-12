import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum FavoriteTargetType {
  PARTY = 'Party',
  HOME = 'Home',
}

@Schema({ timestamps: true })
export class Favorite extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
    index: true,
    refPath: 'targetType',
  })
  targetId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(FavoriteTargetType),
  })
  targetType!: FavoriteTargetType;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FavoriteSchema = SchemaFactory.createForClass(Favorite);
