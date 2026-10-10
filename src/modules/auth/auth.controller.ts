import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiResponse,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterDto } from './dto/register.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; email: string };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // @Get('me')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({ summary: 'Logged in user profile' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Logged in user session fetched successfully',
  //   schema: {
  //     example: {
  //       firstName: 'John',
  //       lastName: 'Doe',
  //       email: 'Johndoe@mail.com',
  //       address: 'address',
  //       bio: 'About myself',
  //     },
  //   },
  // })
  //
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '123456',
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or user already exists',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        data: [
          {
            field: 'email',
            messages: ['email must be an email'],
          },
        ],
      },
    },
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: '123456',
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input',
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        data: [
          {
            field: 'password',
            messages: ['password must be longer than or equal to 6 characters'],
          },
        ],
      },
    },
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Swap a still valid token for a fresh 24h one' })
  @ApiResponse({
    status: 200,
    description: 'New token',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
    },
  })
  @ApiResponse({ status: 401, description: 'Token missing or expired' })
  refresh(@Req() request: AuthenticatedRequest) {
    return this.authService.refresh(request.user);
  }

  @Post('session/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remember me: get a fresh 24h token with the refreshToken from login (works after the old token expired)',
  })
  @ApiResponse({
    status: 200,
    description: 'New token, and the remember me login is pushed back 30 days',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'refreshToken unknown, expired or logged out',
  })
  refreshSession(@Body() body: RefreshSessionDto) {
    return this.authService.refreshSession(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remember me: end the login for this device' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(@Body() body: RefreshSessionDto) {
    await this.authService.logout(body.refreshToken);
  }
}
