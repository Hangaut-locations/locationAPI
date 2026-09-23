import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { Model, Types } from 'mongoose';
import { CreatePropertyDto } from './dto/create-property.dto';
import { updatePropertyDto } from './dto/update-property.dto';
import {
  Favorite,
  FavoriteTargetType,
} from '../favorites/schemas/favorite.schema';
import { Property } from './schemas/property.schema';

export interface PropertyByLocation {
  caption: string;
  property: Property[];
}

export type PropertyWithFavorite = Record<string, unknown> & {
  isFavorite: boolean;
};

@Injectable()
export class PropertyService {
  constructor(
    @InjectModel(Property.name) private propertyModel: Model<Property>,
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
      ownerId: new Types.ObjectId(ownerId),
    }).save();
  }

  async findByOwner(ownerId: string): Promise<Property[]> {
    return this.propertyModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  }

  async findById(propertyId: string): Promise<Property | null> {
    try {
      const property = this.propertyModel.findById(propertyId).exec();

      if (!property) {
        null;
      }

      return property;
    } catch (err) {
      throw new InternalServerErrorException('Unable to retrieve property');
    }
  }

  async findAll(userId: string): Promise<PropertyWithFavorite[]> {
    const property = await this.propertyModel
      .find()
      .populate('targetId')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    const propertyIds = property.map((property) => property._id);
    const favoriteProperty = await this.favoriteModel
      .find({
        userId: new Types.ObjectId(userId),
        targetType: FavoriteTargetType.HOME,
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
        .find()
        .sort({ location: 1 })
        .lean();

      if (!properties.length) {
        return [];
      }

      if (userId) {
        const propertyIds = properties.map((property) => property._id);
        const favoriteProperty = await this.favoriteModel
          .find({
            userId: new Types.ObjectId(userId),
            targetType: FavoriteTargetType.HOME,
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
        caption: `Property in ${location}`,
        property: locationProperty,
      }));
    } catch (err) {
      throw new InternalServerErrorException('Unable to retrieve property');
    }
  }

  //   GET all property categories
  async findAllCategories(): Promise<string[]> {
    const categories = await this.propertyModel.distinct('category').exec();
    return categories as string[];
  }

  async update(
    propertyId: string,
    ownerId: string,
    propertyData: updatePropertyDto,
    images: Express.Multer.File[] = [],
  ): Promise<Property | null> {
    const property = await this.propertyModel
      .findOne({ _id: propertyId, ownerId })
      .exec();
    if (!property) {
      return null;
    }

    const updatedPropertyData = { ...propertyData };
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
    return this.propertyModel
      .findOneAndDelete({ _id: propertyId, ownerId })
      .exec();
  }
}
