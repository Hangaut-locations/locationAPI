import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { requiredUnlessDraft } from '../../listings/draft';
import { Visibility } from '../../listings/visibility';

export enum ChargeType {
  PERSON = 'person',
  HOUR = 'hour',
  DAY = 'day',
}

export enum StatusType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum PartyType {
  HOUSE_PARTY = 'House party',
  ROOFTOP_PARTY = 'Rooftop party',
  YACHT_PARTY = 'Yacht party',
  FIELD_PARTY = 'Field party',
  MANSION_PARTY = 'Mansion Party',
  CREATIVE_SCENE = 'Creative scene',
  VISUAL_SCENE = 'Visual scene',
  BIRTHDAY_PARTY = 'Birthday Party',
  NIGHT_CLUB = 'Night Club',
  BEACH_PARTY = 'Beach Party',
  HALLOWEEN = 'Halloween',
  HORRIFIC = 'Horrific',
  BARBECUE = 'Barbecue',
  NATURE_AND_ADVENTURE = 'Nature and Adventure',
  PODCAST_RECORDING = 'Podcast Recording',
  LIVE_STREAM = 'Live stream',
  SHOWS = 'Shows',
  GAMES = 'Games',
  AMAZING_VIEWS = 'Amazing views',
  FRAMES = 'Frames',
  HOMES = 'Homes',
  HOUSEBOAT = 'Houseboat',
  CABIN = 'Cabin',
  OMG = 'OMG!',
  ISLANDS = 'Islands',
}

@Schema({ timestamps: true })
export class Party extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: requiredUnlessDraft, trim: true })
  title!: string;

  @Prop({ required: false, default: false })
  isFavorite!: boolean;

  @Prop({ required: false, trim: true })
  description!: string;

  @Prop({ required: false, trim: true })
  location!: string;

  @Prop({ default: 'published', enum: Object.values(StatusType) })
  status!: StatusType;

  @Prop({ default: Visibility.PUBLIC, enum: Object.values(Visibility) })
  visibility!: Visibility;

  /** Only sent to the owner, so they can share the private link. */
  @Prop({ select: false })
  private_key?: string;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (photos: string[]) => photos.length <= 5,
      message: 'A party can have at most 5 photos',
    },
  })
  images!: string[];

  @Prop({ required: false, min: 1 })
  guest_capacity!: number;

  @Prop({ required: false, enum: Object.values(ChargeType) })
  charge_type!: ChargeType;

  // @Prop({ required: false, enum: Object.values(PartyType) })
  @Prop({ required: false })
  party_type!: string;

  @Prop({ required: false, trim: true })
  party_rules!: string;

  @Prop({ required: false, default: 'false' })
  is_ticket_sales!: string;

  @Prop({ required: false, min: 0 })
  price!: number;

  @Prop({ required: false, min: 0 })
  beds!: number;

  @Prop({ required: false, min: 0 })
  bathrooms!: number;

  @Prop({ required: false, type: Date })
  start_date!: Date;

  @Prop({ required: false, type: Date })
  end_date!: Date;

  /** "HH:mm", 24-hour, Nigeria time. */
  @Prop({ required: false, trim: true })
  start_time?: string;

  /** End of the party's end date. MongoDB deletes the party once this passes. */
  @Prop({ required: false, type: Date })
  expires_at?: Date;

  @Prop({ required: false, type: Date, index: true })
  published_at?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PartySchema = SchemaFactory.createForClass(Party);

PartySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
