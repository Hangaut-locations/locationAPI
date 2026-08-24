import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { Party } from './schemas/party.schema';

@Injectable()
export class PartiesService {
  constructor(@InjectModel(Party.name) private partyModel: Model<Party>) {}

  async create(ownerId: string, partyData: CreatePartyDto): Promise<Party> {
    return new this.partyModel({
      ...partyData,
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

  //   GET all party categories
  async findAllCategories(): Promise<string[]> {
    const categories: any = await this.partyModel.distinct('category').exec();
    return categories;
  }

  async update(
    partyId: string,
    ownerId: string,
    partyData: UpdatePartyDto,
  ): Promise<Party | null> {
    return this.partyModel
      .findOneAndUpdate({ _id: partyId, ownerId }, partyData, {
        new: true,
        runValidators: true,
      })
      .exec();
  }

  async delete(partyId: string, ownerId: string): Promise<Party | null> {
    return this.partyModel.findOneAndDelete({ _id: partyId, ownerId }).exec();
  }
}
