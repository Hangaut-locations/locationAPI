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
import { MediaService } from './media.service';

/** Hosts get a week to save a listing before uploads it doesn't use go. Has to match the note in the site's photo steps. */
const KEEP_UNSAVED_HOURS = 7 * 24;

/**
 * Deletes listing photos and videos nothing points at anymore, so they don't eat Cloudinary storage:
 * uploads never saved on a listing, parties MongoDB removed after they ended, deleted listings,
 * photos a host took off. Booking cover photos are kept for the guests' booking history.
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
      const references = await this.references();
      if (!references) {
        this.logger.warn('No listings found, skipping media cleanup');
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
      this.logger.warn(`Media cleanup failed: ${String(error)}`);
    } finally {
      this.running = false;
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
