import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Party } from '../parties/schemas/party.schema';
import { Property } from '../property/schemas/property.schema';
import {
  MediaService,
  publicIdFromUrl,
  ResourceType,
  StoredMedia,
} from './media.service';

/** Hosts get a week to save a listing before uploads it doesn't use go. Has to match the note in the site's photo steps. */
const KEEP_UNSAVED_HOURS = 7 * 24;

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Deletes photos and videos that were uploaded but never saved on a listing
 * (host closed the wizard, swapped the video before saving...), so they don't eat Cloudinary storage.
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
      const cutoff = Date.now() - KEEP_UNSAVED_HOURS * 60 * 60 * 1000;
      for (const type of ['image', 'video'] as const) {
        const stale = (await this.mediaService.listUnsaved(type)).filter(
          (item) => new Date(item.created_at).getTime() < cutoff,
        );
        if (!stale.length) continue;

        // Never delete something a listing points at, even if untagging failed when it was saved.
        const used = await this.inUse(type, stale);
        const unused = stale
          .map((item) => item.public_id)
          .filter((id) => !used.has(id));
        await this.mediaService.untag(type, [...used]);
        await this.mediaService.deleteMany(type, unused);
        if (unused.length) {
          this.logger.log(`Deleted ${unused.length} unsaved ${type}(s)`);
        }
      }
    } catch (error) {
      this.logger.warn(`Media cleanup failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async inUse(
    type: ResourceType,
    items: StoredMedia[],
  ): Promise<Set<string>> {
    const ids = items.map((item) => item.public_id);
    const used = new Set<string>();

    if (type === 'video') {
      const filter = { 'video.public_id': { $in: ids } };
      const listings = await Promise.all([
        this.propertyModel.find(filter).select('video').lean().exec(),
        this.partyModel.find(filter).select('video').lean().exec(),
      ]);
      listings.flat().forEach((listing) => {
        if (listing.video?.public_id) used.add(listing.video.public_id);
      });
      return used;
    }

    for (let start = 0; start < ids.length; start += 100) {
      const pattern = new RegExp(
        `/(${ids
          .slice(start, start + 100)
          .map(escapeRegex)
          .join('|')})\\.`,
      );
      const filter = { images: pattern };
      const listings = await Promise.all([
        this.propertyModel.find(filter).select('images').lean().exec(),
        this.partyModel.find(filter).select('images').lean().exec(),
      ]);
      listings
        .flat()
        .flatMap((listing) => listing.images ?? [])
        .map(publicIdFromUrl)
        .forEach((id) => id && ids.includes(id) && used.add(id));
    }
    return used;
  }
}
