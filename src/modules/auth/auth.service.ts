import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/schemas/user.schema';
import { AuthSession } from './schemas/auth-session.schema';

const REMEMBER_DAYS = 30;

const hashSecret = (secret: string) =>
  createHash('sha256').update(secret).digest('hex');

const rememberUntil = () =>
  new Date(Date.now() + REMEMBER_DAYS * 24 * 60 * 60 * 1000);

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectModel(AuthSession.name)
    private sessionModel: Model<AuthSession>,
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
    const accessToken = this.signToken(newUser._id, newUser.email);

    // Return token and user info (without password)
    const { password: _, ...userWithoutPassword } = newUser.toObject();
    return {
      accessToken,
      user: userWithoutPassword,
    };
  }

  async login(loginDto: LoginDto): Promise<{
    accessToken: string;
    refreshToken?: string;
    user: Partial<User>;
  }> {
    const { email, password, remember } = loginDto;

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
    const accessToken = this.signToken(user._id, user.email);
    const refreshToken = remember
      ? await this.startSession(user._id)
      : undefined;

    // Return token and user info (without password)
    const { password: _, ...userWithoutPassword } = user.toObject();
    return {
      accessToken,
      ...(refreshToken && { refreshToken }),
      user: userWithoutPassword,
    };
  }

  // remember me: token is "<sessionId>.<secret>", 30 days, pushed back every time it's used
  private async startSession(userId: Types.ObjectId): Promise<string> {
    const secret = randomBytes(32).toString('base64url');
    const session = await this.sessionModel.create({
      userId,
      tokenHash: hashSecret(secret),
      expiresAt: rememberUntil(),
    });
    return `${session.id}.${secret}`;
  }

  private async findSession(refreshToken: string) {
    const [id, secret] = refreshToken.split('.');
    if (!id || !secret || !Types.ObjectId.isValid(id)) return null;
    const session = await this.sessionModel.findById(id);
    if (!session || session.expiresAt.getTime() <= Date.now()) return null;
    const given = Buffer.from(hashSecret(secret));
    const stored = Buffer.from(session.tokenHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored))
      return null;
    return session;
  }

  async refreshSession(refreshToken: string): Promise<{ accessToken: string }> {
    const session = await this.findSession(refreshToken);
    const user = session
      ? await this.usersService.findById(String(session.userId))
      : null;
    if (!session || !user) {
      throw new UnauthorizedException('Please log in again');
    }
    session.expiresAt = rememberUntil();
    await session.save();
    return { accessToken: this.signToken(user._id, user.email) };
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.findSession(refreshToken);
    if (session) await session.deleteOne();
  }

  // new 24h token for someone whose token is still valid, so active users stay logged in
  refresh(user: { _id: Types.ObjectId | string; email: string }): {
    accessToken: string;
  } {
    return { accessToken: this.signToken(user._id, user.email) };
  }

  private signToken(id: Types.ObjectId | string, email: string): string {
    return this.jwtService.sign(
      { sub: String(id), email },
      { expiresIn: '24h' },
    );
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
