export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}

/** Bookings that still hold a spot or a time slot. */
export const ACTIVE_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
