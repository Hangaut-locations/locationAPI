import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PartyBooking } from '../bookings/schemas/party-booking.schema';
import { PropertyBooking } from '../bookings/schemas/property-booking.schema';
import { Party } from '../parties/schemas/party.schema';
import { Property } from '../property/schemas/property.schema';
import { Message } from '../chat/schemas/message.schema';
import { Story } from '../stories/schemas/story.schema';
import { MediaService } from './media.service';

/** Hosts get a week to save a listing before uploads it doesn't use go. Has to match the note in the site's photo steps. */
const KEEP_UNSAVED_HOURS = 7 * 24;

/** A story upload that was never saved can sit for an hour. A finished story is deleted right away. */
const STORY_UPLOAD_GRACE_MS = 60 * 60 * 1000;

/** A chat photo that was never sent can sit for an hour. A deleted message drops its file right away. */
const CHAT_UPLOAD_GRACE_MS = 60 * 60 * 1000;

/**
 * Deletes listing photos and videos nothing points at anymore, so they don't eat Cloudinary storage:
 * uploads never saved on a listing, parties MongoDB removed after they ended, deleted listings,
 * photos a host took off. Booking cover photos are kept for the guests' booking history.
 * Story files that no story still points at are deleted the same way.
 * Chat photos no message still shows are deleted the same way.
 * Runs soon after start (Render sleeps a lot) and then on a timer.
 */
@Injectable()
export class MediaCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(MediaCleanupService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(PropertyBooking.name)
    private propertyBookingModel: Model<PropertyBooking>,
    @InjectModel(PartyBooking.name)
    private partyBookingModel: Model<PartyBooking>,
    @InjectModel(Story.name) private storyModel: Model<Story>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    private mediaService: MediaService,
    private configService: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const every =
      Number(this.configService.get('MEDIA_CLEANUP_MINUTES')) * 60_000;
    const first = setTimeout(() => void this.run(), Math.min(every, 60_000));
    const repeat = setInterval(() => void this.run(), every);
    first.unref();
    repeat.unref();
    this.timers = [first, repeat];
  }

  onApplicationShutdown(): void {
    this.timers.forEach((timer) => clearTimeout(timer));
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.clearListings();
      await this.clearStories();
      await this.clearChats();
    } finally {
      this.running = false;
    }
  }

  private async clearListings(): Promise<void> {
    try {
      const references = await this.references();
      if (!references) {
        this.logger.warn('No listings found, skipping listing media cleanup');
        return;
      }

      const cutoff = Date.now() - KEEP_UNSAVED_HOURS * 60 * 60 * 1000;
      for (const type of ['image', 'video'] as const) {
        const unused = (await this.mediaService.listStored(type))
          .filter((item) => new Date(item.created_at).getTime() < cutoff)
          .map((item) => item.public_id)
          .filter((id) => !references.has(id));
        await this.mediaService.deleteMany(type, unused);
        if (unused.length) {
          this.logger.log(`Deleted ${unused.length} unused ${type}(s)`);
        }
      }
    } catch (error) {
      this.logger.warn(`Listing media cleanup failed: ${String(error)}`);
    }
  }

  /** Story photos and videos whose story row is already gone, same idea as a removed party. */
  private async clearStories(): Promise<void> {
    try {
      const rows = await this.storyModel.find().select('publicId').lean().exec();
      const referenced = new Set(
        rows.map((row) => row.publicId).filter((id): id is string => Boolean(id)),
      );
      const cutoff = Date.now() - STORY_UPLOAD_GRACE_MS;
      for (const type of ['image', 'video'] as const) {
        const unused = (await this.mediaService.listStoryFiles(type))
          .filter((item) => new Date(item.created_at).getTime() < cutoff)
          .map((item) => item.public_id)
          .filter((id) => !referenced.has(id));
        await this.mediaService.deleteMany(type, unused);
        if (unused.length) {
          this.logger.log(`Deleted ${unused.length} story ${type}(s)`);
        }
      }
    } catch (error) {
      this.logger.warn(`Story media cleanup failed: ${String(error)}`);
    }
  }

  /** Chat photos whose message was deleted, or that were uploaded and never sent. */
  private async clearChats(): Promise<void> {
    try {
      const rows = await this.messageModel
        .find({ photo: { $nin: [null, ''] } })
        .select('photo')
        .lean()
        .exec();
      const referenced = new Set(
        rows.flatMap(
          (row) => row.photo?.match(/hangaut\/chat\/[\w-]+/g) ?? [],
        ),
      );
      const cutoff = Date.now() - CHAT_UPLOAD_GRACE_MS;
      const unused = (await this.mediaService.listChatPhotos())
        .filter((item) => new Date(item.created_at).getTime() < cutoff)
        .map((item) => item.public_id)
        .filter((id) => !referenced.has(id));
      await this.mediaService.deleteMany('image', unused);
      if (unused.length) {
        this.logger.log(`Deleted ${unused.length} chat photo(s)`);
      }
    } catch (error) {
      this.logger.warn(`Chat photo cleanup failed: ${String(error)}`);
    }
  }

  /**
   * Public ids of every photo and video still in use, read straight out of the urls
   * ("https://res.cloudinary.com/x/image/upload/v12/hangaut/property/abc.jpg" -> "hangaut/property/abc").
   * null means no listings at all, which more likely means the database is wrong than empty.
   */
  private async references(): Promise<Set<string> | null> {
    const [properties, parties, propertyBookings, partyBookings] =
      await Promise.all([
        this.propertyModel.find().select('images video').lean().exec(),
        this.partyModel.find().select('images video').lean().exec(),
        this.propertyBookingModel
          .find({ image: { $nin: [null, ''] } })
          .select('image')
          .lean()
          .exec(),
        this.partyBookingModel
          .find({ image: { $nin: [null, ''] } })
          .select('image')
          .lean()
          .exec(),
      ]);
    if (!properties.length && !parties.length) return null;

    const text = [...properties, ...parties]
      .flatMap((listing) => [
        ...(listing.images ?? []),
        listing.video?.public_id ?? '',
      ])
      .concat([...propertyBookings, ...partyBookings].map((b) => b.image ?? ''))
      .join('\n');
    return new Set(text.match(/hangaut\/[\w/-]+/g));
  }
}
