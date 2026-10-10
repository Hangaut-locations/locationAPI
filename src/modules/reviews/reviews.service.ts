import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { HydratedDocument, isValidObjectId, Model, Types } from 'mongoose';
import { canOpenListing } from '../listings/visibility';
import { Party } from '../parties/schemas/party.schema';
import { Property } from '../property/schemas/property.schema';
import {
  ListingComment,
  THREAD_MAX_REPLIES,
} from './schemas/listing-comment.schema';
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

interface ThreadEntry {
  _id: Types.ObjectId;
  userId: ReviewPerson | null;
  text: string;
  createdAt: Date;
  editedAt?: Date;
}

const toThread = (replies: ThreadEntry[], hostId: Id, userId: Id) =>
  replies
    // people who deleted their account come back as null
    .filter((entry) => !!entry.userId)
    .map((entry) => ({
      _id: entry._id,
      text: entry.text,
      createdAt: entry.createdAt,
      editedAt: entry.editedAt ?? null,
      user: entry.userId,
      fromHost: sameId(entry.userId?._id, hostId),
      mine: sameId(entry.userId?._id, userId),
    }));

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
      ownerId: listing.ownerId,
      filter: { listingType: type, listingId: new Types.ObjectId(listingId) },
    };
  }

  /** Reviews from before threads had a single `reply` field, move it in as the host's first message. */
  private moveOldReply(comment: HydratedDocument<ListingComment>, hostId: Id) {
    if (!comment.reply || !hostId) return;
    comment.replies.unshift({
      userId: new Types.ObjectId(hostId.toString()),
      text: comment.reply,
      createdAt: comment.repliedAt ?? comment.updatedAt,
    });
    comment.reply = undefined;
    comment.repliedAt = undefined;
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
    const { isOwner, ownerId, filter } = await this.openListing(
      type,
      listingId,
      userId,
      key,
    );

    const oldReplies = await this.commentModel
      .find({ ...filter, reply: { $exists: true } })
      .exec();
    await Promise.all(
      oldReplies.map((comment) => {
        this.moveOldReply(comment, ownerId);
        return comment.save();
      }),
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
        .populate<{ replies: ThreadEntry[] }>('replies.userId', PERSON_FIELDS)
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
          replies: toThread(comment.replies ?? [], ownerId, userId),
        })),
      canReview: !!userId && !isOwner,
      // anyone logged in can join the conversation under a review
      canReply: !!userId,
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
      replies: [],
    };
  }

  /** The review and its listing's host. Same rules as opening the listing (drafts, private key). */
  private async thread(commentId: string, userId: string, key?: string) {
    const notFound = new NotFoundException('Review not found');
    if (!isValidObjectId(commentId)) throw notFound;
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw notFound;

    const { ownerId } = await this.openListing(
      comment.listingType,
      comment.listingId.toString(),
      userId,
      key,
    );
    this.moveOldReply(comment, ownerId);
    return { comment, hostId: ownerId };
  }

  private async threadOf(commentId: Types.ObjectId, hostId: Id, userId: Id) {
    const fresh = await this.commentModel
      .findById(commentId)
      .select('replies')
      .populate<{ replies: ThreadEntry[] }>('replies.userId', PERSON_FIELDS)
      .lean()
      .exec();
    return { replies: toThread(fresh?.replies ?? [], hostId, userId) };
  }

  private threadEntry(
    comment: HydratedDocument<ListingComment>,
    replyId: string,
    userId: string,
  ) {
    const entry = isValidObjectId(replyId) ? comment.replies.id(replyId) : null;
    if (!entry) throw new NotFoundException('Reply not found');
    if (!sameId(entry.userId, userId)) {
      throw new ForbiddenException('You can only change your own replies');
    }
    return entry;
  }

  async addThreadReply(
    commentId: string,
    userId: string,
    text: string,
    key?: string,
  ) {
    const { comment, hostId } = await this.thread(commentId, userId, key);
    if (comment.replies.length >= THREAD_MAX_REPLIES) {
      throw new BadRequestException('This conversation is full');
    }
    comment.replies.push({ userId: new Types.ObjectId(userId), text });
    await comment.save();
    return this.threadOf(comment._id, hostId, userId);
  }

  async editThreadReply(
    commentId: string,
    replyId: string,
    userId: string,
    text: string,
    key?: string,
  ) {
    const { comment, hostId } = await this.thread(commentId, userId, key);
    const entry = this.threadEntry(comment, replyId, userId);
    entry.text = text;
    entry.editedAt = new Date();
    await comment.save();
    return this.threadOf(comment._id, hostId, userId);
  }

  async deleteThreadReply(
    commentId: string,
    replyId: string,
    userId: string,
    key?: string,
  ) {
    const { comment, hostId } = await this.thread(commentId, userId, key);
    this.threadEntry(comment, replyId, userId).deleteOne();
    await comment.save();
    return this.threadOf(comment._id, hostId, userId);
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
