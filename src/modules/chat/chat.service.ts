import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { canOpenListing } from '../listings/visibility';
import { MailService } from '../mail/mail.service';
import { MediaService } from '../media/media.service';
import { Party } from '../parties/schemas/party.schema';
import { Property } from '../property/schemas/property.schema';
import { ListingComment } from '../reviews/schemas/listing-comment.schema';
import { ListingLike } from '../reviews/schemas/listing-like.schema';
import { ListingType } from '../reviews/schemas/listing-type';
import { User } from '../users/schemas/user.schema';
import { newMessageMail, reportMail } from './chat-mails';
import {
  LocationDto,
  MessagesQuery,
  ReportDto,
  SendMessageDto,
  StartChatDto,
} from './dto/chat.dto';
import { ChatBlock } from './schemas/chat-block.schema';
import { ChatReport } from './schemas/chat-report.schema';
import {
  ChatListing,
  Conversation,
  LastMessage,
  pairOf,
} from './schemas/conversation.schema';
import { Message, MessageKind, SharedLocation } from './schemas/message.schema';

/** What the other person sees about you in chat. */
const PERSON_FIELDS = 'firstName lastName city state country';
const PAGE_SIZE = 40;
// opened the chat this recently = probably still in it, so no email
const ACTIVE_MS = 5 * 60_000;

export interface ChatPerson {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  city?: string;
  state?: string;
  country?: string;
}

interface StoredConversation {
  _id: Types.ObjectId;
  members: ChatPerson[];
  listing?: ChatListing;
  lastMessage?: LastMessage;
  unread?: Record<string, number>;
  readAt?: Record<string, Date>;
}

interface StoredMessage {
  _id: Types.ObjectId;
  senderId: Types.ObjectId;
  kind: MessageKind;
  text?: string;
  photo?: string;
  location?: SharedLocation;
  createdAt: Date;
  updatedAt: Date;
}

interface OpenListing {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title?: string;
  images?: string[];
  status?: string;
  visibility?: string;
  private_key?: string;
}

type Id = Types.ObjectId | string | undefined;

const sameId = (a: Id, b: Id) => !!a && !!b && a.toString() === b.toString();

// string ids don't match blockerId/senderId in filters, they need to be ObjectIds
const toId = (id: Id) => new Types.ObjectId(id?.toString());

const PREVIEWS: Record<MessageKind, string> = {
  [MessageKind.TEXT]: '',
  [MessageKind.PHOTO]: 'Sent a photo',
  [MessageKind.LOCATION]: 'Shared a location',
};

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name)
    private conversationModel: Model<Conversation>,
    @InjectModel(Message.name) private messageModel: Model<Message>,
    @InjectModel(ChatBlock.name) private blockModel: Model<ChatBlock>,
    @InjectModel(ChatReport.name) private reportModel: Model<ChatReport>,
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(ListingLike.name) private likeModel: Model<ListingLike>,
    @InjectModel(ListingComment.name)
    private commentModel: Model<ListingComment>,
    @InjectModel(User.name) private userModel: Model<User>,
    private mediaService: MediaService,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  /** Same rules as opening the listing page: drafts only for the owner, private ones need the key. */
  private async openListing(
    type: ListingType,
    listingId: string,
    userId: string,
    key?: string,
  ): Promise<OpenListing> {
    const notFound = new NotFoundException("That listing wasn't found");
    const fields = '+private_key ownerId title images status visibility';
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
        'This listing is private. Ask the host for the link.',
      );
    }
    return listing;
  }

  /** Liked, reviewed or replied under a review on the listing. */
  private async inReviews(
    type: ListingType,
    listingId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<boolean> {
    const filter = { listingType: type, listingId };
    const [liked, commented] = await Promise.all([
      this.likeModel.exists({ ...filter, userId }).exec(),
      this.commentModel
        .exists({
          ...filter,
          $or: [{ userId }, { 'replies.userId': userId }],
        })
        .exec(),
    ]);
    return !!liked || !!commented;
  }

  private async blocks(userId: Id, otherId: Id) {
    const me = toId(userId);
    const them = toId(otherId);
    const blocks = await this.blockModel
      .find({
        $or: [
          { blockerId: me, blockedId: them },
          { blockerId: them, blockedId: me },
        ],
      })
      .lean()
      .exec();
    return {
      byMe: blocks.some((block) => sameId(block.blockerId, userId)),
      byThem: blocks.some((block) => sameId(block.blockerId, otherId)),
    };
  }

  private async assertCanMessage(userId: Id, otherId: Id) {
    const { byMe, byThem } = await this.blocks(userId, otherId);
    if (byMe) throw new ForbiddenException('Unblock them to send a message');
    if (byThem) throw new ForbiddenException("You can't message this person");
  }

  /** Opens the chat with someone, from a listing: its host, or someone in its reviews. */
  async start(userId: string, dto: StartChatDto) {
    if (sameId(dto.userId, userId)) {
      throw new BadRequestException("You can't message yourself");
    }
    const listing = await this.openListing(
      dto.listingType,
      dto.listingId,
      userId,
      dto.key,
    );
    const otherId = new Types.ObjectId(dto.userId);
    if (
      !sameId(listing.ownerId, otherId) &&
      !(await this.inReviews(dto.listingType, listing._id, otherId))
    ) {
      throw new ForbiddenException(
        "You can only message the host or people in this listing's reviews",
      );
    }
    if (!(await this.userModel.exists({ _id: otherId }).exec())) {
      throw new NotFoundException("That person isn't on Hangaut anymore");
    }
    await this.assertCanMessage(userId, otherId);

    const pair = pairOf(userId, dto.userId);
    const update = {
      $setOnInsert: {
        pair,
        members: [new Types.ObjectId(userId), otherId],
      },
      $set: {
        listing: {
          type: dto.listingType,
          id: listing._id,
          title: listing.title ?? '',
          image: listing.images?.[0],
        },
      },
    };
    try {
      await this.conversationModel
        .updateOne({ pair }, update, { upsert: true })
        .exec();
    } catch (error) {
      // both tapped "Message" at the same time, the other request made it
      if ((error as { code?: number }).code !== 11000) throw error;
      await this.conversationModel.updateOne({ pair }, update).exec();
    }
    const conversation = await this.conversationModel
      .findOne({ pair })
      .select('_id')
      .lean()
      .exec();
    return this.details(conversation!._id.toString(), userId);
  }

  private toSummary(conversation: StoredConversation, userId: string) {
    const person =
      conversation.members.find(
        (member) => !!member && !sameId(member._id, userId),
      ) ?? null;
    const last = conversation.lastMessage;
    return {
      _id: conversation._id,
      // null when they deleted their account
      person,
      listing: conversation.listing ?? null,
      lastMessage: last
        ? {
            kind: last.kind,
            text: last.text,
            mine: sameId(last.senderId, userId),
            at: last.at,
          }
        : null,
      unread: conversation.unread?.[userId] ?? 0,
    };
  }

  private async memberOf(conversationId: string, userId: string) {
    const conversation = isValidObjectId(conversationId)
      ? await this.conversationModel
          .findOne({ _id: conversationId, members: userId })
          .populate<{ members: ChatPerson[] }>('members', PERSON_FIELDS)
          .lean<StoredConversation>()
          .exec()
      : null;
    if (!conversation) throw new NotFoundException('Chat not found');
    return conversation;
  }

  async list(userId: string) {
    const conversations = await this.conversationModel
      .find({ members: userId, lastMessageAt: { $ne: null } })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .populate<{ members: ChatPerson[] }>('members', PERSON_FIELDS)
      .lean<StoredConversation[]>()
      .exec();
    return conversations.map((conversation) =>
      this.toSummary(conversation, userId),
    );
  }

  /** For the badge on the messages icon. */
  async unreadCount(userId: string) {
    const conversations = await this.conversationModel
      .find({ members: userId, [`unread.${userId}`]: { $gt: 0 } })
      .select('unread')
      .lean<StoredConversation[]>()
      .exec();
    return {
      chats: conversations.length,
      messages: conversations.reduce(
        (total, conversation) => total + (conversation.unread?.[userId] ?? 0),
        0,
      ),
    };
  }

  async details(conversationId: string, userId: string) {
    return this.withDetails(
      await this.memberOf(conversationId, userId),
      userId,
    );
  }

  private async withDetails(conversation: StoredConversation, userId: string) {
    const summary = this.toSummary(conversation, userId);
    const otherId = summary.person?._id;
    const blocks = otherId
      ? await this.blocks(userId, otherId)
      : { byMe: false, byThem: false };
    return {
      ...summary,
      seenAt: (otherId && conversation.readAt?.[otherId.toString()]) || null,
      blockedByMe: blocks.byMe,
      canMessage: !!otherId && !blocks.byMe && !blocks.byThem,
    };
  }

  private toMessage(message: StoredMessage, userId: string) {
    const liveUntil = message.location?.live_until;
    return {
      _id: message._id,
      kind: message.kind,
      text: message.text ?? '',
      photo: message.photo ?? null,
      location: message.location
        ? {
            lat: message.location.lat,
            lng: message.location.lng,
            live_until: liveUntil ?? null,
            live: !!liveUntil && liveUntil > new Date(),
          }
        : null,
      mine: sameId(message.senderId, userId),
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  /**
   * Latest page, older pages with `before`, or polling with `since` (new messages and
   * live locations that moved). Send back `now` as the next `since`.
   */
  async messages(conversationId: string, userId: string, query: MessagesQuery) {
    const now = new Date();
    const conversation = await this.memberOf(conversationId, userId);
    const filter: Record<string, unknown> = {
      conversationId: conversation._id,
    };

    let messages: StoredMessage[];
    let hasMore = false;
    if (query.since) {
      const since = new Date(query.since);
      if (Number.isNaN(since.getTime())) {
        throw new BadRequestException('since should be a date');
      }
      // a little overlap so nothing saved at the same moment gets missed, the site skips repeats
      filter.updatedAt = { $gt: new Date(since.getTime() - 2000) };
      messages = await this.messageModel
        .find(filter)
        .sort({ createdAt: 1 })
        .limit(200)
        .lean<StoredMessage[]>()
        .exec();
    } else {
      if (query.before) {
        const before = await this.messageModel
          .findOne({ _id: query.before, conversationId: conversation._id })
          .select('createdAt')
          .lean()
          .exec();
        if (before) filter.createdAt = { $lt: before.createdAt };
      }
      const page = await this.messageModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(PAGE_SIZE + 1)
        .lean<StoredMessage[]>()
        .exec();
      hasMore = page.length > PAGE_SIZE;
      messages = page.slice(0, PAGE_SIZE).reverse();
    }

    return {
      conversation: await this.withDetails(conversation, userId),
      messages: messages.map((message) => this.toMessage(message, userId)),
      hasMore,
      now,
    };
  }

  async send(conversationId: string, userId: string, dto: SendMessageDto) {
    const parts = [dto.text, dto.photo, dto.location].filter(
      (part) => part !== undefined && part !== '',
    );
    if (!parts.length) throw new BadRequestException('Write something first');
    if (parts.length > 1) {
      throw new BadRequestException('Send one thing at a time');
    }

    const conversation = await this.memberOf(conversationId, userId);
    const recipient = conversation.members.find(
      (member) => !!member && !sameId(member._id, userId),
    );
    if (!recipient) {
      throw new BadRequestException("This person isn't on Hangaut anymore");
    }
    await this.assertCanMessage(userId, recipient._id);

    const now = new Date();
    const kind = dto.photo
      ? MessageKind.PHOTO
      : dto.location
        ? MessageKind.LOCATION
        : MessageKind.TEXT;
    const message = await this.messageModel.create({
      conversationId: conversation._id,
      senderId: new Types.ObjectId(userId),
      kind,
      ...(kind === MessageKind.TEXT && { text: dto.text }),
      ...(dto.photo && { photo: this.mediaService.chatPhotoUrl(dto.photo) }),
      ...(dto.location && {
        location: {
          lat: dto.location.lat,
          lng: dto.location.lng,
          ...(dto.location.live_minutes && {
            live_until: new Date(
              now.getTime() + dto.location.live_minutes * 60_000,
            ),
          }),
        },
      }),
    });

    const recipientId = recipient._id.toString();
    const before = await this.conversationModel
      .findByIdAndUpdate(conversation._id, {
        $set: {
          lastMessage: {
            senderId: message.senderId,
            kind,
            text: dto.text ?? '',
            at: message.createdAt,
          },
          lastMessageAt: message.createdAt,
          [`unread.${userId}`]: 0,
          [`readAt.${userId}`]: now,
        },
        $inc: { [`unread.${recipientId}`]: 1 },
      })
      .lean<StoredConversation>()
      .exec();

    // one email per batch of unread messages, and none while they're in the chat
    const readAt = before?.readAt?.[recipientId];
    const active =
      !!readAt && now.getTime() - new Date(readAt).getTime() < ACTIVE_MS;
    if (!(before?.unread?.[recipientId] ?? 0) && !active) {
      void this.emailRecipient(
        recipientId,
        userId,
        conversation._id.toString(),
        dto.text || PREVIEWS[kind],
      );
    }

    return this.toMessage(message.toObject<StoredMessage>(), userId);
  }

  private async emailRecipient(
    recipientId: string,
    senderId: string,
    conversationId: string,
    preview: string,
  ) {
    const [recipient, sender] = await Promise.all([
      this.userModel
        .findById(recipientId)
        .select('email firstName')
        .lean()
        .exec(),
      this.userModel.findById(senderId).select('firstName').lean().exec(),
    ]);
    if (!recipient || !sender) return;
    const site = this.configService.get<string>('SITE_URL');
    await this.mailService.send(
      newMessageMail(
        recipient.email,
        recipient.firstName,
        sender.firstName,
        preview.length > 160 ? `${preview.slice(0, 157)}...` : preview,
        `${site}/messages/${conversationId}`,
      ),
    );
  }

  private async liveLocation(
    messageId: string,
    userId: string,
    update: Record<string, unknown>,
  ) {
    const message = isValidObjectId(messageId)
      ? await this.messageModel
          .findOneAndUpdate(
            {
              _id: messageId,
              senderId: toId(userId),
              kind: MessageKind.LOCATION,
              'location.live_until': { $gt: new Date() },
            },
            { $set: update },
            { new: true },
          )
          .lean<StoredMessage>()
          .exec()
      : null;
    if (!message) {
      throw new BadRequestException('This live location has already ended');
    }
    return this.toMessage(message, userId);
  }

  /** The sender's phone moves the pin while sharing live. */
  moveLocation(messageId: string, userId: string, dto: LocationDto) {
    return this.liveLocation(messageId, userId, {
      'location.lat': dto.lat,
      'location.lng': dto.lng,
    });
  }

  stopLocation(messageId: string, userId: string) {
    return this.liveLocation(messageId, userId, {
      'location.live_until': new Date(),
    });
  }

  async markRead(conversationId: string, userId: string) {
    const result = isValidObjectId(conversationId)
      ? await this.conversationModel
          .updateOne(
            { _id: conversationId, members: userId },
            {
              $set: {
                [`unread.${userId}`]: 0,
                [`readAt.${userId}`]: new Date(),
              },
            },
          )
          .exec()
      : null;
    if (!result?.matchedCount) throw new NotFoundException('Chat not found');
    return { read: true };
  }

  private otherUser(userId: string, otherId: string) {
    if (!isValidObjectId(otherId)) {
      throw new NotFoundException("That person wasn't found");
    }
    if (sameId(otherId, userId)) {
      throw new BadRequestException("You can't do that to yourself");
    }
    return new Types.ObjectId(otherId);
  }

  async block(userId: string, otherId: string) {
    const blockedId = this.otherUser(userId, otherId);
    const mine = { blockerId: new Types.ObjectId(userId), blockedId };
    await this.blockModel.updateOne(mine, mine, { upsert: true }).exec();
    return { blocked: true };
  }

  async unblock(userId: string, otherId: string) {
    await this.blockModel
      .deleteOne({
        blockerId: new Types.ObjectId(userId),
        blockedId: this.otherUser(userId, otherId),
      })
      .exec();
    return { blocked: false };
  }

  async blocked(userId: string) {
    const blocks = await this.blockModel
      .find({ blockerId: toId(userId) })
      .sort({ createdAt: -1 })
      .populate<{ blockedId: ChatPerson | null }>('blockedId', PERSON_FIELDS)
      .lean()
      .exec();
    return blocks
      .map((block) => block.blockedId)
      .filter((person): person is ChatPerson => !!person);
  }

  async report(userId: string, dto: ReportDto) {
    const reportedId = this.otherUser(userId, dto.userId);
    if (dto.conversationId) await this.memberOf(dto.conversationId, userId);
    const [reporter, reported] = await Promise.all([
      this.userModel.findById(userId).select('firstName lastName').lean(),
      this.userModel
        .findById(reportedId)
        .select('firstName lastName')
        .lean()
        .exec(),
    ]);
    if (!reported) throw new NotFoundException("That person wasn't found");

    await this.reportModel.create({
      reporterId: new Types.ObjectId(userId),
      reportedId,
      conversationId: dto.conversationId
        ? new Types.ObjectId(dto.conversationId)
        : undefined,
      reason: dto.reason,
      details: dto.details ?? '',
    });

    const to = this.configService.get<string>('REPORTS_EMAIL');
    if (to) {
      void this.mailService.send(
        reportMail(to, {
          reporter: `${reporter?.firstName} ${reporter?.lastName}`,
          reported: `${reported.firstName} ${reported.lastName}`,
          reportedId: reportedId.toString(),
          reason: dto.reason,
          details: dto.details ?? '',
          conversationId: dto.conversationId,
        }),
      );
    }
    return { reported: true };
  }

  /** Signed upload for a chat photo, then send its public_id as `photo`. */
  photoSignature(userId: string) {
    return this.mediaService.signChatPhoto(userId);
  }
}
