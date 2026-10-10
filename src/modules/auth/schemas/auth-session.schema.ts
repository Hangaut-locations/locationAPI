import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// "remember me" logins. only a hash of the token is kept, the token itself lives on the user's device
@Schema({ timestamps: true, collection: 'auth_sessions' })
export class AuthSession extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true })
  tokenHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
