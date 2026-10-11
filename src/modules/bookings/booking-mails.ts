import { buildMail, MailContent } from '../mail/layout';
import { Mail } from '../mail/mail.service';
import { BookingStatus } from './schemas/booking-status';
import { PartyBooking } from './schemas/party-booking.schema';
import { PropertyBooking } from './schemas/property-booking.schema';

export interface Person {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export const fullName = (person: Person) =>
  `${person.firstName} ${person.lastName}`.trim();

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

const people = (count: number) =>
  `${count} ${count === 1 ? 'person' : 'people'}`;

const money = (amount: number) =>
  `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** "19:30" -> "7:30 pm" */
const clockTime = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
};

const day = (date: Date) =>
  new Date(date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const nigeriaTime = (date: Date) =>
  new Date(date).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Lagos',
  });

const partyWhen = (booking: PartyBooking) => {
  if (!booking.start_date) return 'Check the party page';
  const start = day(booking.start_date);
  const end = booking.end_date ? day(booking.end_date) : start;
  const dates = end === start ? start : `${start} to ${end}`;
  return booking.start_time
    ? `${dates}, starts ${clockTime(booking.start_time)}`
    : dates;
};

const partyRows = (booking: PartyBooking) => [
  { label: 'Party', value: booking.title },
  { label: 'When', value: partyWhen(booking) },
  ...(booking.location ? [{ label: 'Where', value: booking.location }] : []),
];

const propertyRows = (booking: PropertyBooking) => [
  { label: 'Place', value: booking.title },
  {
    label: 'When',
    value: `${nigeriaTime(booking.start_at)}, ${plural(booking.hours, 'hour')}`,
  },
  ...(booking.location ? [{ label: 'Where', value: booking.location }] : []),
  { label: 'Guests', value: String(booking.guests) },
  { label: 'Total', value: money(booking.total) },
];

const guestContact = (guest: Person) => [
  { label: 'Guest', value: fullName(guest) },
  { label: 'Email', value: guest.email },
  ...(guest.phone ? [{ label: 'Phone', value: guest.phone }] : []),
];

const noteRow = (note?: string) =>
  note ? [{ label: 'Note', value: note }] : [];

/** Each email gets one message with all of its codes. */
const ticketsByEmail = (booking: PartyBooking) => {
  const groups = new Map<string, { name: string; code: string }[]>();
  for (const { email, name, code } of booking.tickets) {
    groups.set(email, [...(groups.get(email) ?? []), { name, code }]);
  }
  return groups;
};

export const partyBookedMails = (
  booking: PartyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
): Mail[] => {
  const booker = fullName(guest);
  const guestMails = [...ticketsByEmail(booking)].map(
    ([email, codes]): MailContent => {
      const isBooker = email === guest.email.toLowerCase();
      return {
        to: email,
        subject: `Your code for ${booking.title}`,
        heading: isBooker
          ? `You're going to ${booking.title}!`
          : `${booker} booked you a spot at ${booking.title}`,
        intro:
          codes.length > 1
            ? 'Here are the codes for your group. Each code gets one person in, one time, so send each friend their own.'
            : 'Show this code at the door. It gets you in one time, so keep it to yourself.',
        codes,
        rows: [
          ...partyRows(booking),
          ...(isBooker ? [] : [{ label: 'Booked by', value: booker }]),
          { label: 'Group', value: people(booking.guests) },
        ],
        link: isBooker
          ? {
              label: 'See your trips',
              url: `${siteUrl}/reservations?tab=trips`,
            }
          : {
              label: 'See the party',
              url: `${siteUrl}/parties/${booking.partyId.toString()}`,
            },
      };
    },
  );

  const hostMail: MailContent = {
    to: host.email,
    subject: `New booking: ${booking.title}`,
    heading: `${booker} booked ${plural(booking.guests, 'spot')} for ${booking.title}`,
    intro:
      'Everyone in the group got their own code. Check them in at the door from the guest list.',
    rows: [
      ...guestContact(guest),
      { label: 'Spots', value: String(booking.guests) },
      {
        label: 'Names',
        value: booking.tickets.map((ticket) => ticket.name).join(', '),
      },
      { label: 'Total', value: money(booking.total) },
      ...noteRow(booking.note),
    ],
    link: {
      label: 'Open the guest list',
      url: `${siteUrl}/check-in/${booking.partyId.toString()}`,
    },
  };

  return [...guestMails, hostMail].map(buildMail);
};

export const partyCancelledMails = (
  booking: PartyBooking,
  guest: Person,
  host: Person,
  byHost: boolean,
  siteUrl: string,
): Mail[] => {
  const booker = fullName(guest);
  const rows = [
    ...partyRows(booking),
    { label: 'Group', value: people(booking.guests) },
  ];
  const guestEmails = [...ticketsByEmail(booking).keys()].filter(
    (email) => byHost || email !== guest.email.toLowerCase(),
  );
  const mails: MailContent[] = guestEmails.map((email) => ({
    to: email,
    subject: `Cancelled: ${booking.title}`,
    heading: byHost
      ? `The host cancelled the booking for ${booking.title}`
      : `${booker} cancelled the booking for ${booking.title}`,
    intro: "The codes from this booking won't work at the door anymore.",
    rows,
    link: { label: 'Find another party', url: `${siteUrl}/parties` },
  }));
  if (!byHost) {
    mails.push({
      to: host.email,
      subject: `Booking cancelled: ${booking.title}`,
      heading: `${booker} cancelled their booking for ${booking.title}`,
      intro: `${plural(booking.guests, 'spot')} opened up again, and their codes won't work at the door anymore.`,
      rows: [...guestContact(guest), ...rows],
      link: {
        label: 'Open reservations',
        url: `${siteUrl}/reservations?tab=hosting`,
      },
    });
  }
  return mails.map(buildMail);
};

export const propertyBookedMails = (
  booking: PropertyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
): Mail[] => {
  const isRequest = booking.status === BookingStatus.PENDING;
  const booker = fullName(guest);
  return [
    {
      to: host.email,
      subject: isRequest
        ? `New booking request: ${booking.title}`
        : `New booking: ${booking.title}`,
      heading: isRequest
        ? `${booker} wants to book ${booking.title}`
        : `${booker} booked ${booking.title}`,
      intro: isRequest
        ? 'Accept or decline it on your reservations page.'
        : "It's confirmed, here are the details.",
      rows: [
        ...guestContact(guest),
        ...propertyRows(booking),
        ...noteRow(booking.note),
      ],
      link: {
        label: 'Open reservations',
        url: `${siteUrl}/reservations?tab=hosting`,
      },
    },
    {
      to: guest.email,
      subject: isRequest
        ? `Request sent: ${booking.title}`
        : `Booking confirmed: ${booking.title}`,
      heading: isRequest
        ? 'Your request is with the host'
        : `You're booked at ${booking.title}!`,
      intro: isRequest
        ? `We'll email you when ${host.firstName} accepts or declines it.`
        : `Hosted by ${fullName(host)}.`,
      rows: propertyRows(booking),
      link: {
        label: 'See your trips',
        url: `${siteUrl}/reservations?tab=trips`,
      },
    },
  ].map(buildMail);
};

export const propertyStatusMails = (
  booking: PropertyBooking,
  guest: Person,
  host: Person,
  byHost: boolean,
  siteUrl: string,
): Mail[] => {
  const rows = propertyRows(booking);
  const trips = {
    label: 'See your trips',
    url: `${siteUrl}/reservations?tab=trips`,
  };
  const homes = { label: 'Find another place', url: `${siteUrl}/homes` };
  switch (booking.status) {
    case BookingStatus.CONFIRMED:
      return [
        buildMail({
          to: guest.email,
          subject: `Booking confirmed: ${booking.title}`,
          heading: `${host.firstName} accepted your booking`,
          intro: `You're booked at ${booking.title}.`,
          rows,
          link: trips,
        }),
      ];
    case BookingStatus.DECLINED:
      return [
        buildMail({
          to: guest.email,
          subject: `Booking declined: ${booking.title}`,
          heading: `${booking.title} isn't available`,
          intro:
            "The host couldn't take this booking. Try another time or another place.",
          rows,
          link: homes,
        }),
      ];
    case BookingStatus.CANCELLED:
      return [
        byHost
          ? buildMail({
              to: guest.email,
              subject: `Cancelled: ${booking.title}`,
              heading: 'The host cancelled your booking',
              intro: `${fullName(host)} cancelled your booking at ${booking.title}.`,
              rows,
              link: homes,
            })
          : buildMail({
              to: host.email,
              subject: `Booking cancelled: ${booking.title}`,
              heading: `${fullName(guest)} cancelled their booking`,
              intro: 'That day is free again.',
              rows: [...guestContact(guest), ...rows],
              link: {
                label: 'Open reservations',
                url: `${siteUrl}/reservations?tab=hosting`,
              },
            }),
      ];
    default:
      return [];
  }
};
