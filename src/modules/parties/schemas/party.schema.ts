import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ChargeType {
  PERSON = 'person',
  HOUR = 'hour',
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

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, trim: true })
  location!: string;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (photos: string[]) => photos.length <= 5,
      message: 'A party can have at most 5 photos',
    },
  })
  images!: string[];

  @Prop({ required: true, min: 1 })
  guest_capacity!: number;

  @Prop({ required: true, enum: Object.values(ChargeType) })
  charge_type!: ChargeType;

  @Prop({ required: true, enum: Object.values(PartyType) })
  party_type!: PartyType;

  @Prop({ required: true, trim: true })
  party_rules!: string;

  @Prop({ required: true, default: 'false' })
  is_ticket_sales!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true, min: 0 })
  beds!: number;

  @Prop({ required: true, min: 0 })
  bathrooms!: number;

  @Prop({ enum: Object.values(StatusType), default: 'draft' })
  status!: StatusType;

  @Prop({ required: true, type: Date })
  start_date!: Date;

  @Prop({ required: true, type: Date })
  end_date!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PartySchema = SchemaFactory.createForClass(Party);
