import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { BookingsService } from './bookings.service';
import { CheckInDto } from './dto/check-in.dto';
import { CreatePartyBookingDto } from './dto/create-party-booking.dto';
import { CreatePropertyBookingDto } from './dto/create-property-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post('parties')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Book a party. Confirmed straight away for instant parties, otherwise waits for the host. Codes go out once it is confirmed',
  })
  bookParty(
    @Req() request: AuthenticatedRequest,
    @Body() bookingData: CreatePartyBookingDto,
  ) {
    return this.bookingsService.bookParty(request.user._id, bookingData);
  }

  @Post('properties')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Book a property. Confirmed straight away for instant booking, otherwise waits for the host. One booking a day, refused if the day (or a day a late booking runs into) already has a confirmed booking. Places charged per day take date + days instead of start_time + hours',
  })
  bookProperty(
    @Req() request: AuthenticatedRequest,
    @Body() bookingData: CreatePropertyBookingDto,
  ) {
    return this.bookingsService.bookProperty(request.user._id, bookingData);
  }

  @Get('trips')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Party and property bookings I made as a guest' })
  trips(@Req() request: AuthenticatedRequest) {
    return this.bookingsService.trips(request.user._id);
  }

  @Get('reservations')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Bookings guests made on my listings' })
  reservations(@Req() request: AuthenticatedRequest) {
    return this.bookingsService.reservations(request.user._id);
  }

  @Post('check-in')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Host checks a guest in with their code, for parties and homes. Each code works once, a second try says who already used it',
  })
  checkIn(@Req() request: AuthenticatedRequest, @Body() { code }: CheckInDto) {
    return this.bookingsService.checkIn(request.user._id, code);
  }

  @Post('parties/check-in')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Same as check-in, kept for the old site' })
  checkInParty(
    @Req() request: AuthenticatedRequest,
    @Body() { code }: CheckInDto,
  ) {
    return this.bookingsService.checkIn(request.user._id, code);
  }

  @Get('properties/:id/guests')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: "Host's guest list for one home booking, with who has checked in",
  })
  homeGuests(
    @Req() request: AuthenticatedRequest,
    @Param('id') bookingId: string,
  ) {
    return this.bookingsService.homeGuests(request.user._id, bookingId);
  }

  @Get('parties/:partyId/guests')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: "Host's guest list for a party, with who has checked in",
  })
  partyGuests(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
  ) {
    return this.bookingsService.partyGuests(request.user._id, partyId);
  }

  @Get('properties/:propertyId/taken')
  @ApiOperation({ summary: 'Upcoming booked times for a property' })
  takenTimes(@Param('propertyId') propertyId: string) {
    return this.bookingsService.takenTimes(propertyId);
  }

  @Patch('parties/:id/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Host accepts or declines a request, or either side cancels',
  })
  updatePartyBookingStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') bookingId: string,
    @Body() { status }: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updatePartyBookingStatus(
      request.user._id,
      bookingId,
      status,
    );
  }

  @Patch('properties/:id/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Host accepts or declines a request, or either side cancels',
  })
  updatePropertyBookingStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') bookingId: string,
    @Body() { status }: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updatePropertyBookingStatus(
      request.user._id,
      bookingId,
      status,
    );
  }
}
