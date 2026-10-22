import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  CreateStoryDto,
  StoryCommentDto,
  StoryUploadDto,
  StoryViewerDto,
} from './dto/story.dto';
import { StoriesService } from './stories.service';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

interface MaybeUserRequest extends Request {
  user?: { _id: string };
}

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private stories: StoriesService) {}

  @Post('upload-signature')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Sign a photo or video for a 7 day story' })
  sign(
    @Req() request: AuthenticatedRequest,
    @Body() dto: StoryUploadDto,
  ) {
    return this.stories.sign(String(request.user._id), dto.kind);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Save a story after the file is on Cloudinary' })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateStoryDto,
  ) {
    return this.stories.create(String(request.user._id), dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Everyone with a story that is still inside 7 days',
  })
  list(@Query('viewerId') viewerId?: string) {
    const safe = viewerId && /^[a-zA-Z0-9_-]{8,40}$/.test(viewerId)
      ? viewerId
      : undefined;
    return this.stories.list(safe);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Take your own story down' })
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.stories.remove(String(request.user._id), id);
  }

  @Post(':id/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'A comment on a story. A signed-in name comes from the account.' })
  comment(
    @Req() request: MaybeUserRequest,
    @Param('id') id: string,
    @Body() dto: StoryCommentDto,
  ) {
    const userId = request.user?._id ? String(request.user._id) : undefined;
    return this.stories.comment(id, dto, userId);
  }

  @Post(':id/love')
  @ApiOperation({ summary: 'Toggle a public love on a story' })
  love(@Param('id') id: string, @Body() dto: StoryViewerDto) {
    return this.stories.love(id, dto.viewerId);
  }
}
