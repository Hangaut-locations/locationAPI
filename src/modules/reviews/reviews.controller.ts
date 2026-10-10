import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import {
  CreateCommentDto,
  LikeListingDto,
  ReplyDto,
  ThreadReplyDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';
import { ListingType } from './schemas/listing-type';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

const typePipe = new ParseEnumPipe(ListingType);
const typeParam = { name: 'type', enum: Object.values(ListingType) };

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Get(':type/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiParam(typeParam)
  @ApiOperation({
    summary:
      'Likes (with who liked) and comments on a party or property. Private listings need ?key',
  })
  getReviews(
    @Req() request: Partial<AuthenticatedRequest>,
    @Param('type', typePipe) type: ListingType,
    @Param('id') listingId: string,
    @Query('key') key?: string,
  ) {
    return this.reviewsService.getReviews(
      type,
      listingId,
      request.user?._id,
      key,
    );
  }

  @Post(':type/:id/like')
  @UseGuards(AuthGuard('jwt'))
  @ApiParam(typeParam)
  @ApiOperation({ summary: 'Thumbs up a listing, or take it back' })
  toggleLike(
    @Req() request: AuthenticatedRequest,
    @Param('type', typePipe) type: ListingType,
    @Param('id') listingId: string,
    @Body() { key }: LikeListingDto,
  ) {
    return this.reviewsService.toggleLike(
      type,
      listingId,
      request.user._id,
      key,
    );
  }

  @Post(':type/:id/comments')
  @UseGuards(AuthGuard('jwt'))
  @ApiParam(typeParam)
  @ApiOperation({ summary: 'Comment on a listing' })
  addComment(
    @Req() request: AuthenticatedRequest,
    @Param('type', typePipe) type: ListingType,
    @Param('id') listingId: string,
    @Body() { comment, key }: CreateCommentDto,
  ) {
    return this.reviewsService.addComment(
      type,
      listingId,
      request.user._id,
      comment,
      key,
    );
  }

  @Delete('comments/:commentId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete my own comment' })
  deleteComment(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
  ) {
    return this.reviewsService.deleteComment(commentId, request.user._id);
  }

  @Post('comments/:commentId/replies')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Reply under a review. Host of the listing any time, the reviewer once the host has replied',
  })
  addThreadReply(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
    @Body() { text }: ThreadReplyDto,
  ) {
    return this.reviewsService.addThreadReply(
      commentId,
      request.user._id,
      text,
    );
  }

  @Patch('comments/:commentId/replies/:replyId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Edit my reply under a review' })
  editThreadReply(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
    @Param('replyId') replyId: string,
    @Body() { text }: ThreadReplyDto,
  ) {
    return this.reviewsService.editThreadReply(
      commentId,
      replyId,
      request.user._id,
      text,
    );
  }

  @Delete('comments/:commentId/replies/:replyId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Delete my reply under a review' })
  deleteThreadReply(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
    @Param('replyId') replyId: string,
  ) {
    return this.reviewsService.deleteThreadReply(
      commentId,
      replyId,
      request.user._id,
    );
  }

  @Put('comments/:commentId/reply')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Host only: reply to a review on your listing (sending again edits it)',
  })
  setReply(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
    @Body() { reply }: ReplyDto,
  ) {
    return this.reviewsService.setReply(commentId, request.user._id, reply);
  }

  @Delete('comments/:commentId/reply')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Host only: remove your reply' })
  deleteReply(
    @Req() request: AuthenticatedRequest,
    @Param('commentId') commentId: string,
  ) {
    return this.reviewsService.deleteReply(commentId, request.user._id);
  }
}
