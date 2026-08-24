import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

interface AuthenticatedRequest extends Request {
  user: {
    _id: string;
  };
}

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  async getProfile(@Req() request: AuthenticatedRequest) {
    const user = await this.usersService.findById(request.user._id);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.usersService.toPublicUser(user);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const user = await this.usersService.update(
      request.user._id,
      updateProfileDto,
    );
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.usersService.toPublicUser(user);
  }

  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete the authenticated user profile' })
  async deleteProfile(@Req() request: AuthenticatedRequest) {
    const user = await this.usersService.delete(request.user._id);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
  }
}
