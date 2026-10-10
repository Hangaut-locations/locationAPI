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
  userId: Types.ObjectId;
  text: string;
  createdAt: Date;
  editedAt?: Date;
}

const toThread = (replies: ThreadEntry[], hostId: Id, userId: Id) =>
  replies.map((entry) => ({
    _id: entry._id,
    text: entry.text,
    createdAt: entry.createdAt,
    editedAt: entry.editedAt ?? null,
    fromHost: sameId(entry.userId, hostId),
    mine: sameId(entry.userId, userId),
  }));

const firstHostReply = (replies: ThreadEntry[], hostId: Id) =>
  replies.find((entry) => sameId(entry.userId, hostId));

// what the older site reads: just the host's first answer
const toReply = (replies: ThreadEntry[], hostId: Id) => {
  const first = firstHostReply(replies, hostId);
  return first ? { text: first.text, createdAt: first.createdAt } : null;
};

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
        .map((comment) => {
          const replies = comment.replies ?? [];
          const mine = sameId(comment.userId?._id, userId);
          return {
            _id: comment._id,
            comment: comment.comment,
            createdAt: comment.createdAt,
            user: comment.userId,
            mine,
            replies: toThread(replies, ownerId, userId),
            // reviewer can answer once the host has said something
            canReply: isOwner || (mine && !!firstHostReply(replies, ownerId)),
            reply: toReply(replies, ownerId),
          };
        }),
      canReview: !!userId && !isOwner,
      canReply: isOwner,
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
      canReply: false,
      reply: null,
    };
  }

  /** The review plus who's who: only the listing's host and the reviewer get in. */
  private async thread(commentId: string, userId: string) {
    const notFound = new NotFoundException('Review not found');
    if (!isValidObjectId(commentId)) throw notFound;
    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) throw notFound;

    const listing =
      comment.listingType === ListingType.PARTY
        ? await this.partyModel
            .findById(comment.listingId)
            .select('ownerId')
            .lean<OpenListing>()
            .exec()
        : await this.propertyModel
            .findById(comment.listingId)
            .select('ownerId')
            .lean<OpenListing>()
            .exec();
    if (!listing) throw notFound;

    const hostId = listing.ownerId;
    this.moveOldReply(comment, hostId);
    const isHost = sameId(hostId, userId);
    if (!isHost && !sameId(comment.userId, userId)) {
      throw new ForbiddenException(
        'Only the host and whoever wrote the review can reply here',
      );
    }
    return { comment, hostId, isHost };
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

  async addThreadReply(commentId: string, userId: string, text: string) {
    const { comment, hostId, isHost } = await this.thread(commentId, userId);
    if (!isHost && !firstHostReply(comment.replies, hostId)) {
      throw new BadRequestException('The host has to reply first');
    }
    if (comment.replies.length >= THREAD_MAX_REPLIES) {
      throw new BadRequestException('This conversation is full');
    }
    comment.replies.push({ userId: new Types.ObjectId(userId), text });
    await comment.save();
    return { replies: toThread(comment.replies, hostId, userId) };
  }

  async editThreadReply(
    commentId: string,
    replyId: string,
    userId: string,
    text: string,
  ) {
    const { comment, hostId } = await this.thread(commentId, userId);
    const entry = this.threadEntry(comment, replyId, userId);
    entry.text = text;
    entry.editedAt = new Date();
    await comment.save();
    return { replies: toThread(comment.replies, hostId, userId) };
  }

  async deleteThreadReply(commentId: string, replyId: string, userId: string) {
    const { comment, hostId } = await this.thread(commentId, userId);
    this.threadEntry(comment, replyId, userId).deleteOne();
    await comment.save();
    return { replies: toThread(comment.replies, hostId, userId) };
  }

  /** Older site: one host reply, sending again edits it. */
  private async hostThread(commentId: string, userId: string) {
    const found = await this.thread(commentId, userId);
    if (!found.isHost) {
      throw new ForbiddenException(
        `Only the host can reply to reviews on this ${NAMES[found.comment.listingType]}`,
      );
    }
    return found;
  }

  async setReply(commentId: string, userId: string, reply: string) {
    const { comment, hostId } = await this.hostThread(commentId, userId);
    const first = firstHostReply(comment.replies, hostId);
    if (first) {
      first.text = reply;
      first.editedAt = new Date();
    } else {
      comment.replies.push({ userId: new Types.ObjectId(userId), text: reply });
    }
    await comment.save();
    return { reply: toReply(comment.replies, hostId) };
  }

  async deleteReply(commentId: string, userId: string) {
    const { comment, hostId } = await this.hostThread(commentId, userId);
    const first = firstHostReply(comment.replies, hostId);
    if (first) comment.replies.pull(first._id);
    await comment.save();
    return { reply: toReply(comment.replies, hostId) };
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
