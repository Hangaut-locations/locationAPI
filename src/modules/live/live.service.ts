import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { nigeriaDateTime } from '../bookings/bookings.service';
import { PartiesService, partyExpiry } from '../parties/parties.service';
import { StatusType } from '../parties/schemas/party.schema';
import {
  HostSignalDto,
  LiveCommentDto,
  ViewerDto,
  ViewerSignalDto,
} from './dto/live.dto';
import { LiveComment } from './schemas/live.schema';
import { LiveLove } from './schemas/live.schema';
import { LiveSession } from './schemas/live.schema';
import { LiveSignal } from './schemas/live.schema';
import { LiveViewer } from './schemas/live.schema';

const MAX_VIEWERS = 40;
const STALE_MS = 15_000;
const HOST_STALE_MS = 12_000;
const COMMENT_GAP_MS = 5_000;

const sameId = (left?: string, right?: unknown) => {
  if (!left || right == null) return false;
  if (typeof right === 'string') return left === right;
  if (typeof right === 'object' && 'toString' in right) {
    return left === (right as { toString(): string }).toString();
  }
  return false;
};

type PartyFields = {
  ownerId?: unknown;
  status?: string;
  start_date?: Date;
  end_date?: Date;
  start_time?: string;
  end_time?: string | null;
};

const partyKey = (partyId: string) => new Types.ObjectId(partyId);

const fieldsOf = (party: object): PartyFields => party;

@Injectable()
export class LiveService {
  constructor(
    @InjectModel(LiveSession.name) private sessions: Model<LiveSession>,
    @InjectModel(LiveViewer.name) private viewers: Model<LiveViewer>,
    @InjectModel(LiveSignal.name) private signals: Model<LiveSignal>,
    @InjectModel(LiveComment.name) private comments: Model<LiveComment>,
    @InjectModel(LiveLove.name) private loves: Model<LiveLove>,
    private partiesService: PartiesService,
  ) {}

  async start(partyId: string, userId: string) {
    const party = fieldsOf(await this.open(partyId, userId));
    this.assertHostWindow(party, userId);
    const partyObjectId = new Types.ObjectId(partyId);
    await this.sessions.findOneAndUpdate(
      { partyId: partyObjectId },
      {
        hostId: new Types.ObjectId(userId),
        active: true,
        startedAt: new Date(),
        hostSeen: new Date(),
        signalSeq: 0,
      },
      { upsert: true, new: true },
    );
    await this.signals.deleteMany({ partyId: partyObjectId });
    await this.viewers.deleteMany({ partyId: partyObjectId });
    return { live: true };
  }

  async stop(partyId: string, userId: string) {
    const party = fieldsOf(await this.open(partyId, userId));
    if (!sameId(userId, party.ownerId)) {
      throw new ForbiddenException('Only the host can stop the live video');
    }
    await this.endSession(partyId);
    return { live: false };
  }

  /** Published parties whose host has the camera on, for the row under the search line. */
  async listOnAir() {
    const sessions = await this.sessions
      .find({ active: true })
      .select('partyId hostSeen')
      .lean();
    const parties: LiveCard[] = [];
    for (const session of sessions) {
      if (!this.hostFresh(session.hostSeen)) {
        await this.endSession(String(session.partyId));
        continue;
      }
      const card = await this.cardFor(String(session.partyId));
      if (card) parties.push(card);
    }
    return { parties };
  }

  async state(
    partyId: string,
    userId: string | undefined,
    viewerId: string | undefined,
    after: number,
    key?: string,
  ) {
    const party = fieldsOf(await this.open(partyId, userId, key));
    const window = partyWindow(party);
    const session = await this.sessions
      .findOne({ partyId: partyKey(partyId) })
      .lean();
    const current = await this.settle(session);
    const live = !!current && window.on;
    const hostWatching = sameId(userId, party.ownerId);
    if (live && viewerId && !hostWatching) {
      await this.touchViewer(partyId, viewerId);
    }
    const [loveCount, loved, comments, signals, watching] = await Promise.all([
      this.loves.countDocuments({ partyId: partyKey(partyId) }),
      viewerId
        ? this.loves.exists({ partyId, viewerId })
        : Promise.resolve(null),
      this.comments
        .find({ partyId: partyKey(partyId) })
        .sort({ createdAt: -1 })
        .limit(40)
        .lean(),
      live && viewerId
        ? this.signals
            .find({
              partyId,
              viewerId,
              from: 'host',
              seq: { $gt: after },
            })
            .sort({ seq: 1 })
            .limit(50)
            .lean()
        : Promise.resolve([]),
      this.watching(partyId),
    ]);
    return {
      live,
      started: window.started,
      ended: window.ended,
      loves: loveCount,
      loved: !!loved,
      full: watching >= MAX_VIEWERS,
      watching,
      comments: comments.reverse().map((comment) => ({
        id: String(comment._id),
        name: comment.name,
        text: comment.text,
        createdAt: comment.createdAt,
      })),
      signals: signals.map(toSignal),
    };
  }

  async hostFeed(partyId: string, userId: string, after: number) {
    const party = fieldsOf(await this.open(partyId, userId));
    if (!sameId(userId, party.ownerId)) {
      throw new ForbiddenException('Only the host can run the live video');
    }
    const session = await this.sessions.findOne({ partyId, active: true }).lean();
    if (!(await this.settle(session))) return { viewers: [], signals: [] };
    await this.sessions.updateOne(
      { partyId, active: true },
      { hostSeen: new Date() },
    );
    const since = new Date(Date.now() - STALE_MS);
    const [viewers, signals] = await Promise.all([
      this.viewers.find({ partyId, lastSeen: { $gte: since } }).lean(),
      this.signals
        .find({ partyId, from: 'viewer', seq: { $gt: after } })
        .sort({ seq: 1 })
        .limit(80)
        .lean(),
    ]);
    return {
      viewers: viewers.map((viewer) => viewer.viewerId),
      signals: signals.map(toSignal),
    };
  }

  async hostSignal(partyId: string, userId: string, dto: HostSignalDto) {
    const party = fieldsOf(await this.open(partyId, userId));
    if (!sameId(userId, party.ownerId)) {
      throw new ForbiddenException('Only the host can run the live video');
    }
    await this.requireLive(partyId);
    return this.pushSignal(
      partyId,
      dto.viewerId,
      'host',
      dto.kind,
      dto.payload,
    );
  }

  async viewerSignal(
    partyId: string,
    userId: string | undefined,
    dto: ViewerSignalDto,
  ) {
    await this.open(partyId, userId, dto.key);
    await this.requireLive(partyId);
    return this.pushSignal(
      partyId,
      dto.viewerId,
      'viewer',
      dto.kind,
      dto.payload,
    );
  }

  async comment(
    partyId: string,
    userId: string | undefined,
    dto: LiveCommentDto,
  ) {
    await this.open(partyId, userId, dto.key);
    await this.requireLive(partyId);
    const recent = await this.comments
      .findOne({ partyId, viewerId: dto.viewerId })
      .sort({ createdAt: -1 })
      .lean();
    if (
      recent?.createdAt &&
      Date.now() - new Date(recent.createdAt).getTime() < COMMENT_GAP_MS
    ) {
      throw new BadRequestException('Wait a second before another comment');
    }
    const saved = await this.comments.create({
      partyId,
      viewerId: dto.viewerId,
      name: dto.name || 'Guest',
      text: dto.text,
    });
    return {
      id: String(saved._id),
      name: saved.name,
      text: saved.text,
      createdAt: saved.createdAt,
    };
  }

  async love(partyId: string, userId: string | undefined, dto: ViewerDto) {
    await this.open(partyId, userId, dto.key);
    await this.requireLive(partyId);
    const existing = await this.loves.findOne({
      partyId,
      viewerId: dto.viewerId,
    });
    if (existing) {
      await existing.deleteOne();
    } else {
      await this.loves.create({ partyId, viewerId: dto.viewerId });
    }
    const loves = await this.loves.countDocuments({
      partyId: partyKey(partyId),
    });
    return { loves, loved: !existing };
  }

  private async cardFor(partyId: string): Promise<LiveCard | null> {
    let party: Awaited<ReturnType<PartiesService['findById']>>;
    try {
      party = await this.partiesService.findById(partyId);
    } catch {
      return null;
    }
    if (!party) return null;
    const fields = fieldsOf(party);
    if (fields.status !== StatusType.PUBLISHED || !partyWindow(fields).on) {
      return null;
    }
    const images = party.images;
    const hostName =
      `${party.host?.firstName ?? ''} ${party.host?.lastName ?? ''}`.trim();
    const firstImage =
      Array.isArray(images) && typeof images[0] === 'string' ? images[0] : '';
    return {
      id: partyId,
      title: typeof party.title === 'string' ? party.title : '',
      image: firstImage,
      location: typeof party.location === 'string' ? party.location : '',
      ownerId: fields.ownerId == null ? '' : String(fields.ownerId),
      hostName,
    };
  }

  private async open(partyId: string, userId?: string, key?: string) {
    const party = await this.partiesService.findById(partyId, userId, key);
    if (!party) {
      throw new NotFoundException("That party isn't there");
    }
    return party;
  }

  private assertHostWindow(party: PartyFields, userId: string) {
    if (!sameId(userId, party.ownerId)) {
      throw new ForbiddenException('Only the host can go live');
    }
    if (party.status !== StatusType.PUBLISHED) {
      throw new BadRequestException('Publish the party before going live');
    }
    const window = partyWindow(party);
    if (!window.started) {
      throw new BadRequestException("This party hasn't started yet");
    }
    if (window.ended) {
      throw new BadRequestException('This party is over');
    }
  }

  private async requireLive(partyId: string) {
    const session = await this.sessions
      .findOne({ partyId, active: true })
      .lean();
    if (!(await this.settle(session))) {
      throw new BadRequestException("The host isn't live");
    }
  }

  private hostFresh(seen?: Date) {
    if (!seen) return false;
    return Date.now() - new Date(seen).getTime() <= HOST_STALE_MS;
  }

  private async settle<T extends { partyId?: unknown; active?: boolean; hostSeen?: Date }>(
    session: T | null,
  ) {
    if (!session?.active) return null;
    if (this.hostFresh(session.hostSeen)) return session;
    await this.endSession(String(session.partyId));
    return null;
  }

  private async endSession(partyId: string) {
    const partyObjectId = partyKey(partyId);
    await this.sessions.updateOne(
      { partyId: partyObjectId },
      { active: false },
    );
    await this.signals.deleteMany({ partyId: partyObjectId });
    await this.viewers.deleteMany({ partyId: partyObjectId });
  }

  private async touchViewer(partyId: string, viewerId: string) {
    const since = new Date(Date.now() - STALE_MS);
    const already = await this.viewers.exists({
      partyId,
      viewerId,
      lastSeen: { $gte: since },
    });
    if (!already) {
      const watching = await this.watching(partyId);
      if (watching >= MAX_VIEWERS) return;
    }
    await this.viewers.findOneAndUpdate(
      { partyId, viewerId },
      { lastSeen: new Date() },
      { upsert: true },
    );
  }

  private watching(partyId: string) {
    return this.viewers.countDocuments({
      partyId,
      lastSeen: { $gte: new Date(Date.now() - STALE_MS) },
    });
  }

  private async pushSignal(
    partyId: string,
    viewerId: string,
    from: 'host' | 'viewer',
    kind: 'offer' | 'answer' | 'ice',
    payload: string,
  ) {
    const session = await this.sessions.findOneAndUpdate(
      { partyId, active: true },
      { $inc: { signalSeq: 1 } },
      { new: true },
    );
    if (!session) {
      throw new BadRequestException("The host isn't live");
    }
    const saved = await this.signals.create({
      partyId,
      viewerId,
      from,
      kind,
      payload,
      seq: session.signalSeq,
    });
    return { seq: saved.seq };
  }
}

type LiveCard = {
  id: string;
  title: string;
  image: string;
  location: string;
  ownerId: string;
  hostName: string;
};

const toSignal = (signal: {
  viewerId: string;
  kind: string;
  payload: string;
  seq: number;
}) => ({
  viewerId: signal.viewerId,
  kind: signal.kind,
  payload: signal.payload,
  seq: signal.seq,
});

/** Party is on from its start time until the end time, or the end of the last day. */
const partyWindow = (party: PartyFields) => {
  if (!party.start_date) return { started: false, ended: false, on: false };
  const startsAt = nigeriaDateTime(
    new Date(party.start_date).toISOString(),
    party.start_time || '00:00',
  );
  const endDay = party.end_date ?? party.start_date;
  const endsAt = party.end_time
    ? nigeriaDateTime(new Date(endDay).toISOString(), party.end_time)
    : party.end_date
      ? partyExpiry(party.end_date)
      : new Date(startsAt.getTime() + 86_400_000);
  const now = Date.now();
  const started = now >= startsAt.getTime();
  const ended = now >= endsAt.getTime();
  return { started, ended, on: started && !ended };
};
