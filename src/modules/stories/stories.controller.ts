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

@ApiTags('stories')
@Controller('stories')
export class StoriesController {
  constructor(private stories: StoriesService) {}

  @Post('upload-signature')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Sign a photo or video for a 24 hour story' })
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
    summary: 'Everyone with a story that is still inside 24 hours',
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
  @ApiOperation({ summary: 'A public comment on a story' })
  comment(@Param('id') id: string, @Body() dto: StoryCommentDto) {
    return this.stories.comment(id, dto);
  }

  @Post(':id/love')
  @ApiOperation({ summary: 'Toggle a public love on a story' })
  love(@Param('id') id: string, @Body() dto: StoryViewerDto) {
    return this.stories.love(id, dto.viewerId);
  }
}
