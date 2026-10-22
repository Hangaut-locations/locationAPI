import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ProfilePhotoDto } from './dto/profile-photo.dto';
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
    const { email, ...changes } = updateProfileDto;
    const current = await this.usersService.findById(request.user._id);
    if (!current) {
      throw new NotFoundException('User profile not found');
    }
    if (email && email.trim().toLowerCase() !== current.email.toLowerCase()) {
      throw new BadRequestException({
        message:
          'To change your email, confirm the code we send to the new address',
        data: { field: 'email' },
      });
    }

    const user = await this.usersService.update(request.user._id, changes);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return this.usersService.toPublicUser(user);
  }

  @Post('profile/photo-signature')
  @ApiOperation({
    summary: 'Sign a profile photo so the browser can send it to Cloudinary',
  })
  signPhoto(@Req() request: AuthenticatedRequest) {
    return this.usersService.signPhoto(request.user._id);
  }

  @Post('profile/photo')
  @ApiOperation({
    summary: 'Save the profile photo. The name letters stay until this is set',
  })
  async savePhoto(
    @Req() request: AuthenticatedRequest,
    @Body() body: ProfilePhotoDto,
  ) {
    const user = await this.usersService.setPhoto(
      request.user._id,
      body.publicId,
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
