import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { requiredUnlessDraft } from '../../listings/draft';
import { Visibility } from '../../listings/visibility';

export enum ChargeType {
  PERSON = 'person',
  HOUR = 'hour',
}
// "entire" | "room" | "shared"

export enum SpaceType {
  ENTIRE = 'entire',
  ROOM = 'room',
  SHARED = 'shared',
}

export enum StatusType {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum PropertyType {
  BeachFront = 'Beach front',
  RoofTops = 'Roof tops',
  Homes = 'Homes',
  Mansions = 'Mansions',
  Studio = 'Studio',
  Castles = 'Castles',
  HouseBoat = 'House boat',
  Cabin = 'Cabin',
  TreeHouse = 'Tree house',
  AmazingViews = 'Amazing views',
  Frames = 'Frames',
  Houseboat = 'Houseboat',
  Omg = 'OMG',
  Islands = 'Islands',
}

@Schema({ timestamps: true })
export class Property extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ required: requiredUnlessDraft, trim: true })
  title!: string;

  @Prop({ required: false, default: false })
  isFavorite!: boolean;

  @Prop({ required: false, trim: true })
  description!: string;

  @Prop({ type: [String], default: [] })
  amenities!: string[];

  @Prop({ required: false, trim: true })
  location!: string;

  @Prop({ default: 'published', enum: Object.values(StatusType) })
  status!: StatusType;

  @Prop({ default: Visibility.PUBLIC, enum: Object.values(Visibility) })
  visibility!: Visibility;

  @Prop({ default: 'entire', enum: Object.values(SpaceType) })
  space_type!: SpaceType;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (photos: string[]) => photos.length <= 5,
      message: 'A property can have at most 5 photos',
    },
  })
  images!: string[];

  @Prop({ default: 'person', enum: Object.values(ChargeType) })
  charge_type!: ChargeType;

  // @Prop({ required: false, enum: Object.values(PropertyType) })
  @Prop({ required: false })
  property_type!: string;

  @Prop({ required: false, trim: true })
  property_rules!: string;

  @Prop({ required: false, default: 'auto' })
  booking_type!: string;

  @Prop({ required: false, default: 'auto' })
  booking_setting!: string;

  @Prop({ required: false, min: 0 })
  price!: number;

  @Prop({ required: false, min: 1 })
  guest_capacity!: number;

  @Prop({ required: false, min: 0 })
  beds!: number;

  @Prop({ required: false, min: 0 })
  bedrooms!: number;

  @Prop({ required: false, min: 0 })
  bathrooms!: number;

  @Prop({ required: false, type: Date, index: true })
  published_at?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PropertySchema = SchemaFactory.createForClass(Property);
