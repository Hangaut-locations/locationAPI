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
    private configService: ConfigService,
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

  async create(
    ownerId: string,
    partyData: CreatePartyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Party> {
    if ((partyData.images?.length ?? 0) + images.length > 5) {
      throw new BadRequestException('A party can have at most 5 photos');
    }
    this.assertDateOrder(partyData.start_date, partyData.end_date);

    const photoUrls = await this.uploadImages(images, partyData.images);
    return new this.partyModel({
      ...partyData,
      images: photoUrls,
      expires_at: partyData.end_date ? partyExpiry(partyData.end_date) : null,
      published_at: publishedAtFor(partyData.status ?? StatusType.PUBLISHED),
      private_key:
        partyData.visibility === Visibility.PRIVATE
          ? newPrivateKey()
          : undefined,
      ownerId: new Types.ObjectId(ownerId),
    }).save();
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
    const { private_key, ...shared } = party.toObject();
    return { ...(isOwner ? { ...shared, private_key } : shared), host };
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

    const updatedPartyData: UpdatePartyDto & {
      expires_at?: Date;
      published_at?: Date;
      private_key?: string;
    } = {
      ...partyData,
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

    const requestedImages = partyData.images ?? party.images;
    if (requestedImages.length + images.length > 5) {
      throw new BadRequestException('A party can have at most 5 photos');
    }

    if (partyData.images || images.length > 0) {
      updatedPartyData.images = await this.uploadImages(
        images,
        requestedImages,
      );
    }
    if ((updatedPartyData.images?.length ?? party.images.length) > 5) {
      throw new BadRequestException('A party can have at most 5 photos');
    }
    assertPublishable(
      { ...party.toObject(), ...updatedPartyData },
      PARTY_PUBLISH_FIELDS,
    );

    return this.partyModel
      .findOneAndUpdate({ _id: partyId, ownerId }, updatedPartyData, {
        new: true,
        runValidators: true,
      })
      .select('+private_key')
      .exec();
  }

  private async uploadImages(
    images: Express.Multer.File[],
    imageSources: string[] = [],
  ): Promise<string[]> {
    if (images.length + imageSources.length > 5) {
      throw new BadRequestException('You can upload at most 5 images');
    }

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
    return this.partyModel.findOneAndDelete({ _id: partyId, ownerId }).exec();
  }
}
