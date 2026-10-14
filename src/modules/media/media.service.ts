import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { ListingVideo, MAX_VIDEO_SECONDS } from '../listings/video';

export type MediaKind = 'photo' | 'video';
export type MediaListing = 'property' | 'party';

const FOLDERS: Record<MediaListing, string> = {
  property: 'hangaut/property',
  party: 'hangaut/parties',
};

// Phones record HEVC .mov files a lot of browsers can't play, so guests get an mp4 copy.
const PLAYBACK = 'c_limit,w_1280,q_auto,vc_h264';

export interface UploadSignature {
  upload_url: string;
  api_key: string;
  signature: string;
  params: Record<string, string>;
}

interface CloudinaryVideo {
  public_id: string;
  secure_url: string;
  duration?: number;
  tags?: string[];
}

export type ResourceType = 'image' | 'video';

export interface StoredMedia {
  public_id: string;
  secure_url: string;
  created_at: string;
}

const ownerTag = (userId: string) => `owner_${userId}`;

/** On every direct upload until a saved listing uses it, see MediaCleanupService. */
export const UNSAVED_TAG = 'unsaved';

/** "https://res.cloudinary.com/x/image/upload/v12/hangaut/property/abc.jpg" -> "hangaut/property/abc" */
export const publicIdFromUrl = (url: string): string | null =>
  url.match(
    /\/upload\/(?:.+\/)?v\d+\/(hangaut\/[^?#]+)\.\w+(?:[?#].*)?$/,
  )?.[1] ?? null;

const chunk = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private configService: ConfigService) {
    const cloudinaryUrl =
      this.configService.getOrThrow<string>('CLOUDINARY_URL');
    cloudinary.config({
      cloud_name: new URL(cloudinaryUrl).hostname,
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
      secure: true,
    });
  }

  /** Lets the browser send a file straight to Cloudinary, so big uploads never pass through the API. */
  signUpload(
    userId: string,
    kind: MediaKind,
    listing: MediaListing,
  ): UploadSignature {
    const params: Record<string, string> = {
      timestamp: String(Math.round(Date.now() / 1000)),
      folder:
        kind === 'video' ? `${FOLDERS[listing]}/videos` : FOLDERS[listing],
      tags: `${ownerTag(userId)},${UNSAVED_TAG}`,
    };
    if (kind === 'video') {
      params.eager = `${PLAYBACK}/mp4`;
      params.eager_async = 'true';
    }

    const { api_key, api_secret } = cloudinary.config();
    return {
      upload_url: cloudinary.utils.api_url('upload', {
        resource_type: kind === 'video' ? 'video' : 'image',
      }),
      api_key: api_key!,
      signature: cloudinary.utils.api_sign_request(params, api_secret!),
      params,
    };
  }

  /** Looks the upload up on Cloudinary, so the length can't be faked by the browser. */
  async findVideo(publicId: string, userId: string): Promise<ListingVideo> {
    let video: CloudinaryVideo | undefined;
    try {
      video = (await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      })) as CloudinaryVideo;
    } catch {
      video = undefined;
    }
    if (!video?.tags?.includes(ownerTag(userId))) {
      throw new BadRequestException(
        "We couldn't find that video, upload it again",
      );
    }

    const duration = Math.round(video.duration ?? 0);
    if (duration > MAX_VIDEO_SECONDS) {
      await this.removeVideo(publicId);
      throw new BadRequestException(
        'The video is too long, keep it to 1 minute',
      );
    }

    const base = video.secure_url.replace(/\.[^./]+$/, '');
    return {
      public_id: video.public_id,
      url: `${base.replace('/upload/', `/upload/${PLAYBACK}/`)}.mp4`,
      poster: `${base.replace('/upload/', '/upload/so_0/')}.jpg`,
      duration,
    };
  }

  /**
   * What to store for the listing's video: undefined keeps it, null removes it.
   * `requested` is the public id from the form, "" means the host took it off.
   */
  async nextVideo(
    current: ListingVideo | null | undefined,
    requested: string | undefined,
    userId: string,
  ): Promise<ListingVideo | null | undefined> {
    if (requested === undefined || requested === current?.public_id) {
      return undefined;
    }
    return requested ? this.findVideo(requested, userId) : null;
  }

  /** Takes the unsaved tag off what a listing now uses, so the cleanup leaves it alone. */
  async markSaved(photos: string[] = [], videoId?: string): Promise<void> {
    const photoIds = photos
      .map(publicIdFromUrl)
      .filter((id): id is string => !!id);
    await this.untag('image', photoIds);
    await this.untag('video', videoId ? [videoId] : []);
  }

  async untag(type: ResourceType, publicIds: string[]): Promise<void> {
    for (const ids of chunk(publicIds, 1000)) {
      try {
        await cloudinary.uploader.remove_tag(UNSAVED_TAG, ids, {
          resource_type: type,
        });
      } catch (error) {
        this.logger.warn(`Couldn't mark ${type}s as saved: ${String(error)}`);
      }
    }
  }

  async listUnsaved(type: ResourceType): Promise<StoredMedia[]> {
    const found: StoredMedia[] = [];
    let cursor: string | undefined;
    // 5000 is plenty for a day, the rest waits for the next run
    for (let page = 0; page < 10; page++) {
      const result = await cloudinary.api.resources_by_tag(UNSAVED_TAG, {
        resource_type: type,
        max_results: 500,
        ...(cursor && { next_cursor: cursor }),
      });
      found.push(...(result.resources as StoredMedia[]));
      cursor = result.next_cursor;
      if (!cursor) break;
    }
    return found;
  }

  async deleteMany(type: ResourceType, publicIds: string[]): Promise<void> {
    for (const ids of chunk(publicIds, 100)) {
      await cloudinary.api.delete_resources(ids, { resource_type: type });
    }
  }

  async removeVideo(publicId?: string): Promise<void> {
    if (!publicId) return;
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'video',
        invalidate: true,
      });
    } catch (error) {
      this.logger.warn(`Couldn't delete video ${publicId}: ${String(error)}`);
    }
  }
}
