import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { BookingStatus } from '../schemas/booking-status';

const NEXT_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.DECLINED,
  BookingStatus.CANCELLED,
];

export class UpdateBookingStatusDto {
  @ApiProperty({ enum: NEXT_STATUSES })
  @IsIn(NEXT_STATUSES)
  status!: BookingStatus;
}
