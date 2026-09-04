import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';
import { Favorite } from './schemas/favorite.schema';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectModel(Favorite.name) private favoriteModel: Model<Favorite>,
  ) {}

  async create(
    userId: string,
    favoriteData: CreateFavoriteDto,
  ): Promise<Favorite> {
    return new this.favoriteModel({
      ...favoriteData,
      userId: new Types.ObjectId(userId),
      targetId: new Types.ObjectId(favoriteData.targetId),
    }).save();
  }

  findAll(userId: string): Promise<Favorite[]> {
    return this.favoriteModel.find({ userId }).sort({ createdAt: -1 }).exec();
  }

  findById(userId: string, favoriteId: string): Promise<Favorite | null> {
    return this.favoriteModel.findOne({ _id: favoriteId, userId }).exec();
  }

  update(
    userId: string,
    favoriteId: string,
    favoriteData: UpdateFavoriteDto,
  ): Promise<Favorite | null> {
    const updateData = {
      ...favoriteData,
      ...(favoriteData.targetId
        ? { targetId: new Types.ObjectId(favoriteData.targetId) }
        : {}),
    };

    return this.favoriteModel
      .findOneAndUpdate({ _id: favoriteId, userId }, updateData, {
        new: true,
        runValidators: true,
      })
      .exec();
  }

  delete(userId: string, favoriteId: string): Promise<Favorite | null> {
    return this.favoriteModel
      .findOneAndDelete({ _id: favoriteId, userId })
      .exec();
  }
}
