import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(
    registerDto: RegisterDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const {
      email,
      password,
      firstName,
      lastName,
      address,
      city,
      country,
      state,
      bio,
    } = registerDto;

    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new BadRequestException({
        message: 'User with this email already exists',
        data: { field: 'email' },
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      bio,
      city,
      country,
      state,
      address,
    });

    // Generate JWT token
    const accessToken = this.jwtService.sign(
      {
        sub: newUser._id,
        email: newUser.email,
      },
      { expiresIn: '24h' },
    );

    // Return token and user info (without password)
    const { password: _, ...userWithoutPassword } = newUser.toObject();
    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT token
    const accessToken = this.jwtService.sign(
      {
        sub: user._id,
        email: user.email,
      },
      { expiresIn: '24h' },
    );

    // Return token and user info (without password)
    const { password: _, ...userWithoutPassword } = user.toObject();
    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  async validateUser(userId: string): Promise<Partial<User> | null> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      return null;
    }
    const { password: _, ...userWithoutPassword } = user.toObject();
    return userWithoutPassword;
  }
}
