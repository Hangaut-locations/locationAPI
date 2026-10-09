import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { canOpenListing } from '../listings/visibility';
import { Party } from '../parties/schemas/party.schema';
import { Property } from '../property/schemas/property.schema';
import { ListingComment } from './schemas/listing-comment.schema';
import { ListingLike } from './schemas/listing-like.schema';
import { ListingType } from './schemas/listing-type';

/** What other people see about whoever liked or commented. */
const PERSON_FIELDS = 'firstName lastName city state country';

export interface ReviewPerson {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
  country?: string;
}

interface OpenListing {
  ownerId: Types.ObjectId;
  status?: string;
  visibility?: string;
  private_key?: string;
}

const NAMES: Record<ListingType, string> = {
  [ListingType.PARTY]: 'party',
  [ListingType.PROPERTY]: 'place',
};

type Id = Types.ObjectId | string | undefined;

const sameId = (a: Id, b: Id) => !!a && !!b && a.toString() === b.toString();

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(ListingLike.name) private likeModel: Model<ListingLike>,
    @InjectModel(ListingComment.name)
    private commentModel: Model<ListingComment>,
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
  ) {}

  /** Same rules as opening the listing page: drafts only for the owner, private ones need the key. */
  private async openListing(
    type: ListingType,
    listingId: string,
    userId?: string,
    key?: string,
  ) {
    const notFound = new NotFoundException(`This ${NAMES[type]} wasn't found`);
    if (!isValidObjectId(listingId)) throw notFound;

    const fields = '+private_key ownerId status visibility';
    const listing =
      type === ListingType.PARTY
        ? await this.partyModel
            .findById(listingId)
            .select(fields)
            .lean<OpenListing>()
            .exec()
        : await this.propertyModel
            .findById(listingId)
            .select(fields)
            .lean<OpenListing>()
            .exec();
    if (!listing) throw notFound;

    const isOwner = sameId(listing.ownerId, userId);
    if (listing.status === 'draft' && !isOwner) throw notFound;
    if (!canOpenListing(listing, isOwner, key)) {
      throw new ForbiddenException(
        `This ${NAMES[type]} is private. Ask the host for the link.`,
      );
    }
    return {
      isOwner,
      filter: { listingType: type, listingId: new Types.ObjectId(listingId) },
    };
  }

  private assertNotOwner(type: ListingType, isOwner: boolean, action: string) {
    if (isOwner) {
      throw new BadRequestException(
        `You can't ${action} your own ${NAMES[type]}`,
      );
    }
  }

  async getReviews(
    type: ListingType,
    listingId: string,
    userId?: string,
    key?: string,
  ) {
    const { isOwner, filter } = await this.openListing(
      type,
      listingId,
      userId,
      key,
    );

    const [likes, comments] = await Promise.all([
      this.likeModel
        .find(filter)
        .sort({ createdAt: -1 })
        .populate<{ userId: ReviewPerson | null }>('userId', PERSON_FIELDS)
        .lean()
        .exec(),
      this.commentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .populate<{ userId: ReviewPerson | null }>('userId', PERSON_FIELDS)
        .lean()
        .exec(),
    ]);

    // people who deleted their account come back as null
    const likedBy = likes
      .map((like) => like.userId)
      .filter((person): person is ReviewPerson => !!person);

    return {
      likes: likedBy.length,
      liked: likedBy.some((person) => sameId(person._id, userId)),
      likedBy,
      comments: comments
        .filter((comment) => !!comment.userId)
        .map((comment) => ({
          _id: comment._id,
          comment: comment.comment,
          createdAt: comment.createdAt,
          user: comment.userId,
          mine: sameId(comment.userId?._id, userId),
        })),
      canReview: !!userId && !isOwner,
    };
  }

  async toggleLike(
    type: ListingType,
    listingId: string,
    userId: string,
    key?: string,
  ) {
    const { isOwner, filter } = await this.openListing(
      type,
      listingId,
      userId,
      key,
    );
    this.assertNotOwner(type, isOwner, 'like');

    const mine = { ...filter, userId: new Types.ObjectId(userId) };
    const removed = await this.likeModel.findOneAndDelete(mine).exec();
    if (!removed) {
      // double taps race each other, the unique index keeps it to one like
      await this.likeModel.updateOne(mine, mine, { upsert: true }).exec();
    }
    const likes = await this.likeModel.countDocuments(filter).exec();
    return { liked: !removed, likes };
  }

  async addComment(
    type: ListingType,
    listingId: string,
    userId: string,
    comment: string,
    key?: string,
  ) {
    const { isOwner, filter } = await this.openListing(
      type,
      listingId,
      userId,
      key,
    );
    this.assertNotOwner(type, isOwner, 'review');

    const created = await this.commentModel.create({
      ...filter,
      userId: new Types.ObjectId(userId),
      comment,
    });
    const saved = await created.populate<{ userId: ReviewPerson }>(
      'userId',
      PERSON_FIELDS,
    );
    return {
      _id: saved._id,
      comment: saved.comment,
      createdAt: saved.createdAt,
      user: saved.userId,
      mine: true,
    };
  }

  async deleteComment(commentId: string, userId: string) {
    const removed = isValidObjectId(commentId)
      ? await this.commentModel
          .findOneAndDelete({
            _id: commentId,
            userId: new Types.ObjectId(userId),
          })
          .exec()
      : null;
    if (!removed) throw new NotFoundException('Comment not found');
    return { deleted: true };
  }
}
