import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ChatService } from './chat.service';
import {
  LocationDto,
  MessagesQuery,
  ReportDto,
  SendMessageDto,
  StartChatDto,
} from './dto/chat.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

// passport hands over the user document, so _id can be an ObjectId
const me = (request: AuthenticatedRequest) => String(request.user._id);

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({
    summary:
      "Open a chat from a listing, with its host or someone in its reviews. Gives back the existing chat if there's one",
  })
  start(@Req() request: AuthenticatedRequest, @Body() dto: StartChatDto) {
    return this.chatService.start(me(request), dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'My chats, latest message first' })
  list(@Req() request: AuthenticatedRequest) {
    return this.chatService.list(me(request));
  }

  @Get('unread')
  @ApiOperation({ summary: 'Unread chats and messages, for the badge' })
  unread(@Req() request: AuthenticatedRequest) {
    return this.chatService.unreadCount(me(request));
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'One chat: the other person, listing, blocked...' })
  details(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.chatService.details(id, me(request));
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary:
      'Latest messages, older ones with ?before=<message id>, or poll with ?since=<now from the last call>',
  })
  messages(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: MessagesQuery,
  ) {
    return this.chatService.messages(id, me(request), query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({
    summary: 'Send one of: text, photo (public_id) or location',
  })
  send(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.send(id, me(request), dto);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark the chat as read (shows "Seen" to them)' })
  read(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.chatService.markRead(id, me(request));
  }

  @Patch('messages/:id/location')
  @ApiOperation({ summary: 'Move my live location pin' })
  moveLocation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: LocationDto,
  ) {
    return this.chatService.moveLocation(id, me(request), dto);
  }

  @Delete('messages/:id/location')
  @ApiOperation({ summary: 'Stop sharing my live location' })
  stopLocation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.chatService.stopLocation(id, me(request));
  }

  @Post('photo-signature')
  @ApiOperation({
    summary:
      'Signed params to upload a chat photo straight to Cloudinary, then send its public_id',
  })
  photoSignature(@Req() request: AuthenticatedRequest) {
    return this.chatService.photoSignature(me(request));
  }

  @Get('blocked')
  @ApiOperation({ summary: 'People I blocked' })
  blocked(@Req() request: AuthenticatedRequest) {
    return this.chatService.blocked(me(request));
  }

  @Post('blocked/:userId')
  @ApiOperation({ summary: 'Block someone, neither of you can message' })
  block(@Req() request: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.chatService.block(me(request), userId);
  }

  @Delete('blocked/:userId')
  @ApiOperation({ summary: 'Unblock someone' })
  unblock(
    @Req() request: AuthenticatedRequest,
    @Param('userId') userId: string,
  ) {
    return this.chatService.unblock(me(request), userId);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Report someone from a chat' })
  report(@Req() request: AuthenticatedRequest, @Body() dto: ReportDto) {
    return this.chatService.report(me(request), dto);
  }
}
