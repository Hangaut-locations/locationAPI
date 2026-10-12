export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  DECLINED = 'declined',
  CANCELLED = 'cancelled',
}

/** Bookings that are going ahead or still waiting on the host. Only confirmed ones take up room. */
export const ACTIVE_STATUSES = [BookingStatus.PENDING, BookingStatus.CONFIRMED];
