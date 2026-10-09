import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
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
import { PartyBooking } from './schemas/party-booking.schema';
import { PropertyBooking } from './schemas/property-booking.schema';

/** Nigeria (WAT) is UTC+1 all year. */
const NIGERIA_UTC_OFFSET_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GUEST_FIELDS = 'firstName lastName email phone';

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
  constructor(
    @InjectModel(PartyBooking.name)
    private partyBookingModel: Model<PartyBooking>,
    @InjectModel(PropertyBooking.name)
    private propertyBookingModel: Model<PropertyBooking>,
    @InjectModel(Party.name) private partyModel: Model<Party>,
    @InjectModel(Property.name) private propertyModel: Model<Property>,
  ) {}

  async bookParty(
    guestId: string,
    bookingData: CreatePartyBookingDto,
  ): Promise<PartyBooking> {
    const party = await this.partyModel.findById(bookingData.partyId).exec();
    const hasEnded = !!party?.expires_at && party.expires_at <= new Date();
    if (!party || party.status === PartyStatus.DRAFT || hasEnded) {
      throw new NotFoundException('Party not found');
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

    const price = party.price ?? 0;
    return new this.partyBookingModel({
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
      title: party.title,
      image: party.images?.[0],
      location: party.location,
      start_date: party.start_date,
      end_date: party.end_date,
      start_time: party.start_time,
      charge_type: party.charge_type,
      price,
    }).save();
  }

  async bookProperty(
    guestId: string,
    bookingData: CreatePropertyBookingDto,
  ): Promise<PropertyBooking> {
    const property = await this.propertyModel
      .findById(bookingData.propertyId)
      .exec();
    if (!property || property.status !== PropertyStatus.PUBLISHED) {
      throw new NotFoundException('Property not found');
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

    await this.assertPropertyFree(property._id, startAt, endAt);

    const alreadyAsked = await this.propertyBookingModel.exists({
      propertyId: property._id,
      guestId: new Types.ObjectId(guestId),
      status: BookingStatus.PENDING,
      start_at: { $lt: endAt },
      end_at: { $gt: startAt },
    });
    if (alreadyAsked) {
      throw new ConflictException(
        'You already sent a request for this time. Wait for the host to reply.',
      );
    }

    const price = property.price ?? 0;
    return new this.propertyBookingModel({
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
      this.partyBookingModel
        .find(filter)
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
    return booking.save();
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

    if (status === BookingStatus.CONFIRMED) {
      // Other requests for the same time can't happen anymore.
      await this.propertyBookingModel.updateMany(
        {
          _id: { $ne: booking._id },
          propertyId: booking.propertyId,
          status: BookingStatus.PENDING,
          start_at: { $lt: booking.end_at },
          end_at: { $gt: booking.start_at },
        },
        { status: BookingStatus.DECLINED },
      );
    }
    return booking;
  }

  private async assertPropertyFree(
    propertyId: Types.ObjectId,
    startAt: Date,
    endAt: Date,
  ) {
    const clash = await this.propertyBookingModel.exists({
      propertyId,
      status: BookingStatus.CONFIRMED,
      start_at: { $lt: endAt },
      end_at: { $gt: startAt },
    });
    if (clash) {
      throw new ConflictException(
        'Someone already booked this place for that time. Pick another time.',
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
