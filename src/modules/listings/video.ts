import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Longest listing video we keep, with a little room for phones that record 60.4s. */
export const MAX_VIDEO_SECONDS = 62;

/** Cloudinary public id of an uploaded listing video, or "" to remove it. */
export const VIDEO_ID_PATTERN =
  /^$|^hangaut\/(property|parties)\/videos\/[\w-]+$/;

@Schema({ _id: false })
export class ListingVideo {
  @Prop({ required: true })
  public_id!: string;

  @Prop({ required: true })
  url!: string;

  @Prop({ required: true })
  poster!: string;

  @Prop({ required: true })
  duration!: number;
}

export const ListingVideoSchema = SchemaFactory.createForClass(ListingVideo);
