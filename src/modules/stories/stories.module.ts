import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaModule } from '../media/media.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  Story,
  StoryComment,
  StoryCommentSchema,
  StoryLove,
  StoryLoveSchema,
  StorySchema,
} from './schemas/story.schema';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';

@Module({
  imports: [
    MediaModule,
    MongooseModule.forFeature([
      { name: Story.name, schema: StorySchema },
      { name: StoryComment.name, schema: StoryCommentSchema },
      { name: StoryLove.name, schema: StoryLoveSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
