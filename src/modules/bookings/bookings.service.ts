import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomInt } from 'crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { canOpenListing } from '../listings/visibility';
import { Mail, MailService } from '../mail/mail.service';
import { User } from '../users/schemas/user.schema';
import {
  fullName,
  partyBookedMails,
  partyCancelledMails,
  Person,
  propertyBookedMails,
  propertyStatusMails,
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
import { ACTIVE_STATUSES, BookingStatus } from './schemas/booking-status';
import { PartyBooking, Ticket } from './schemas/party-booking.schema';
import { PropertyBooking } from './schemas/property-booking.schema';

/** Nigeria (WAT) is UTC+1 all year. */
const NIGERIA_UTC_OFFSET_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
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

const fieldError = (field: string, message: string) =>
  new BadRequestException({
    message: 'Validation failed',
    data: [{ field, messages: [message] }],
  });

type Booking = PartyBooking | PropertyBooking;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

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
    booking: { guestId: Types.ObjectId; hostId: Types.ObjectId },
    build: (guest: Person, host: Person) => Mail[],
  ) {
    void Promise.all([
      this.findPerson(booking.guestId),
      this.findPerson(booking.hostId),
    ])
      .then(([guest, host]) =>
        guest && host
          ? this.mailService.sendAll(build(guest, host))
          : undefined,
      )
      .catch((error) => this.logger.error('Booking emails failed', error));
  }

  async bookParty(
    guestId: string,
    bookingData: CreatePartyBookingDto,
  ): Promise<PartyBooking> {
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

    const alreadyBooked = await this.partyBookingModel.exists({
      partyId: party._id,
      guestId: new Types.ObjectId(guestId),
      status: { $in: ACTIVE_STATUSES },
    });
    if (alreadyBooked) {
      throw new ConflictException('You already booked this party');
    }

    const [taken] = await this.partyBookingModel.aggregate<{ guests: number }>([
      {
        $match: { partyId: party._id, status: { $in: ACTIVE_STATUSES } },
      },
      { $group: { _id: null, guests: { $sum: '$guests' } } },
    ]);
    const spotsLeft = (party.guest_capacity ?? 0) - (taken?.guests ?? 0);
    if (bookingData.guests > spotsLeft) {
      throw new ConflictException(
        spotsLeft > 0
          ? `Only ${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left for this party`
          : 'This party is fully booked',
      );
    }

    const friends = bookingData.friends ?? [];
    if (friends.length > bookingData.guests - 1) {
      throw fieldError(
        'friends',
        bookingData.guests === 1
          ? "You're only booking for yourself, so there's no friend to add"
          : `You're booking for ${bookingData.guests}, so add up to ${bookingData.guests - 1} friends`,
      );
    }
    const guest = await this.findPerson(guestId);
    if (!guest) throw new NotFoundException('User not found');
    const booker = fullName(guest);
    const tickets: Ticket[] = [
      { name: booker, email: guest.email, code: newCode() },
      ...Array.from({ length: bookingData.guests - 1 }, (_, index) => ({
        name: friends[index]?.name ?? `${booker} +${index + 1}`,
        email: friends[index]?.email ?? guest.email,
        code: newCode(),
      })),
    ];

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
      status: BookingStatus.CONFIRMED,
      note: bookingData.note,
      tickets,
      title: party.title,
      image: party.images?.[0],
      location: party.location,
      start_date: party.start_date,
      end_date: party.end_date,
      start_time: party.start_time,
      charge_type: party.charge_type,
      price,
    }).save();

    this.notify(booking, (guest, host) =>
      partyBookedMails(booking, guest, host, this.siteUrl),
    );
    return booking;
  }

  async bookProperty(
    guestId: string,
    bookingData: CreatePropertyBookingDto,
  ): Promise<PropertyBooking> {
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

    const startAt = nigeriaDateTime(bookingData.date, bookingData.start_time);
    if (startAt <= new Date()) {
      throw fieldError('date', 'Pick a time in the future');
    }
    const endAt = new Date(startAt.getTime() + bookingData.hours * HOUR_MS);

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

    const price = property.price ?? 0;
    const booking = await new this.propertyBookingModel({
      propertyId: property._id,
      guestId: new Types.ObjectId(guestId),
      hostId: property.ownerId,
      guests: bookingData.guests,
      start_at: startAt,
      end_at: endAt,
      hours: bookingData.hours,
      total:
        property.charge_type === PropertyChargeType.HOUR
          ? price * bookingData.hours
          : price * bookingData.guests,
      status:
        property.booking_setting === 'instant'
          ? BookingStatus.CONFIRMED
          : BookingStatus.PENDING,
      note: bookingData.note,
      title: property.title,
      image: property.images?.[0],
      location: property.location,
      charge_type: property.charge_type,
      price,
    }).save();

    this.notify(booking, (guest, host) =>
      propertyBookedMails(booking, guest, host, this.siteUrl),
    );
    return booking;
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
    const filter = { guestId: new Types.ObjectId(guestId) };
    const [parties, properties] = await Promise.all([
      this.partyBookingModel.find(filter).sort({ createdAt: -1 }).lean().exec(),
      this.propertyBookingModel
        .find(filter)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);
    return { parties, properties };
  }

  /** Bookings guests made on the user's listings. */
  async reservations(hostId: string) {
    const filter = { hostId: new Types.ObjectId(hostId) };
    const [parties, properties] = await Promise.all([
      // Codes stay with the guests, the host checks them in by typing them.
      this.partyBookingModel
        .find(filter)
        .select('-tickets.code')
        .populate('guestId', GUEST_FIELDS)
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.propertyBookingModel
        .find(filter)
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
  ): Promise<PartyBooking> {
    const booking = isValidObjectId(bookingId)
      ? await this.partyBookingModel.findById(bookingId).exec()
      : null;
    const hasEnded =
      !!booking?.end_date && partyExpiry(booking.end_date) <= new Date();
    this.assertStatusChange(booking, userId, status, hasEnded);

    booking.status = status;
    await booking.save();

    const byHost = booking.hostId.toString() === userId.toString();
    this.notify(booking, (guest, host) =>
      partyCancelledMails(booking, guest, host, byHost, this.siteUrl),
    );
    return booking;
  }

  async updatePropertyBookingStatus(
    userId: string,
    bookingId: string,
    status: BookingStatus,
  ): Promise<PropertyBooking> {
    const booking = isValidObjectId(bookingId)
      ? await this.propertyBookingModel.findById(bookingId).exec()
      : null;
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

    const byHost = booking.hostId.toString() === userId.toString();
    this.notify(booking, (guest, host) =>
      propertyStatusMails(booking, guest, host, byHost, this.siteUrl),
    );

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
        .exec();
      for (const request of clashing) {
        request.status = BookingStatus.DECLINED;
        await request.save();
        this.notify(request, (guest, host) =>
          propertyStatusMails(request, guest, host, true, this.siteUrl),
        );
      }
    }
    return booking;
  }

  /** Host types a guest's code at the door. Each code works once. */
  async checkIn(hostId: string, rawCode: string) {
    const code = cleanCode(rawCode);
    const booking = await this.partyBookingModel
      .findOne({ hostId: new Types.ObjectId(hostId), 'tickets.code': code })
      .populate<{ guestId: Person }>('guestId', GUEST_FIELDS)
      .exec();
    if (!booking) {
      throw new NotFoundException(
        "That code doesn't match anyone booked on your parties",
      );
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `This booking was ${booking.status}, so the code doesn't work anymore`,
      );
    }
    if (booking.end_date && partyExpiry(booking.end_date) <= new Date()) {
      throw new BadRequestException('This party has already ended');
    }

    const checkedInAt = new Date();
    const updated = await this.partyBookingModel
      .findOneAndUpdate(
        {
          _id: booking._id,
          tickets: { $elemMatch: { code, checked_in_at: null } },
        },
        { $set: { 'tickets.$.checked_in_at': checkedInAt } },
        { new: true },
      )
      .lean()
      .exec();
    const ticket = (updated ?? booking).tickets.find(
      (item) => item.code === code,
    ) as Ticket;
    if (!updated) {
      throw new ConflictException(
        `Already checked in at ${clockAt(ticket.checked_in_at ?? checkedInAt)} (${ticket.name})`,
      );
    }

    return {
      name: ticket.name,
      booked_by: bookerName(booking.guestId),
      party: booking.title,
      group: booking.guests,
      group_checked_in: updated.tickets.filter((item) => item.checked_in_at)
        .length,
      checked_in_at: checkedInAt,
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
