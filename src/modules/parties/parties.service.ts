import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { Model, Types } from 'mongoose';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { Party } from './schemas/party.schema';

export interface PartiesByLocation {
  caption: string;
  parties: Party[];
}

@Injectable()
export class PartiesService {
  constructor(
    @InjectModel(Party.name) private partyModel: Model<Party>,
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

    const photoUrls = await this.uploadImages(images);
    console.log('photoUrls', photoUrls);
    console.log('ownderId', ownerId);
    return new this.partyModel({
      ...partyData,
      images: [...(partyData.images ?? []), ...photoUrls],
      ownerId: new Types.ObjectId(ownerId),
    }).save();
  }

  async findByOwner(ownerId: string): Promise<Party[]> {
    return this.partyModel.find({ ownerId }).sort({ createdAt: -1 }).exec();
  }

  async findById(partyId: string): Promise<Party | null> {
    return this.partyModel.findById(partyId).exec();
  }

  async findAll(): Promise<Party[]> {
    return this.partyModel.find().sort({ createdAt: -1 }).exec();
  }

  async findAllGroupedByLocation(): Promise<PartiesByLocation[]> {
    const parties = await this.findAll();
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
    const existingPhotoUrls = partyData.images ?? party.images;
    if (existingPhotoUrls.length + images.length > 5) {
      throw new BadRequestException('A party can have at most 5 photos');
    }

    const photoUrls = await this.uploadImages(images);
    if (photoUrls.length > 0) {
      updatedPartyData.images = [...existingPhotoUrls, ...photoUrls];
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

  private async uploadImages(images: Express.Multer.File[]): Promise<string[]> {
    if (images.length > 5) {
      throw new BadRequestException('You can upload at most 5 images');
    }

    return Promise.all(images.map((image) => this.uploadImage(image.buffer)));
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
