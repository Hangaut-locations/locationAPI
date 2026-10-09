import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Party, PartySchema } from '../parties/schemas/party.schema';
import { Property, PropertySchema } from '../property/schemas/property.schema';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import {
  ListingComment,
  ListingCommentSchema,
} from './schemas/listing-comment.schema';
import { ListingLike, ListingLikeSchema } from './schemas/listing-like.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ListingLike.name, schema: ListingLikeSchema },
      { name: ListingComment.name, schema: ListingCommentSchema },
      { name: Party.name, schema: PartySchema },
      { name: Property.name, schema: PropertySchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
