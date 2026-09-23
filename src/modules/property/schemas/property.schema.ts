import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

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

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: false, default: false })
  isFavorite!: boolean;

  @Prop({ required: false, trim: true })
  description!: string;

  @Prop({ required: false })
  amenties!: [];

  @Prop({ required: false, trim: true })
  location!: string;

  @Prop({ default: 'published', enum: Object.values(StatusType) })
  status!: StatusType;

  @Prop({ default: 'entire', enum: Object.values(SpaceType) })
  space_type!: StatusType;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: (photos: string[]) => photos.length <= 5,
      message: 'A property can have at most 5 photos',
    },
  })
  images!: string[];

  // @Prop({ required: false, enum: Object.values(ChargeType) })
  // charge_type!: ChargeType;

  // @Prop({ required: false, enum: Object.values(PropertyType) })
  @Prop({ required: false })
  property_type!: string;

  // @Prop({ required: false, trim: true })
  // property_rules!: string;

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

  @Prop({ required: false, type: Date })
  start_date!: Date;

  @Prop({ required: false, type: Date })
  end_date!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const PropertySchema = SchemaFactory.createForClass(Property);
