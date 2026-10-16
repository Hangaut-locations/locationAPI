import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaModule } from '../media/media.module';
import { Party, PartySchema } from '../parties/schemas/party.schema';
import { Property, PropertySchema } from '../property/schemas/property.schema';
import {
  ListingComment,
  ListingCommentSchema,
} from '../reviews/schemas/listing-comment.schema';
import {
  ListingLike,
  ListingLikeSchema,
} from '../reviews/schemas/listing-like.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatBlock, ChatBlockSchema } from './schemas/chat-block.schema';
import { ChatReport, ChatReportSchema } from './schemas/chat-report.schema';
import {
  Conversation,
  ConversationSchema,
} from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: ChatBlock.name, schema: ChatBlockSchema },
      { name: ChatReport.name, schema: ChatReportSchema },
      { name: Party.name, schema: PartySchema },
      { name: Property.name, schema: PropertySchema },
      { name: ListingLike.name, schema: ListingLikeSchema },
      { name: ListingComment.name, schema: ListingCommentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MediaModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
