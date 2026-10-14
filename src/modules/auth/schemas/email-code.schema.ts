import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export const CODE_PURPOSES = ['verify', 'reset', 'change-email'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];

/** One live code per email + purpose, a new one replaces the old one. */
@Schema({ timestamps: true, collection: 'email_codes' })
export class EmailCode extends Document {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, enum: CODE_PURPOSES })
  purpose!: CodePurpose;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ required: true })
  sentAt!: Date;

  /** For change-email, the account asking for it. */
  @Prop()
  userId?: string;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const EmailCodeSchema = SchemaFactory.createForClass(EmailCode);
EmailCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
EmailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
