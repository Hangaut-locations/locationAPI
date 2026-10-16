import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { canOpenListing, Visibility } from '../listings/visibility';
import { Mail, MailService } from '../mail/mail.service';
import { User } from '../users/schemas/user.schema';
import {
  AnyBooking,
  cancelledMails,
  confirmedMails,
  DeclineReason,
  declinedMails,
  fullName,
  Kind,
  Person,
  requestMails,
} from './booking-mails';
import { partyExpiry } from '../parties/parties.service';
import {
  ChargeType,
  Party,
  StatusType as PartyStatus,
} from '../parties/schemas/party.schema';
import {
  ChargeType as PropertyChargeType,
  Property,
  StatusType as PropertyStatus,
} from '../property/schemas/property.schema';
import { CreatePartyBookingDto } from './dto/create-party-booking.dto';
import { CreatePropertyBookingDto } from './dto/create-property-booking.dto';
import { FriendDto } from './dto/friend.dto';
import { ACTIVE_STATUSES, BookingStatus } from './schemas/booking-status';
import { PartyBooking } from './schemas/party-booking.schema';
import { PropertyBooking } from './schemas/property-booking.schema';
import { Ticket } from './schemas/ticket.schema';

/** Nigeria (WAT) is UTC+1 all year. */
const NIGERIA_UTC_OFFSET_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const EXPIRE_EVERY_MS = 5 * 60 * 1000;
const GUEST_FIELDS = 'firstName lastName email phone';

// No 0/O or 1/I/L, so codes read out at the door don't get mixed up.
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Like "K7M2-QX9P". */
const newCode = () => {
  const chars = Array.from(
    { length: 8 },
    () => CODE_LETTERS[randomInt(CODE_LETTERS.length)],
  ).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
};

/** Hosts can type "k7m2 qx9p" or "K7M2QX9P". */
const cleanCode = (code: string) => {
  const chars = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return chars.length === 8 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
};

const bookerName = (guest: Person | null) =>
  guest ? fullName(guest) : 'Deleted account';

const clockAt = (date: Date) =>
  date.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  });

/** "2026-10-20" + "14:00" in Nigeria time. */
export const nigeriaDateTime = (date: string, time: string): Date => {
  const day = new Date(date);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      hours,
      minutes,
    ) - NIGERIA_UTC_OFFSET_MS,
  );
};

/** Nigeria calendar day of a moment, like "2026-10-20". */
const nigeriaDate = (moment: Date) =>
  new Date(moment.getTime() + NIGERIA_UTC_OFFSET_MS).toISOString().slice(0, 10);

/** First blocked day a booking touches, a late booking can run past midnight. */
const blockedDayIn = (blocked: string[], startAt: Date, endAt: Date) => {
  if (!blocked.length) return undefined;
  const lastDay = nigeriaDate(new Date(endAt.getTime() - 1));
  for (let day = startAt; ; day = new Date(day.getTime() + DAY_MS)) {
    const date = nigeriaDate(day);
    if (blocked.includes(date)) return date;
    if (date >= lastDay) return undefined;
  }
};

/** Homes take one booking a day, so a booking holds every Nigeria day it touches. */
const wholeDays = (startAt: Date, endAt: Date) => {
  const lastDay = nigeriaDate(new Date(endAt.getTime() - 1));
  return {
    from: nigeriaDateTime(nigeriaDate(startAt), '00:00'),
    to: new Date(nigeriaDateTime(lastDay, '00:00').getTime() + DAY_MS),
  };
};

const readableDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/** Start and end date both count, so a one-day party is 1. */
export const partyLengthInDays = (
  startDate?: Date | string,
  endDate?: Date | string,
): number => {
  if (!startDate || !endDate) return 1;
  const days =
    Math.round(
      (new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY_MS,
    ) + 1;
  return Math.max(days, 1);
};

/** The host answers before the party starts, or before it ends if it already started. */
const partyRespondBy = (party: Party) => {
  if (!party.start_date) return undefined;
  const startsAt = nigeriaDateTime(
    new Date(party.start_date).toISOString(),
    party.start_time ?? '00:00',
  );
  if (startsAt > new Date() || !party.end_date) return startsAt;
  return partyExpiry(party.end_date);
};

const fieldError = (field: string, message: string) =>
  new BadRequestException({
    message: 'Validation failed',
    data: [{ field, messages: [message] }],
  });

const spotsText = (count: number) => `${count} spot${count === 1 ? '' : 's'}`;

const assertFriends = (guests: number, friends: FriendDto[]) => {
  if (friends.length > guests - 1) {
    throw fieldError(
      'friends',
      guests === 1
        ? "You're only booking for yourself, so there's no friend to add"
        : `You're booking for ${guests}, so add up to ${guests - 1} friends`,
    );
  }
};

/** Booker first, then friends. Spots without a friend send the code to the booker. */
const makeTickets = (
  guest: Person,
  guests: number,
  friends: FriendDto[],
): Ticket[] => {
  const booker = fullName(guest);
  return [
    { name: booker, email: guest.email, code: newCode() },
    ...Array.from({ length: guests - 1 }, (_, index) => ({
      name: friends[index]?.name ?? `${booker} +${index + 1}`,
      email: friends[index]?.email ?? guest.email,
      code: newCode(),
    })),
  ];
};

/** Codes only show once the host accepts. */
const withCodesIfConfirmed = <
  T extends { status: BookingStatus; tickets?: Ticket[] },
>(
  booking: T,
) =>
  booking.status === BookingStatus.CONFIRMED
    ? booking
    : {
        ...booking,
        tickets: (booking.tickets ?? []).map((ticket) => ({
          name: ticket.name,
          email: ticket.email,
          checked_in_at: ticket.checked_in_at,
        })),
      };

type Booking = PartyBooking | PropertyBooking;

@Injectable()
export class BookingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingsService.name);
  private expireTimer?: NodeJS.Timeout;
  private expiring?: Promise<void>;

  constructor(
    @InjectModel(PartyBooking.name)
    private partyBookingModel: Model<PartyBooking>,
    @InjectModel(PropertyBooking.name)
    private propertyBookingModel: Model<PropertyBooking>,
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
    @InjectModel(User.name) private userModel: Model<User>,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    this.expireTimer = setInterval(() => {
      this.expireRequests().catch((error) =>
        this.logger.error('Closing old requests failed', error),
      );
    }, EXPIRE_EVERY_MS);
    this.expireTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.expireTimer);
  }

  private get siteUrl() {
    return this.configService.get<string>('SITE_URL') ?? '';
  }

  private findPerson(id: Types.ObjectId | string) {
    return this.userModel
      .findById(id)
      .select('firstName lastName email phone')
      .lean<Person>()
      .exec();
  }

  /** Sends in the background, the booking already went through. */
  private notify(
    item: AnyBooking,
    build: (guest: Person, host: Person) => Mail[],
  ) {
    void Promise.all([
      this.findPerson(item.booking.guestId),
      this.findPerson(item.booking.hostId),
    ])
      .then(([guest, host]) =>
        guest && host
          ? this.mailService.sendAll(build(guest, host))
          : undefined,
      )
      .catch((error) => this.logger.error('Booking emails failed', error));
  }

  /** Instant bookings send codes now, requests wait for the host. */
  private notifyBooked(item: AnyBooking, privateParty = false) {
    this.notify(item, (guest, host) =>
      item.booking.status === BookingStatus.CONFIRMED
        ? confirmedMails(item, guest, host, this.siteUrl, false)
        : requestMails(item, guest, host, this.siteUrl, privateParty),
    );
  }

  private notifyStatus(
    item: AnyBooking,
    userId: string,
    wasConfirmed: boolean,
  ) {
    const byHost = item.booking.hostId.toString() === userId.toString();
    this.notify(item, (guest, host) => {
      switch (item.booking.status) {
        case BookingStatus.CONFIRMED:
          return confirmedMails(item, guest, host, this.siteUrl, true);
        case BookingStatus.DECLINED:
          return declinedMails(item, guest, host, this.siteUrl, 'host');
        case BookingStatus.CANCELLED:
          return cancelledMails(
            item,
            guest,
            host,
            this.siteUrl,
            byHost,
            wasConfirmed,
          );
        default:
          return [];
      }
    });
  }

  async bookParty(guestId: string, bookingData: CreatePartyBookingDto) {
    const party = await this.partyModel
      .findById(bookingData.partyId)
      .select('+private_key')
      .exec();
    const hasEnded = !!party?.expires_at && party.expires_at <= new Date();
    if (!party || party.status === PartyStatus.DRAFT || hasEnded) {
      throw new NotFoundException('Party not found');
    }
    if (!canOpenListing(party, false, bookingData.key)) {
      throw new ForbiddenException(
        'This party is private. Ask the host for the link.',
      );
    }
    if (party.ownerId.toString() === guestId.toString()) {
      throw new BadRequestException("You can't book your own party");
    }

    const perHour = party.charge_type === ChargeType.HOUR;
    if (perHour && !bookingData.hours) {
      throw fieldError('hours', 'Pick how many hours you are booking');
    }
    const perDay = party.charge_type === ChargeType.DAY;
    if (perDay) {
      if (!bookingData.days) {
        throw fieldError('days', 'Pick how many days you are booking');
      }
      const partyDays = partyLengthInDays(party.start_date, party.end_date);
      if (bookingData.days > partyDays) {
        throw fieldError(
          'days',
          `This party only runs for ${partyDays} day${partyDays === 1 ? '' : 's'}`,
        );
      }
    }

    const existing = await this.partyBookingModel
      .findOne({
        partyId: party._id,
        guestId: new Types.ObjectId(guestId),
        status: { $in: ACTIVE_STATUSES },
      })
      .select('status')
      .lean()
      .exec();
    if (existing) {
      throw new ConflictException(
        existing.status === BookingStatus.PENDING
          ? 'You already asked to book this party. Wait for the host to reply.'
          : 'You already booked this party',
      );
    }

    const spotsLeft =
      (party.guest_capacity ?? 0) - (await this.confirmedSpots(party._id));
    if (bookingData.guests > spotsLeft) {
      throw new ConflictException(
        spotsLeft > 0
          ? `Only ${spotsText(spotsLeft)} left for this party`
          : 'This party is fully booked',
      );
    }

    const friends = bookingData.friends ?? [];
    assertFriends(bookingData.guests, friends);
    const guest = await this.findPerson(guestId);
    if (!guest) throw new NotFoundException('User not found');

    // A private link is not enough. The host has to accept before anyone gets a code.
    const isPrivate = party.visibility === Visibility.PRIVATE;
    const isRequest = party.booking_setting === 'approve-first' || isPrivate;
    const price = party.price ?? 0;
    const booking = await new this.partyBookingModel({
      partyId: party._id,
      guestId: new Types.ObjectId(guestId),
      hostId: party.ownerId,
      guests: bookingData.guests,
      hours: perHour ? bookingData.hours : undefined,
      days: perDay ? bookingData.days : undefined,
      total: perHour
        ? price * (bookingData.hours ?? 1)
        : perDay
          ? price * (bookingData.days ?? 1)
          : price * bookingData.guests,
      status: isRequest ? BookingStatus.PENDING : BookingStatus.CONFIRMED,
      respond_by: isRequest ? partyRespondBy(party) : undefined,
      note: bookingData.note,
      tickets: makeTickets(guest, bookingData.guests, friends),
      title: party.title,
      image: party.images?.[0],
      location: party.location,
      rules: party.party_rules,
      start_date: party.start_date,
      end_date: party.end_date,
      start_time: party.start_time,
      charge_type: party.charge_type,
      price,
    }).save();

    this.notifyBooked({ kind: 'party', booking }, isPrivate);
    return withCodesIfConfirmed(booking.toObject());
  }

  async bookProperty(guestId: string, bookingData: CreatePropertyBookingDto) {
    const property = await this.propertyModel
      .findById(bookingData.propertyId)
      .select('+private_key')
      .exec();
    if (!property || property.status !== PropertyStatus.PUBLISHED) {
      throw new NotFoundException('Property not found');
    }
    if (!canOpenListing(property, false, bookingData.key)) {
      throw new ForbiddenException(
        'This place is private. Ask the host for the link.',
      );
    }
    if (property.ownerId.toString() === guestId.toString()) {
      throw new BadRequestException("You can't book your own place");
    }
    if (
      property.guest_capacity &&
      bookingData.guests > property.guest_capacity
    ) {
      throw fieldError(
        'guests',
        `This place fits up to ${property.guest_capacity} guests`,
      );
    }
    const friends = bookingData.friends ?? [];
    assertFriends(bookingData.guests, friends);

    const { startAt, endAt, hours, dayCount } = this.bookingTimes(
      property.charge_type,
      bookingData,
    );

    const blockedDay = blockedDayIn(
      property.blocked_dates ?? [],
      startAt,
      endAt,
    );
    if (blockedDay) {
      throw fieldError(
        'date',
        `The host isn't taking bookings on ${readableDate(blockedDay)}. Pick another day.`,
      );
    }

    await this.assertPropertyFree(property._id, startAt, endAt);

    const days = wholeDays(startAt, endAt);
    const alreadyAsked = await this.propertyBookingModel.exists({
      propertyId: property._id,
      guestId: new Types.ObjectId(guestId),
      status: BookingStatus.PENDING,
      start_at: { $lt: days.to },
      end_at: { $gt: days.from },
    });
    if (alreadyAsked) {
      throw new ConflictException(
        'You already sent a request for this day. Wait for the host to reply.',
      );
    }

    const guest = await this.findPerson(guestId);
    if (!guest) throw new NotFoundException('User not found');

    const isRequest = property.booking_setting !== 'instant';
    const price = property.price ?? 0;
    const booking = await new this.propertyBookingModel({
      propertyId: property._id,
      guestId: new Types.ObjectId(guestId),
      hostId: property.ownerId,
      guests: bookingData.guests,
      start_at: startAt,
      end_at: endAt,
      hours,
      days: dayCount,
      total:
        property.charge_type === PropertyChargeType.HOUR
          ? price * hours
          : property.charge_type === PropertyChargeType.DAY
            ? price * (dayCount ?? 1)
            : price * bookingData.guests,
      status: isRequest ? BookingStatus.PENDING : BookingStatus.CONFIRMED,
      // A day booking for today has already started, the host gets until the end of it.
      respond_by: isRequest
        ? startAt > new Date()
          ? startAt
          : endAt
        : undefined,
      note: bookingData.note,
      tickets: makeTickets(guest, bookingData.guests, friends),
      title: property.title,
      image: property.images?.[0],
      location: property.location,
      rules: property.property_rules,
      charge_type: property.charge_type,
      price,
    }).save();

    this.notifyBooked({ kind: 'home', booking });
    return withCodesIfConfirmed(booking.toObject());
  }

  /** Places charged per day take whole days, the rest take a start time and hours. */
  private bookingTimes(
    chargeType: PropertyChargeType,
    bookingData: CreatePropertyBookingDto,
  ) {
    if (chargeType === PropertyChargeType.DAY) {
      if (!bookingData.days) {
        throw fieldError('days', 'Pick how many days you are booking');
      }
      const startAt = nigeriaDateTime(bookingData.date, '00:00');
      if (nigeriaDate(new Date(startAt)) < nigeriaDate(new Date())) {
        throw fieldError('date', 'Pick today or a day after');
      }
      return {
        startAt,
        endAt: new Date(startAt.getTime() + bookingData.days * DAY_MS),
        hours: bookingData.days * 24,
        dayCount: bookingData.days,
      };
    }

    if (!bookingData.start_time) {
      throw fieldError('start_time', 'Pick a start time');
    }
    if (!bookingData.hours) {
      throw fieldError('hours', 'Pick how many hours you are booking');
    }
    const startAt = nigeriaDateTime(bookingData.date, bookingData.start_time);
    if (startAt <= new Date()) {
      throw fieldError('date', 'Pick a time in the future');
    }
    return {
      startAt,
      endAt: new Date(startAt.getTime() + bookingData.hours * HOUR_MS),
      hours: bookingData.hours,
      dayCount: undefined,
    };
  }

  /** Upcoming confirmed times for a property, without any guest details. */
  takenTimes(propertyId: string) {
    if (!isValidObjectId(propertyId)) return [];
    return this.propertyBookingModel
      .find({
        propertyId: new Types.ObjectId(propertyId),
        status: BookingStatus.CONFIRMED,
        end_at: { $gt: new Date() },
      })
      .select('start_at end_at -_id')
      .sort({ start_at: 1 })
      .lean()
      .exec();
  }

  /** What the user booked as a guest. */
  async trips(guestId: string) {
    await this.expireRequests();
    const filter = { guestId: new Types.ObjectId(guestId) };
    const [parties, properties] = await Promise.all([
      this.partyBookingModel.find(filter).sort({ createdAt: -1 }).lean().exec(),
      this.propertyBookingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);
    return {
      parties: parties.map(withCodesIfConfirmed),
      properties: properties.map(withCodesIfConfirmed),
    };
  }

  /** Bookings guests made on the user's listings. */
  async reservations(hostId: string) {
    await this.expireRequests();
    const filter = { hostId: new Types.ObjectId(hostId) };
    // Codes stay with the guests, the host checks them in by typing them.
    const [parties, properties] = await Promise.all([
      this.partyBookingModel
        .find(filter)
        .select('-tickets.code')
        .populate('guestId', GUEST_FIELDS)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.propertyBookingModel
        .find(filter)
        .select('-tickets.code')
        .populate('guestId', GUEST_FIELDS)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);
    return { parties, properties };
  }

  async updatePartyBookingStatus(
    userId: string,
    bookingId: string,
    status: BookingStatus,
  ) {
    await this.expireRequests();
    const booking = isValidObjectId(bookingId)
      ? await this.partyBookingModel.findById(bookingId).exec()
      : null;
    const hasEnded =
      !!booking?.end_date && partyExpiry(booking.end_date) <= new Date();
    const wasConfirmed = booking?.status === BookingStatus.CONFIRMED;
    this.assertStatusChange(booking, userId, status, hasEnded);

    if (status === BookingStatus.CONFIRMED) {
      await this.assertPartyRoom(booking);
    }

    booking.status = status;
    await booking.save();
    this.notifyStatus({ kind: 'party', booking }, userId, wasConfirmed);

    if (status === BookingStatus.CONFIRMED) {
      await this.declineWhatNoLongerFits(booking.partyId);
    }
    return withCodesIfConfirmed(booking.toObject());
  }

  async updatePropertyBookingStatus(
    userId: string,
    bookingId: string,
    status: BookingStatus,
  ) {
    await this.expireRequests();
    const booking = isValidObjectId(bookingId)
      ? await this.propertyBookingModel.findById(bookingId).exec()
      : null;
    const wasConfirmed = booking?.status === BookingStatus.CONFIRMED;
    this.assertStatusChange(
      booking,
      userId,
      status,
      !!booking && booking.start_at <= new Date(),
    );

    if (status === BookingStatus.CONFIRMED) {
      await this.assertPropertyFree(
        booking.propertyId,
        booking.start_at,
        booking.end_at,
      );
    }

    booking.status = status;
    await booking.save();
    this.notifyStatus({ kind: 'home', booking }, userId, wasConfirmed);

    if (status === BookingStatus.CONFIRMED) {
      // Other requests for the same day can't happen anymore.
      const days = wholeDays(booking.start_at, booking.end_at);
      const clashing = await this.propertyBookingModel
        .find({
          _id: { $ne: booking._id },
          propertyId: booking.propertyId,
          status: BookingStatus.PENDING,
          start_at: { $lt: days.to },
          end_at: { $gt: days.from },
        })
        .select('_id')
        .lean()
        .exec();
      for (const request of clashing) {
        await this.declineRequest('home', request._id, 'day-taken');
      }
    }
    return withCodesIfConfirmed(booking.toObject());
  }

  /** Closes requests the host didn't answer in time. Runs every few minutes and before bookings are read. */
  expireRequests() {
    this.expiring ??= this.closeUnanswered().finally(() => {
      this.expiring = undefined;
    });
    return this.expiring;
  }

  private async closeUnanswered() {
    const now = new Date();
    const [parties, homes] = await Promise.all([
      this.partyBookingModel
        .find({ status: BookingStatus.PENDING, respond_by: { $lte: now } })
        .select('_id')
        .lean()
        .exec(),
      // Older requests have no respond_by, they go when the booking starts.
      this.propertyBookingModel
        .find({
          status: BookingStatus.PENDING,
          $or: [
            { respond_by: { $lte: now } },
            { respond_by: { $exists: false }, start_at: { $lte: now } },
          ],
        })
        .select('_id')
        .lean()
        .exec(),
    ]);
    for (const { _id } of parties) {
      await this.declineRequest('party', _id, 'no-answer');
    }
    for (const { _id } of homes) {
      await this.declineRequest('home', _id, 'no-answer');
    }
  }

  /** Only touches it if it's still waiting, so the guest never gets two emails. */
  private async declineRequest(
    kind: Kind,
    id: Types.ObjectId,
    reason: DeclineReason,
  ) {
    const filter = { _id: id, status: BookingStatus.PENDING };
    const update = { $set: { status: BookingStatus.DECLINED } };
    let item: AnyBooking | undefined;
    if (kind === 'party') {
      const booking = await this.partyBookingModel
        .findOneAndUpdate(filter, update, { new: true })
        .exec();
      if (booking) item = { kind, booking };
    } else {
      const booking = await this.propertyBookingModel
        .findOneAndUpdate(filter, update, { new: true })
        .exec();
      if (booking) item = { kind, booking };
    }
    if (!item) return;
    const declined = item;
    this.notify(declined, (guest, host) =>
      declinedMails(declined, guest, host, this.siteUrl, reason),
    );
  }

  private async confirmedSpots(
    partyId: Types.ObjectId,
    leaveOut?: Types.ObjectId,
  ) {
    const [taken] = await this.partyBookingModel.aggregate<{ guests: number }>([
      {
        $match: {
          partyId,
          status: BookingStatus.CONFIRMED,
          ...(leaveOut ? { _id: { $ne: leaveOut } } : {}),
        },
      },
      { $group: { _id: null, guests: { $sum: '$guests' } } },
    ]);
    return taken?.guests ?? 0;
  }

  private async partySpotsLeft(
    partyId: Types.ObjectId,
    leaveOut?: Types.ObjectId,
  ) {
    const party = await this.partyModel
      .findById(partyId)
      .select('guest_capacity')
      .lean()
      .exec();
    if (!party?.guest_capacity) return undefined;
    return (
      party.guest_capacity - (await this.confirmedSpots(partyId, leaveOut))
    );
  }

  /** Requests don't hold spots, so the party may have filled up since. */
  private async assertPartyRoom(booking: PartyBooking) {
    const spotsLeft = await this.partySpotsLeft(booking.partyId, booking._id);
    if (spotsLeft === undefined || booking.guests <= spotsLeft) return;
    throw new ConflictException(
      spotsLeft > 0
        ? `Only ${spotsText(spotsLeft)} left, not enough for this group of ${booking.guests}`
        : "The party is full, so this request can't be accepted",
    );
  }

  private async declineWhatNoLongerFits(partyId: Types.ObjectId) {
    const spotsLeft = await this.partySpotsLeft(partyId);
    if (spotsLeft === undefined) return;
    const tooBig = await this.partyBookingModel
      .find({
        partyId,
        status: BookingStatus.PENDING,
        guests: { $gt: spotsLeft },
      })
      .select('_id')
      .lean()
      .exec();
    for (const request of tooBig) {
      await this.declineRequest('party', request._id, 'full');
    }
  }

  /** Host types a guest's code at the door. Each code works once. */
  async checkIn(hostId: string, rawCode: string) {
    const code = cleanCode(rawCode);
    const filter = { hostId: new Types.ObjectId(hostId), 'tickets.code': code };
    const party = await this.partyBookingModel
      .findOne(filter)
      .populate<{ guestId: Person }>('guestId', GUEST_FIELDS)
      .exec();
    const home = party
      ? null
      : await this.propertyBookingModel
          .findOne(filter)
          .populate<{ guestId: Person }>('guestId', GUEST_FIELDS)
          .exec();
    const booking = party ?? home;
    if (!booking) {
      throw new NotFoundException(
        "That code doesn't match anyone booked on your listings",
      );
    }
    if (booking.status === BookingStatus.PENDING) {
      throw new BadRequestException(
        "You haven't accepted this booking yet, so the code doesn't work",
      );
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `This booking was ${booking.status}, so the code doesn't work anymore`,
      );
    }
    const now = new Date();
    if (party?.end_date && partyExpiry(party.end_date) <= now) {
      throw new BadRequestException('This party has already ended');
    }
    if (home && home.end_at <= now) {
      throw new BadRequestException('This booking has already ended');
    }

    const unused = {
      _id: booking._id,
      tickets: { $elemMatch: { code, checked_in_at: null } },
    };
    const checkIn = { $set: { 'tickets.$.checked_in_at': now } };
    const updated = party
      ? await this.partyBookingModel
          .findOneAndUpdate(unused, checkIn, { new: true })
          .lean()
          .exec()
      : await this.propertyBookingModel
          .findOneAndUpdate(unused, checkIn, { new: true })
          .lean()
          .exec();
    const ticket = (updated ?? booking).tickets.find(
      (item) => item.code === code,
    ) as Ticket;
    if (!updated) {
      throw new ConflictException(
        `Already checked in at ${clockAt(ticket.checked_in_at ?? now)} (${ticket.name})`,
      );
    }

    return {
      name: ticket.name,
      booked_by: bookerName(booking.guestId),
      kind: party ? 'party' : 'home',
      listing: booking.title,
      party: party ? booking.title : undefined,
      group: booking.guests,
      group_checked_in: updated.tickets.filter((item) => item.checked_in_at)
        .length,
      checked_in_at: now,
    };
  }

  /** Everyone coming to a party, for the host's door list. No codes. */
  async partyGuests(hostId: string, partyId: string) {
    if (!isValidObjectId(partyId))
      throw new NotFoundException('Party not found');
    const filter = {
      partyId: new Types.ObjectId(partyId),
      hostId: new Types.ObjectId(hostId),
      status: BookingStatus.CONFIRMED,
    };
    const [party, bookings] = await Promise.all([
      this.partyModel
        .findOne({ _id: filter.partyId, ownerId: filter.hostId })
        .select('title')
        .lean()
        .exec(),
      this.partyBookingModel
        .find(filter)
        .populate<{ guestId: Person }>('guestId', GUEST_FIELDS)
        .sort({ createdAt: 1 })
        .lean()
        .exec(),
    ]);
    if (!party && !bookings.length) {
      throw new NotFoundException('Party not found');
    }

    const guests = bookings.flatMap((booking) =>
      booking.tickets.map((ticket) => ({
        name: ticket.name,
        booked_by: bookerName(booking.guestId),
        booking_id: booking._id,
        checked_in_at: ticket.checked_in_at ?? null,
      })),
    );
    return {
      title: party?.title ?? bookings[0].title,
      spots: bookings.reduce((sum, booking) => sum + booking.guests, 0),
      checked_in: guests.filter((guest) => guest.checked_in_at).length,
      guests,
      // Booked before codes, the host checks these by name.
      without_codes: bookings
        .filter((booking) => !booking.tickets.length)
        .map((booking) => ({
          booked_by: bookerName(booking.guestId),
          spots: booking.guests,
        })),
    };
  }

  /** The group on one home booking, for the host to check in. No codes. */
  async homeGuests(hostId: string, bookingId: string) {
    const booking = isValidObjectId(bookingId)
      ? await this.propertyBookingModel
          .findOne({
            _id: new Types.ObjectId(bookingId),
            hostId: new Types.ObjectId(hostId),
          })
          .populate<{ guestId: Person }>('guestId', GUEST_FIELDS)
          .lean()
          .exec()
      : null;
    if (!booking) throw new NotFoundException('Booking not found');

    const bookedBy = bookerName(booking.guestId);
    const guests = booking.tickets.map((ticket) => ({
      name: ticket.name,
      booked_by: bookedBy,
      booking_id: booking._id,
      checked_in_at: ticket.checked_in_at ?? null,
    }));
    return {
      title: booking.title,
      status: booking.status,
      start_at: booking.start_at,
      end_at: booking.end_at,
      spots: booking.guests,
      checked_in: guests.filter((guest) => guest.checked_in_at).length,
      guests,
      without_codes: booking.tickets.length
        ? []
        : [{ booked_by: bookedBy, spots: booking.guests }],
    };
  }

  private async assertPropertyFree(
    propertyId: Types.ObjectId,
    startAt: Date,
    endAt: Date,
  ) {
    const days = wholeDays(startAt, endAt);
    const clash = await this.propertyBookingModel
      .findOne({
        propertyId,
        status: BookingStatus.CONFIRMED,
        start_at: { $lt: days.to },
        end_at: { $gt: days.from },
      })
      .select('start_at')
      .lean()
      .exec();
    if (clash) {
      const day = nigeriaDate(
        clash.start_at > days.from ? clash.start_at : days.from,
      );
      throw new ConflictException(
        `Someone already booked this place on ${readableDate(day)}. Pick another day.`,
      );
    }
  }

  /** Guests and hosts can cancel before it starts. Only the host accepts or declines requests. */
  private assertStatusChange(
    booking: Booking | null,
    userId: string,
    status: BookingStatus,
    hasStarted: boolean,
  ): asserts booking is Booking {
    const isHost = booking?.hostId.toString() === userId.toString();
    const isGuest = booking?.guestId.toString() === userId.toString();
    if (!booking || (!isHost && !isGuest)) {
      throw new NotFoundException('Booking not found');
    }

    const canCancel =
      status === BookingStatus.CANCELLED &&
      ACTIVE_STATUSES.includes(booking.status) &&
      !hasStarted;
    const canAnswer =
      isHost &&
      booking.status === BookingStatus.PENDING &&
      (status === BookingStatus.CONFIRMED || status === BookingStatus.DECLINED);

    if (!canCancel && !canAnswer) {
      throw new BadRequestException(
        `This booking is ${booking.status}, it can't be changed to ${status}`,
      );
    }
  }
}
