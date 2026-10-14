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
import { ResetPasswordDto } from './dto/reset-password.dto';
import {
  EmailCodeDto,
  EmailDto,
  ResendCodeDto,
  VerifyEmailDto,
} from './dto/email-code.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string; email: string; emailVerified?: boolean };
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
  @ApiOperation({
    summary:
      'User registration, emails a 6 digit code. Send it to /auth/verify-email to log in',
  })
  @ApiResponse({
    status: 201,
    description: 'Account made, waiting for the email code',
    schema: {
      example: { verification_required: true, email: 'user@example.com' },
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
    status: 403,
    description:
      'Right password but the email is not confirmed yet, a code was emailed',
    schema: {
      example: {
        message: 'Confirm your email first, we sent a code to user@example.com',
        data: { verification_required: true, email: 'user@example.com' },
      },
    },
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

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm the email with the code, logs in (same answer as login)',
  })
  @ApiResponse({
    status: 400,
    description: 'Code wrong, expired or too many tries',
  })
  verifyEmail(@Body() body: VerifyEmailDto) {
    return this.authService.verifyEmail(body);
  }

  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email a new code (verify or reset), once a minute',
  })
  @ApiResponse({ status: 429, description: 'Asked again too soon' })
  resendCode(@Body() body: ResendCodeDto) {
    return this.authService.resendCode(body.email, body.purpose);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email a code for setting a new password' })
  forgotPassword(@Body() body: EmailDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check the reset code before asking for the new password',
  })
  checkResetCode(@Body() body: EmailCodeDto) {
    return this.authService.checkResetCode(body);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with the code, logs out remembered devices',
  })
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
  }

  @Post('change-email')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Email a code to the new address before switching' })
  startEmailChange(
    @Req() request: AuthenticatedRequest,
    @Body() body: EmailDto,
  ) {
    return this.authService.startEmailChange(
      String(request.user._id),
      body.email,
    );
  }

  @Post('change-email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Switch to the new email with its code, returns a new token',
  })
  confirmEmailChange(
    @Req() request: AuthenticatedRequest,
    @Body() body: EmailCodeDto,
  ) {
    return this.authService.confirmEmailChange(String(request.user._id), body);
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
