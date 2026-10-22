import {
  Body,
  Controller,
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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import {
  HostSignalDto,
  LiveCommentDto,
  ViewerDto,
  ViewerSignalDto,
} from './dto/live.dto';
import { LiveService } from './live.service';

interface AuthenticatedRequest extends Request {
  user?: { _id: string };
}

const me = (request: AuthenticatedRequest) =>
  request.user?._id ? String(request.user._id) : undefined;

const afterSeq = (value?: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

@ApiTags('live')
@Controller('parties/:partyId/live')
export class LiveController {
  constructor(private liveService: LiveService) {}

  @Post('start')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Host starts the party camera. Only after the party start time, and only on a published party',
  })
  start(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
  ) {
    return this.liveService.start(partyId, me(request) ?? '');
  }

  @Post('stop')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Host stops the party camera' })
  stop(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
  ) {
    return this.liveService.stop(partyId, me(request) ?? '');
  }

  @Get('host')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Viewers waiting on the host, and their answers' })
  hostFeed(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Query('after') after?: string,
  ) {
    return this.liveService.hostFeed(
      partyId,
      me(request) ?? '',
      afterSeq(after),
    );
  }

  @Post('host-signal')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Host sends a camera offer or network candidate to one viewer',
  })
  hostSignal(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Body() dto: HostSignalDto,
  ) {
    return this.liveService.hostSignal(partyId, me(request) ?? '', dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Is the party live, plus comments, loves, and camera signals. No login needed to watch',
  })
  state(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Query('viewer') viewer?: string,
    @Query('after') after?: string,
    @Query('key') key?: string,
  ) {
    const viewerId =
      viewer && /^[a-zA-Z0-9_-]{8,40}$/.test(viewer) ? viewer : undefined;
    return this.liveService.state(
      partyId,
      me(request),
      viewerId,
      afterSeq(after),
      key,
    );
  }

  @Post('signal')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'A viewer answers the host camera. No login needed',
  })
  viewerSignal(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Body() dto: ViewerSignalDto,
  ) {
    return this.liveService.viewerSignal(partyId, me(request), dto);
  }

  @Post('comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Comment on the live video. No login needed' })
  comment(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Body() dto: LiveCommentDto,
  ) {
    return this.liveService.comment(partyId, me(request), dto);
  }

  @Post('love')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Leave or take back a love on the live video. No login needed',
  })
  love(
    @Req() request: AuthenticatedRequest,
    @Param('partyId') partyId: string,
    @Body() dto: ViewerDto,
  ) {
    return this.liveService.love(partyId, me(request), dto);
  }
}

@ApiTags('live')
@Controller('live')
export class LiveListController {
  constructor(private liveService: LiveService) {}

  @Get('parties')
  @ApiOperation({
    summary:
      'Parties whose host currently has the camera on. No login needed',
  })
  list() {
    return this.liveService.listOnAir();
  }
}
