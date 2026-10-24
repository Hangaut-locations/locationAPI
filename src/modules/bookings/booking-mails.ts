import QRCode from 'qrcode';
import { buildMail, MailContent } from '../mail/layout';
import { Mail } from '../mail/mail.service';
import { PartyBooking } from './schemas/party-booking.schema';
import { PropertyBooking } from './schemas/property-booking.schema';

export interface Person {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export type Kind = 'party' | 'home';

export type AnyBooking =
  | { kind: 'party'; booking: PartyBooking }
  | { kind: 'home'; booking: PropertyBooking };

/** Why a request didn't go through. */
export type DeclineReason = 'host' | 'no-answer' | 'full' | 'day-taken';

type Row = { label: string; value: string };

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

const nigeriaDay = (date: Date) =>
  new Date(date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Lagos',
  });

const homeWhen = (booking: PropertyBooking) => {
  if (!booking.days) {
    return `${nigeriaTime(booking.start_at)}, ${plural(booking.hours, 'hour')}`;
  }
  const first = nigeriaDay(booking.start_at);
  if (booking.days === 1) return `${first}, all day`;
  const last = nigeriaDay(new Date(new Date(booking.end_at).getTime() - 1));
  return `${first} to ${last} (${plural(booking.days, 'day')})`;
};

const when = (item: AnyBooking) =>
  item.kind === 'party' ? partyWhen(item.booking) : homeWhen(item.booking);

const listingRows = (item: AnyBooking): Row[] => [
  {
    label: item.kind === 'party' ? 'Party' : 'Place',
    value: item.booking.title,
  },
  { label: 'When', value: when(item) },
  ...(item.booking.location
    ? [{ label: 'Where', value: item.booking.location }]
    : []),
];

const guestContact = (guest: Person): Row[] => [
  { label: 'Guest', value: fullName(guest) },
  { label: 'Email', value: guest.email },
  ...(guest.phone ? [{ label: 'Phone', value: guest.phone }] : []),
];

const groupRows = (item: AnyBooking): Row[] => {
  const names = item.booking.tickets.map((ticket) => ticket.name);
  return [
    { label: 'Group', value: people(item.booking.guests) },
    ...(names.length > 1 ? [{ label: 'Names', value: names.join(', ') }] : []),
  ];
};

const totalRow = (item: AnyBooking): Row[] => [
  { label: 'Total', value: money(item.booking.total) },
];

const noteRow = (note?: string): Row[] =>
  note ? [{ label: 'Note', value: note }] : [];

const rulesRow = (rules?: string): Row[] =>
  rules ? [{ label: 'House rules', value: rules }] : [];

/** Each email gets one message with all of its codes. */
const ticketsByEmail = (item: AnyBooking) => {
  const groups = new Map<string, { name: string; code: string }[]>();
  for (const { email, name, code } of item.booking.tickets) {
    groups.set(email, [...(groups.get(email) ?? []), { name, code }]);
  }
  return groups;
};

const links = (item: AnyBooking, siteUrl: string) => ({
  trips: { label: 'See your trips', url: `${siteUrl}/reservations?tab=trips` },
  hosting: {
    label: 'Open reservations',
    url: `${siteUrl}/reservations?tab=hosting`,
  },
  listing:
    item.kind === 'party'
      ? {
          label: 'See the party',
          url: `${siteUrl}/parties/${item.booking.partyId.toString()}`,
        }
      : {
          label: 'See the place',
          url: `${siteUrl}/homes/${item.booking.propertyId.toString()}`,
        },
  guestList: {
    label: 'Open the guest list',
    url:
      item.kind === 'party'
        ? `${siteUrl}/check-in/${item.booking.partyId.toString()}`
        : `${siteUrl}/check-in/home/${item.booking._id.toString()}`,
  },
  more:
    item.kind === 'party'
      ? { label: 'Find another party', url: `${siteUrl}/parties` }
      : { label: 'Find another place', url: `${siteUrl}/homes` },
});

/** The host has to accept first. Friends hear nothing until then. */
export const requestMails = (
  item: AnyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
  privateParty = false,
): Mail[] => {
  const booker = fullName(guest);
  const link = links(item, siteUrl);
  const { title, guests } = item.booking;
  return [
    {
      to: host.email,
      subject: `New booking request: ${title}`,
      heading:
        item.kind === 'party'
          ? `${booker} wants ${plural(guests, 'spot')} at ${title}`
          : `${booker} wants to book ${title}`,
      intro: privateParty
        ? "This party is private, so the link alone doesn't let anyone in. Log in to Hangaut and accept or decline it on your reservations page. Once you accept, everyone in the group gets their own code by email."
        : 'Log in to Hangaut and accept or decline it on your reservations page. Once you accept, everyone in the group gets their own code by email.',
      rows: [
        ...guestContact(guest),
        ...listingRows(item),
        ...groupRows(item),
        ...totalRow(item),
        ...noteRow(item.booking.note),
      ],
      outro:
        "If you don't answer before it starts, it gets declined on its own.",
      link: link.hosting,
    },
    {
      to: guest.email,
      subject: `Request sent: ${title}`,
      heading: 'Your request is with the host',
      intro: `We'll email you and everyone you're bringing your codes as soon as ${host.firstName} accepts it.`,
      rows: [...listingRows(item), ...groupRows(item), ...totalRow(item)],
      link: link.trips,
    },
  ].map(buildMail);
};

const doorQr = async (code: string, id: string) => {
  const png = await QRCode.toBuffer(code, {
    type: 'png',
    margin: 1,
    width: 280,
    errorCorrectionLevel: 'M',
  });
  return {
    id,
    filename: `${id}.png`,
    content: png.toString('base64'),
  };
};

/** Everyone in the group gets their codes. The host hears about instant bookings. */
export const confirmedMails = async (
  item: AnyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
  acceptedByHost: boolean,
): Promise<Mail[]> => {
  const booker = fullName(guest);
  const link = links(item, siteUrl);
  const { title } = item.booking;
  const going =
    item.kind === 'party'
      ? `You're going to ${title}!`
      : `You're booked at ${title}!`;

  const guestMails = await Promise.all(
    [...ticketsByEmail(item)].map(async ([email, codes], groupIndex) => {
      const isBooker = email === guest.email.toLowerCase();
      const images = await Promise.all(
        codes.map((ticket, index) =>
          doorQr(ticket.code, `door-${groupIndex}-${index}`),
        ),
      );
      const content: MailContent = {
        to: email,
        subject: acceptedByHost
          ? `Booking confirmed: ${title}`
          : `Your code for ${title}`,
        heading: isBooker
          ? acceptedByHost
            ? `${host.firstName} accepted your booking. ${going}`
            : going
          : `${booker} booked you a spot at ${title}`,
        intro:
          codes.length > 1
            ? 'Here are the codes for your group. Each code gets one person in, one time, so send each friend their own.'
            : 'Show this code to the host when you arrive. It works one time, so keep it to yourself.',
        codes: codes.map((ticket, index) => ({
          ...ticket,
          qrId: images[index]?.id,
        })),
        images,
        rows: [
          ...listingRows(item),
          ...(isBooker ? [] : [{ label: 'Booked by', value: booker }]),
          { label: 'Group', value: people(item.booking.guests) },
          { label: 'Host', value: fullName(host) },
          ...rulesRow(item.booking.rules),
        ],
        outro: item.booking.rules
          ? 'Please stick to the house rules so everyone has a good time.'
          : undefined,
        link: isBooker ? link.trips : link.listing,
      };
      return buildMail(content);
    }),
  );

  if (acceptedByHost) return guestMails;

  const hostMail: MailContent = {
    to: host.email,
    subject: `New booking: ${title}`,
    heading:
      item.kind === 'party'
        ? `${booker} booked ${plural(item.booking.guests, 'spot')} for ${title}`
        : `${booker} booked ${title}`,
    intro:
      'Everyone in the group got their own code. Check them in from the guest list when they arrive.',
    rows: [
      ...guestContact(guest),
      ...listingRows(item),
      ...groupRows(item),
      ...totalRow(item),
      ...noteRow(item.booking.note),
    ],
    link: link.guestList,
  };
  return [...guestMails, buildMail(hostMail)];
};

const declineText: Record<DeclineReason, (host: Person) => string> = {
  host: (host) => `${host.firstName} couldn't take this booking.`,
  'no-answer': (host) =>
    `${host.firstName} didn't answer before it started, so the request was closed.`,
  full: () => 'It filled up before the host could accept your request.',
  'day-taken': () =>
    'Someone else got that day before the host could accept your request.',
};

/** Only the booker hears, friends never got codes. */
export const declinedMails = (
  item: AnyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
  reason: DeclineReason,
): Mail[] => {
  const link = links(item, siteUrl);
  return [
    buildMail({
      to: guest.email,
      subject: `Booking declined: ${item.booking.title}`,
      heading: `Your request for ${item.booking.title} didn't go through`,
      intro: `${declineText[reason](host)} Try another time or another place.`,
      rows: [...listingRows(item), ...groupRows(item)],
      link: link.more,
    }),
  ];
};

export const cancelledMails = (
  item: AnyBooking,
  guest: Person,
  host: Person,
  siteUrl: string,
  byHost: boolean,
  wasConfirmed: boolean,
): Mail[] => {
  const booker = fullName(guest);
  const link = links(item, siteUrl);
  const { title } = item.booking;
  const rows = [...listingRows(item), ...groupRows(item)];

  // Friends only have codes once it was confirmed.
  const guestEmails = (
    wasConfirmed
      ? [...ticketsByEmail(item).keys()]
      : [guest.email.toLowerCase()]
  ).filter((email) => byHost || email !== guest.email.toLowerCase());
  const mails: MailContent[] = guestEmails.map((email) => ({
    to: email,
    subject: `Cancelled: ${title}`,
    heading: byHost
      ? `The host cancelled the booking for ${title}`
      : `${booker} cancelled the booking for ${title}`,
    intro: wasConfirmed
      ? "The codes from this booking won't work anymore."
      : 'The request is closed.',
    rows,
    link: link.more,
  }));

  if (!byHost) {
    mails.push({
      to: host.email,
      subject: wasConfirmed
        ? `Booking cancelled: ${title}`
        : `Request withdrawn: ${title}`,
      heading: wasConfirmed
        ? `${booker} cancelled their booking for ${title}`
        : `${booker} withdrew their request for ${title}`,
      intro: !wasConfirmed
        ? 'Nothing for you to do.'
        : item.kind === 'party'
          ? `${plural(item.booking.guests, 'spot')} opened up again, and their codes won't work anymore.`
          : "That day is free again, and their codes won't work anymore.",
      rows: [...guestContact(guest), ...rows],
      link: link.hosting,
    });
  }
  return mails.map(buildMail);
};
