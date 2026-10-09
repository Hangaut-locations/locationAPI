import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { isValidObjectId, Model, Types } from 'mongoose';
import {
  CreatePropertyDto,
  PROPERTY_PUBLISH_FIELDS,
} from './dto/create-property.dto';
import { assertPublishable } from '../listings/draft';
import { NOT_PRIVATE } from '../listings/visibility';
import {
  BACKFILL_PUBLISHED_AT,
  NEWEST_FIRST,
  publishedAtFor,
} from '../listings/published';
import { updatePropertyDto } from './dto/update-property.dto';
import {
  Favorite,
  FavoriteTargetType,
} from '../favorites/schemas/favorite.schema';
import { User } from '../users/schemas/user.schema';
import { findPublicHost, PublicHost } from '../users/host';
import { Property, StatusType } from './schemas/property.schema';

export type PropertyWithHost = Record<string, unknown> & {
  host: PublicHost | null;
};

export interface PropertyByLocation {
  caption: string;
  properties: Property[];
}

export type PropertyWithFavorite = Record<string, unknown> & {
  isFavorite: boolean;
};

@Injectable()
export class PropertyService implements OnModuleInit {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>,
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

  async onModuleInit(): Promise<void> {
    await this.propertyModel
      .updateMany(
        { status: { $ne: StatusType.DRAFT }, published_at: null },
        BACKFILL_PUBLISHED_AT,
        { updatePipeline: true },
      )
      .exec();
  }

  async create(
    ownerId: string,
    propertyData: CreatePropertyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Property> {
    if ((propertyData.images?.length ?? 0) + images.length > 5) {
      throw new BadRequestException('A property can have at most 5 photos');
    }

    const photoUrls = await this.uploadImages(images, propertyData.images);
    return new this.propertyModel({
      ...propertyData,
      images: photoUrls,
      published_at: publishedAtFor(propertyData.status ?? StatusType.PUBLISHED),
      ownerId: new Types.ObjectId(ownerId),
    }).save();
  }

  async findByOwner(ownerId: string): Promise<Property[]> {
    return this.propertyModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  }

  async findById(
    propertyId: string,
    viewerId?: string,
  ): Promise<PropertyWithHost | null> {
    if (!isValidObjectId(propertyId)) {
      return null;
    }

    const property = await this.propertyModel.findById(propertyId).exec();
    if (!property) {
      return null;
    }

    const isOwner = viewerId !== undefined && property.ownerId.equals(viewerId);
    if (property.status !== StatusType.PUBLISHED && !isOwner) {
      return null;
    }

    const host = await findPublicHost(this.userModel, property.ownerId);
    return { ...property.toObject(), host };
  }

  async findAll(userId: string): Promise<PropertyWithFavorite[]> {
    const property = await this.propertyModel
      .find({ status: StatusType.PUBLISHED, ...NOT_PRIVATE })
      .sort(NEWEST_FIRST)
      .lean()
      .exec();
    const propertyIds = property.map((property) => property._id);
    const favoriteProperty = await this.favoriteModel
      .find({
        userId: new Types.ObjectId(userId),
        targetType: FavoriteTargetType.PROPERTY,
        targetId: { $in: propertyIds },
      })
      .select('targetId')
      .lean()
      .exec();
    const favoritePropertyIds = new Set(
      favoriteProperty.map((favorite) => favorite.targetId.toString()),
    );

    return property.map((property) => ({
      ...property,
      isFavorite: favoritePropertyIds.has(property._id.toString()),
    }));
  }

  async findAllGroupedByLocation(
    userId?: string,
  ): Promise<PropertyByLocation[]> {
    try {
      const properties = await this.propertyModel
        .find({ status: StatusType.PUBLISHED, ...NOT_PRIVATE })
        .sort(NEWEST_FIRST)
        .lean();

      if (!properties.length) {
        return [];
      }

      if (userId) {
        const propertyIds = properties.map((property) => property._id);
        const favoriteProperty = await this.favoriteModel
          .find({
            userId: new Types.ObjectId(userId),
            targetType: FavoriteTargetType.PROPERTY,
            targetId: { $in: propertyIds },
          })
          .select('targetId')
          .lean()
          .exec();
        const favoritePropertyIds = new Set(
          favoriteProperty.map((favorite) => favorite.targetId.toString()),
        );

        properties.forEach((property) => {
          property.isFavorite = favoritePropertyIds.has(
            property._id.toString(),
          );
        });
      }

      const propertyByLocation = new Map<string, Property[]>();

      for (const property of properties) {
        const locationProperty =
          propertyByLocation.get(property.location) ?? [];
        locationProperty.push(property);
        propertyByLocation.set(property.location, locationProperty);
      }

      return Array.from(propertyByLocation, ([location, locationProperty]) => ({
        caption: `Properties in ${location}`,
        properties: locationProperty,
      }));
    } catch {
      throw new InternalServerErrorException('Unable to retrieve property');
    }
  }

  //   GET all property categories
  async findAllCategories(): Promise<string[]> {
    return this.propertyModel.distinct('property_type').exec();
  }

  async update(
    propertyId: string,
    ownerId: string,
    propertyData: updatePropertyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Property | null> {
    if (!isValidObjectId(propertyId)) {
      return null;
    }

    const property = await this.propertyModel
      .findOne({ _id: propertyId, ownerId })
      .exec();
    if (!property) {
      return null;
    }

    const updatedPropertyData: updatePropertyDto & { published_at?: Date } = {
      ...propertyData,
    };
    const publishedAt = publishedAtFor(propertyData.status, property.status);
    if (publishedAt) {
      updatedPropertyData.published_at = publishedAt;
    }
    const requestedImages = propertyData.images ?? property.images;
    if (requestedImages.length + images.length > 5) {
      throw new BadRequestException('A property can have at most 5 photos');
    }

    if (propertyData.images || images.length > 0) {
      updatedPropertyData.images = await this.uploadImages(
        images,
        requestedImages,
      );
    }
    if ((updatedPropertyData.images?.length ?? property.images.length) > 5) {
      throw new BadRequestException('A property can have at most 5 photos');
    }
    assertPublishable(
      { ...property.toObject(), ...updatedPropertyData },
      PROPERTY_PUBLISH_FIELDS,
    );

    return this.propertyModel
      .findOneAndUpdate({ _id: propertyId, ownerId }, updatedPropertyData, {
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
        { folder: 'hangaut/property', resource_type: 'image' },
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

  async delete(propertyId: string, ownerId: string): Promise<Property | null> {
    if (!isValidObjectId(propertyId)) {
      return null;
    }

    return this.propertyModel
      .findOneAndDelete({ _id: propertyId, ownerId })
      .exec();
  }
}
