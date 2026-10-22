import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MediaService } from '../media/media.service';
import { User } from '../users/schemas/user.schema';
import { CreateStoryDto, StoryCommentDto } from './dto/story.dto';
import { Story, StoryComment, StoryLove } from './schemas/story.schema';

const STORY_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 10;
const COMMENT_GAP_MS = 5_000;
const COMMENTS_SHOWN = 40;

type StoryRow = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: 'photo' | 'video';
  url: string;
  poster?: string;
  expiresAt: Date;
  createdAt: Date;
};

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name) private stories: Model<Story>,
    @InjectModel(StoryComment.name) private comments: Model<StoryComment>,
    @InjectModel(StoryLove.name) private loves: Model<StoryLove>,
    @InjectModel(User.name) private users: Model<User>,
    private media: MediaService,
  ) {}

  sign(userId: string, kind: 'photo' | 'video') {
    return this.media.signStory(userId, kind);
  }

  async create(userId: string, dto: CreateStoryDto) {
    await this.sweep();
    const active = await this.stories.countDocuments({
      userId: new Types.ObjectId(userId),
      expiresAt: { $gt: new Date() },
    });
    if (active >= MAX_ITEMS) {
      throw new BadRequestException('You can have 10 story items at a time');
    }

    const media =
      dto.kind === 'video'
        ? await this.video(dto.publicId, userId)
        : {
            ...(await this.media.findStoryPhoto(dto.publicId, userId)),
            poster: undefined,
          };
    const saved = await this.stories.create({
      userId: new Types.ObjectId(userId),
      kind: dto.kind,
      publicId: media.publicId,
      url: media.url,
      poster: media.poster,
      expiresAt: new Date(Date.now() + STORY_MS),
    });
    return { id: String(saved._id) };
  }

  async list(viewerId?: string) {
    await this.sweep();
    const rows = await this.stories
      .find({ expiresAt: { $gt: new Date() } })
      .sort({ createdAt: 1 })
      .lean<StoryRow[]>();
    if (!rows.length) return { people: [] };

    const ids = rows.map((row) => row._id);
    const userIds = [...new Set(rows.map((row) => String(row.userId)))];
    const [users, comments, loveCounts, mine] = await Promise.all([
      this.users
        .find({ _id: { $in: userIds } })
        .select('firstName lastName')
        .lean(),
      this.comments
        .find({ storyId: { $in: ids } })
        .sort({ createdAt: 1 })
        .lean(),
      this.loves.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { storyId: { $in: ids } } },
        { $group: { _id: '$storyId', n: { $sum: 1 } } },
      ]),
      viewerId
        ? this.loves.find({ storyId: { $in: ids }, viewerId }).lean()
        : Promise.resolve([]),
    ]);

    const names = new Map(
      users.map((user) => [
        String(user._id),
        { firstName: user.firstName, lastName: user.lastName },
      ]),
    );
    const byStory = new Map<string, StoryRow[]>();
    for (const row of rows) {
      const key = String(row.userId);
      byStory.set(key, [...(byStory.get(key) ?? []), row]);
    }
    const commentMap = new Map<string, typeof comments>();
    for (const comment of comments) {
      const key = String(comment.storyId);
      const list = commentMap.get(key) ?? [];
      if (list.length < COMMENTS_SHOWN) list.push(comment);
      commentMap.set(key, list);
    }
    const loveMap = new Map(loveCounts.map((row) => [String(row._id), row.n]));
    const loved = new Set(mine.map((row) => String(row.storyId)));

    const people = [...byStory.entries()]
      .map(([userId, items]) => ({
        userId,
        firstName: names.get(userId)?.firstName ?? '',
        lastName: names.get(userId)?.lastName ?? '',
        items: items.map((item) => ({
          id: String(item._id),
          kind: item.kind,
          url: item.url,
          poster: item.poster,
          createdAt: item.createdAt,
          loves: loveMap.get(String(item._id)) ?? 0,
          loved: loved.has(String(item._id)),
          comments: (commentMap.get(String(item._id)) ?? []).map((comment) => ({
            id: String(comment._id),
            name: comment.name,
            location: comment.location || undefined,
            text: comment.text,
            createdAt: comment.createdAt,
          })),
        })),
      }))
      .sort(
        (a, b) =>
          new Date(b.items[b.items.length - 1].createdAt).getTime() -
          new Date(a.items[a.items.length - 1].createdAt).getTime(),
      );

    return { people };
  }

  async remove(userId: string, storyId: string) {
    const story = await this.owned(userId, storyId);
    await this.stories.deleteOne({ _id: story._id });
    await this.comments.deleteMany({ storyId: story._id });
    await this.loves.deleteMany({ storyId: story._id });
    return { ok: true };
  }

  async comment(storyId: string, dto: StoryCommentDto, userId?: string) {
    const story = await this.open(storyId);
    const recent = await this.comments
      .findOne({ storyId: story._id, viewerId: dto.viewerId })
      .sort({ createdAt: -1 })
      .lean();
    if (
      recent?.createdAt &&
      Date.now() - new Date(recent.createdAt).getTime() < COMMENT_GAP_MS
    ) {
      throw new BadRequestException('Wait a second before another comment');
    }
    let name = (dto.name || 'Guest').slice(0, 24);
    if (userId) {
      const user = await this.users.findById(userId).select('firstName lastName').lean();
      const account = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
      if (account) name = account.slice(0, 48);
    }
    const location = dto.location?.slice(0, 40) || undefined;
    const saved = await this.comments.create({
      storyId: story._id,
      viewerId: dto.viewerId,
      name,
      location,
      text: dto.text,
      expiresAt: story.expiresAt,
    });
    return {
      id: String(saved._id),
      name: saved.name,
      location: saved.location || undefined,
      text: saved.text,
      createdAt: saved.createdAt,
    };
  }

  async love(storyId: string, viewerId: string) {
    const story = await this.open(storyId);
    const existing = await this.loves.findOne({
      storyId: story._id,
      viewerId,
    });
    if (existing) {
      await existing.deleteOne();
    } else {
      try {
        await this.loves.create({
          storyId: story._id,
          viewerId,
          expiresAt: story.expiresAt,
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }
    const loves = await this.loves.countDocuments({ storyId: story._id });
    return { loved: !existing, loves };
  }

  private async video(publicId: string, userId: string) {
    const video = await this.media.findVideo(publicId, userId);
    if (!video.public_id.startsWith('hangaut/stories/')) {
      throw new BadRequestException(
        "We couldn't find that video, upload it again",
      );
    }
    return {
      publicId: video.public_id,
      url: video.url,
      poster: video.poster,
    };
  }

  private async open(storyId: string) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Story not found');
    }
    const story = await this.stories.findOne({
      _id: storyId,
      expiresAt: { $gt: new Date() },
    });
    if (!story) throw new NotFoundException('That story has ended');
    return story;
  }

  private async owned(userId: string, storyId: string) {
    const story = await this.open(storyId);
    if (String(story.userId) !== userId) {
      throw new NotFoundException('Story not found');
    }
    return story;
  }

  /** Mongo's timer can lag, so a visit also deletes anything past 7 days. */
  private async sweep() {
    const gone = await this.stories
      .find({ expiresAt: { $lte: new Date() } })
      .select('_id')
      .lean();
    if (!gone.length) return;
    const ids = gone.map((row) => row._id);
    await this.stories.deleteMany({ _id: { $in: ids } });
    await this.comments.deleteMany({ storyId: { $in: ids } });
    await this.loves.deleteMany({ storyId: { $in: ids } });
  }
}
