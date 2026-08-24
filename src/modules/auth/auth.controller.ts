import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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
}
