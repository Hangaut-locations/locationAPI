import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { Model, Types } from 'mongoose';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import {
  Favorite,
  FavoriteTargetType,
} from '../favorites/schemas/favorite.schema';
import { Party } from './schemas/party.schema';

export interface PartiesByLocation {
  caption: string;
  parties: Party[];
}

export type PartyWithFavorite = Record<string, unknown> & {
  isFavorite: boolean;
};

@Injectable()
export class PartiesService {
  constructor(
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Favorite.name) private favoriteModel: Model<Favorite>,
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

  async create(
    ownerId: string,
    partyData: CreatePartyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Party> {
    if ((partyData.images?.length ?? 0) + images.length > 5) {
      throw new BadRequestException('A party can have at most 5 photos');
    }

    const photoUrls = await this.uploadImages(images, partyData.images);
    return new this.partyModel({
      ...partyData,
      images: photoUrls,
      ownerId: new Types.ObjectId(ownerId),
    }).save();
  }

  async findByOwner(ownerId: string): Promise<Party[]> {
    return this.partyModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  }

  async findById(partyId: string): Promise<Party | null> {
    try {
      const party = this.partyModel.findById(partyId).exec();

      if (!party) {
        null;
      }

      return party;
    } catch (err) {
      throw new InternalServerErrorException('Unable to retrieve party');
    }
  }

  async findAll(userId: string): Promise<PartyWithFavorite[]> {
    const parties = await this.partyModel
      .find()
      .populate('targetId')
      .sort({ createdAt: -1 })
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
      const parties = await this.partyModel.find().sort({ location: 1 }).lean();

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
    } catch (err) {
      throw new InternalServerErrorException('Unable to retrieve parties');
    }
  }

  //   GET all party categories
  async findAllCategories(): Promise<string[]> {
    const categories = await this.partyModel.distinct('category').exec();
    return categories as string[];
  }

  async update(
    partyId: string,
    ownerId: string,
    partyData: UpdatePartyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Party | null> {
    const party = await this.partyModel
      .findOne({ _id: partyId, ownerId })
      .exec();
    if (!party) {
      return null;
    }

    const updatedPartyData = { ...partyData };
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

    return this.partyModel
      .findOneAndUpdate({ _id: partyId, ownerId }, updatedPartyData, {
        new: true,
        runValidators: true,
      })
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
    return this.partyModel.findOneAndDelete({ _id: partyId, ownerId }).exec();
  }
}
