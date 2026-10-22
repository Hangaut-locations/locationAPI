import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MediaService } from '../media/media.service';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private media: MediaService,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().exec();
  }

  async update(id: string, userData: Partial<User>): Promise<User | null> {
    try {
      return await this.userModel
        .findByIdAndUpdate(id, userData, { new: true, runValidators: true })
        .exec();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException({
          message: 'User with this email already exists',
          data: { field: 'email' },
        });
      }
      throw error;
    }
  }

  signPhoto(userId: string) {
    return this.media.signProfilePhoto(userId);
  }

  /** Saves a photo this person uploaded, and drops the previous one from Cloudinary. */
  async setPhoto(id: string, publicId: string): Promise<User | null> {
    const found = await this.media.findProfilePhoto(publicId, id);
    const current = await this.findById(id);
    const saved = await this.update(id, {
      photo: found.url,
      photoId: found.publicId,
    });
    if (current?.photoId && current.photoId !== found.publicId) {
      await this.media.removeProfilePhoto(current.photoId);
    }
    return saved;
  }

  async delete(id: string): Promise<User | null> {
    return this.userModel.findByIdAndDelete(id).exec();
  }

  toPublicUser(user: User): Partial<User> {
    const publicUser = user.toObject() as Partial<User> & {
      password?: string;
    };
    delete publicUser.password;
    return publicUser;
  }
}
