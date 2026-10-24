import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { isValidObjectId, Model, Types } from 'mongoose';
import { CreatePartyDto, PARTY_PUBLISH_FIELDS } from './dto/create-party.dto';
import { assertPublishable } from '../listings/draft';
import {
  canOpenListing,
  MISSING_PRIVATE_KEY,
  newPrivateKey,
  NOT_PRIVATE,
  Visibility,
} from '../listings/visibility';
import {
  BACKFILL_PUBLISHED_AT,
  NEWEST_FIRST,
  publishedAtFor,
} from '../listings/published';
import { UpdatePartyDto } from './dto/update-party.dto';
import {
  Favorite,
  FavoriteTargetType,
} from '../favorites/schemas/favorite.schema';
import { ListingVideo } from '../listings/video';
import { BookingStatus } from '../bookings/schemas/booking-status';
import { PartyBooking } from '../bookings/schemas/party-booking.schema';
import { MediaService } from '../media/media.service';
import { User } from '../users/schemas/user.schema';
import { findPublicHost, PublicHost } from '../users/host';
import { Party, StatusType } from './schemas/party.schema';

export type PartyWithHost = Record<string, unknown> & {
  host: PublicHost | null;
};

export interface PartiesByLocation {
  caption: string;
  parties: Party[];
}

export type PartyWithFavorite = Record<string, unknown> & {
  isFavorite: boolean;
};

/** Nigeria (WAT) is UTC+1 all year. */
const NIGERIA_UTC_OFFSET_MS = 60 * 60 * 1000;

/**
 * Midnight at the end of the party's end date, Nigeria time.
 * Dates arrive as "YYYY-MM-DD", which is stored as UTC midnight of that day.
 */
export const partyExpiry = (endDate: Date | string): Date => {
  const end = new Date(endDate);
  const nextDayUtc = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate() + 1,
  );
  return new Date(nextDayUtc - NIGERIA_UTC_OFFSET_MS);
};

@Injectable()
export class PartiesService implements OnModuleInit {
  private readonly logger = new Logger(PartiesService.name);

  constructor(
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Favorite.name) private favoriteModel: Model<Favorite>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(PartyBooking.name)
    private partyBookingModel: Model<PartyBooking>,
    private configService: ConfigService,
    private mediaService: MediaService,
  ) {
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

  /** Parties created before auto-delete existed get an expiry too, so ended ones are cleaned up. */
  async onModuleInit(): Promise<void> {
    await this.partyModel
      .updateMany(
        { status: { $ne: StatusType.DRAFT }, published_at: null },
        BACKFILL_PUBLISHED_AT,
        { updatePipeline: true },
      )
      .exec();
    const keyless = await this.partyModel
      .find(MISSING_PRIVATE_KEY)
      .select('_id')
      .lean()
      .exec();
    if (keyless.length) {
      await this.partyModel.bulkWrite(
        keyless.map((party) => ({
          updateOne: {
            filter: { _id: party._id },
            update: { $set: { private_key: newPrivateKey() } },
          },
        })),
      );
    }

    const parties = await this.partyModel
      .find({ expires_at: null, end_date: { $ne: null } })
      .select('end_date')
      .lean()
      .exec();
    if (!parties.length) return;

    await this.partyModel.bulkWrite(
      parties.map((party) => ({
        updateOne: {
          filter: { _id: party._id },
          update: { $set: { expires_at: partyExpiry(party.end_date) } },
        },
      })),
    );
    this.logger.log(`Set auto-delete date on ${parties.length} older parties`);
  }

  /** Published, public parties that haven't ended. */
  private publicFilter() {
    return {
      status: { $ne: StatusType.DRAFT },
      ...NOT_PRIVATE,
      $or: [{ expires_at: null }, { expires_at: { $gt: new Date() } }],
    };
  }

  private assertDateOrder(startDate?: Date | string, endDate?: Date | string) {
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException({
        message: 'Validation failed',
        data: [
          {
            field: 'end_date',
            messages: ['End date cannot be before the start date'],
          },
        ],
      });
    }
  }

  private assertEndTime(
    startDate?: Date | string,
    endDate?: Date | string,
    startTime?: string,
    endTime?: string | null,
  ) {
    if (!endTime || !startTime || !startDate) return;
    const startDay = new Date(startDate).toISOString().slice(0, 10);
    const endDay = endDate
      ? new Date(endDate).toISOString().slice(0, 10)
      : startDay;
    if (endDay > startDay || endTime > startTime) return;
    throw new BadRequestException({
      message: 'Validation failed',
      data: [
        {
          field: 'end_time',
          messages: ['End time has to be after the start time'],
        },
      ],
    });
  }

  /** How many of each extra ticket are still for sale. */
  private async choicesLeft(
    partyId: Types.ObjectId,
    options: { name: string; price: number; available: number }[],
  ) {
    if (!options.length) return [];
    const rows = await this.partyBookingModel.aggregate<{
      _id: string;
      guests: number;
    }>([
      {
        $match: {
          partyId,
          status: BookingStatus.CONFIRMED,
          ticket_name: { $type: 'string', $ne: '' },
        },
      },
      {
        $group: {
          _id: { $toLower: '$ticket_name' },
          guests: { $sum: '$guests' },
        },
      },
    ]);
    const sold = new Map(rows.map((row) => [row._id, row.guests]));
    return options.map((option) => ({
      name: option.name,
      price: option.price,
      available: option.available,
      left: Math.max(
        0,
        option.available - (sold.get(option.name.toLowerCase()) ?? 0),
      ),
    }));
  }

  private assertTicketOptions(
    capacity: number | undefined,
    options: { name: string; available: number }[] | undefined,
  ) {
    const seen = new Set<string>();
    for (const option of options ?? []) {
      const key = option.name.trim().toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException('Each ticket needs its own name');
      }
      seen.add(key);
      if (capacity && option.available > capacity) {
        throw new BadRequestException(
          `${option.name} has more tickets than the party can hold`,
        );
      }
    }
  }

  async create(
    ownerId: string,
    partyData: CreatePartyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Party> {
    this.assertDateOrder(partyData.start_date, partyData.end_date);
    this.assertEndTime(
      partyData.start_date,
      partyData.end_date,
      partyData.start_time,
      partyData.end_time,
    );
    this.assertTicketOptions(
      partyData.guest_capacity,
      partyData.ticket_options,
    );
    if (partyData.end_time === '') delete partyData.end_time;

    const { video, ...fields } = partyData;
    const listingVideo = await this.mediaService.nextVideo(
      null,
      video,
      ownerId,
    );
    const photoUrls = await this.uploadImages(images, partyData.images);
    const party = await new this.partyModel({
      ...fields,
      images: photoUrls,
      video: listingVideo ?? null,
      expires_at: partyData.end_date ? partyExpiry(partyData.end_date) : null,
      published_at: publishedAtFor(partyData.status ?? StatusType.PUBLISHED),
      private_key:
        partyData.visibility === Visibility.PRIVATE
          ? newPrivateKey()
          : undefined,
      ownerId: new Types.ObjectId(ownerId),
    }).save();
    return party;
  }

  async findByOwner(ownerId: string): Promise<Party[]> {
    return this.partyModel
      .find({ ownerId })
      .select('+private_key')
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Drafts are only visible to their owner, private parties need the key from the link. */
  async findById(
    partyId: string,
    userId?: string,
    key?: string,
  ): Promise<PartyWithHost | null> {
    if (!isValidObjectId(partyId)) {
      return null;
    }

    const party = await this.partyModel
      .findById(partyId)
      .select('+private_key')
      .exec();
    if (!party) {
      return null;
    }

    const isOwner = !!userId && party.ownerId.toString() === userId.toString();
    if (party.status === StatusType.DRAFT && !isOwner) {
      return null;
    }
    if (!canOpenListing(party, isOwner, key)) {
      throw new ForbiddenException(
        'This party is private. Ask the host for the link.',
      );
    }

    const host = await findPublicHost(this.userModel, party.ownerId);
    const ticket_options = await this.choicesLeft(
      party._id,
      party.ticket_options ?? [],
    );
    const { private_key, ...shared } = party.toObject();
    return {
      ...(isOwner ? { ...shared, private_key } : shared),
      ticket_options,
      host,
    };
  }

  /** New key for the private link, old links stop working. */
  async resetPrivateKey(
    partyId: string,
    ownerId: string,
  ): Promise<string | null> {
    if (!isValidObjectId(partyId)) {
      return null;
    }
    const privateKey = newPrivateKey();
    const party = await this.partyModel
      .findOneAndUpdate(
        { _id: partyId, ownerId, visibility: Visibility.PRIVATE },
        { private_key: privateKey },
      )
      .exec();
    return party ? privateKey : null;
  }

  async findAll(userId: string): Promise<PartyWithFavorite[]> {
    const parties = await this.partyModel
      .find(this.publicFilter())
      .sort(NEWEST_FIRST)
      .lean()
      .exec();
    const partyIds = parties.map((party) => party._id);
    const favoriteParties = await this.favoriteModel
      .find({
        userId: new Types.ObjectId(userId),
        targetType: FavoriteTargetType.PARTY,
        targetId: { $in: partyIds },
      })
      .select('targetId')
      .lean()
      .exec();
    const favoritePartyIds = new Set(
      favoriteParties.map((favorite) => favorite.targetId.toString()),
    );

    return parties.map((party) => ({
      ...party,
      isFavorite: favoritePartyIds.has(party._id.toString()),
    }));
  }

  async findAllGroupedByLocation(
    userId?: string,
  ): Promise<PartiesByLocation[]> {
    try {
      const parties = await this.partyModel
        .find(this.publicFilter())
        .sort(NEWEST_FIRST)
        .lean();

      if (!parties.length) {
        return [];
      }

      if (userId) {
        const partyIds = parties.map((party) => party._id);
        const favoriteParties = await this.favoriteModel
          .find({
            userId: new Types.ObjectId(userId),
            targetType: FavoriteTargetType.PARTY,
            targetId: { $in: partyIds },
          })
          .select('targetId')
          .lean()
          .exec();
        const favoritePartyIds = new Set(
          favoriteParties.map((favorite) => favorite.targetId.toString()),
        );

        parties.forEach((party) => {
          party.isFavorite = favoritePartyIds.has(party._id.toString());
        });
      }

      const partiesByLocation = new Map<string, Party[]>();

      for (const party of parties) {
        const locationParties = partiesByLocation.get(party.location) ?? [];
        locationParties.push(party);
        partiesByLocation.set(party.location, locationParties);
      }

      return Array.from(partiesByLocation, ([location, locationParties]) => ({
        caption: `Parties in ${location}`,
        parties: locationParties,
      }));
    } catch {
      throw new InternalServerErrorException('Unable to retrieve parties');
    }
  }

  //   GET all party categories
  async findAllCategories(): Promise<string[]> {
    return this.partyModel.distinct('party_type').exec();
  }

  async update(
    partyId: string,
    ownerId: string,
    partyData: UpdatePartyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Party | null> {
    if (!isValidObjectId(partyId)) {
      return null;
    }

    const party = await this.partyModel
      .findOne({ _id: partyId, ownerId })
      .select('+private_key')
      .exec();
    if (!party) {
      return null;
    }

    this.assertDateOrder(
      partyData.start_date ?? party.start_date,
      partyData.end_date ?? party.end_date,
    );
    this.assertEndTime(
      partyData.start_date ?? party.start_date,
      partyData.end_date ?? party.end_date,
      partyData.start_time ?? party.start_time,
      partyData.end_time === '' ? partyData.end_time : (partyData.end_time ?? party.end_time),
    );
    this.assertTicketOptions(
      partyData.guest_capacity ?? party.guest_capacity,
      partyData.ticket_options ?? party.ticket_options,
    );

    const { video, ...changes } = partyData;
    const updatedPartyData: Omit<UpdatePartyDto, 'video'> & {
      expires_at?: Date;
      published_at?: Date;
      private_key?: string;
      video?: ListingVideo | null;
    } = {
      ...changes,
    };
    if (partyData.visibility === Visibility.PRIVATE && !party.private_key) {
      updatedPartyData.private_key = newPrivateKey();
    }
    const publishedAt = publishedAtFor(partyData.status, party.status);
    if (publishedAt) {
      updatedPartyData.published_at = publishedAt;
    }
    if (partyData.end_date) {
      updatedPartyData.expires_at = partyExpiry(partyData.end_date);
    }
    if (partyData.end_time === '') {
      updatedPartyData.end_time = null;
    }

    if (partyData.images || images.length > 0) {
      updatedPartyData.images = await this.uploadImages(
        images,
        partyData.images ?? party.images,
      );
    }
    assertPublishable(
      { ...party.toObject(), ...updatedPartyData },
      PARTY_PUBLISH_FIELDS,
    );
    const listingVideo = await this.mediaService.nextVideo(
      party.video,
      video,
      ownerId,
    );
    if (listingVideo !== undefined) {
      updatedPartyData.video = listingVideo;
    }

    const updated = await this.partyModel
      .findOneAndUpdate({ _id: partyId, ownerId }, updatedPartyData, {
        new: true,
        runValidators: true,
      })
      .select('+private_key')
      .exec();
    if (updated && listingVideo !== undefined) {
      await this.mediaService.removeVideo(party.video?.public_id);
    }
    return updated;
  }

  private async uploadImages(
    images: Express.Multer.File[],
    imageSources: string[] = [],
  ): Promise<string[]> {
    const uploadedFiles = await Promise.all(
      images.map((image) => this.uploadImage(image.buffer)),
    );
    const uploadedDataUris = await Promise.all(
      imageSources.map((source) =>
        source.startsWith('data:')
          ? this.uploadImage(this.dataUriToBuffer(source))
          : Promise.resolve(source),
      ),
    );

    return [...uploadedDataUris, ...uploadedFiles];
  }

  private dataUriToBuffer(source: string): Buffer {
    const match = source.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
    if (!match) {
      throw new BadRequestException('Invalid image data URI');
    }

    return Buffer.from(match[1], 'base64');
  }

  private uploadImage(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'hangaut/parties', resource_type: 'image' },
        (error, result?: UploadApiResponse) => {
          if (error || !result) {
            reject(
              error instanceof Error
                ? error
                : new Error(
                    error ? JSON.stringify(error) : 'Cloudinary upload failed',
                  ),
            );
            return;
          }
          resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });
  }

  async delete(partyId: string, ownerId: string): Promise<Party | null> {
    if (!isValidObjectId(partyId)) {
      return null;
    }
    const party = await this.partyModel
      .findOneAndDelete({ _id: partyId, ownerId })
      .exec();
    await this.mediaService.removeVideo(party?.video?.public_id);
    return party;
  }
}
