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
  @ApiOperation({ summary: 'Book a party (confirmed straight away)' })
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
      'Book a property. Confirmed straight away for instant booking, otherwise waits for the host. Refused if the time clashes with a confirmed booking',
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

  @Get('properties/:propertyId/taken')
  @ApiOperation({ summary: 'Upcoming booked times for a property' })
  takenTimes(@Param('propertyId') propertyId: string) {
    return this.bookingsService.takenTimes(propertyId);
  }

  @Patch('parties/:id/status')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Cancel a party booking' })
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
