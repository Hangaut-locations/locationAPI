import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
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
import { EmailCodesService } from './email-codes.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { EmailCodeDto, VerifyEmailDto } from './dto/email-code.dto';

type SignedIn = {
  accessToken: string;
  refreshToken?: string;
  user: Partial<User>;
};

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
    private codes: EmailCodesService,
  ) {}

  /** No login until the email is confirmed, the code goes to the email they typed. */
  async register(
    registerDto: RegisterDto,
  ): Promise<{ verification_required: true; email: string }> {
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

    // a signup that never confirmed its code doesn't own the email, so it can be signed up again
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser && existingUser.emailVerified !== false) {
      throw new BadRequestException({
        message: 'User with this email already exists',
        data: { field: 'email' },
      });
    }

    const details = {
      email,
      password: await bcrypt.hash(password, 10),
      firstName,
      lastName,
      bio,
      city,
      country,
      state,
      address,
      emailVerified: false,
    };
    if (existingUser) {
      existingUser.set(details);
      await existingUser.save();
    } else {
      await this.usersService.create(details);
    }

    await this.codes.send(email, 'verify', { name: firstName, quiet: true });
    return { verification_required: true, email };
  }

  async login(loginDto: LoginDto): Promise<SignedIn> {
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

    if (user.emailVerified !== true) {
      await this.codes.send(user.email, 'verify', {
        name: user.firstName,
        quiet: true,
      });
      throw new ForbiddenException({
        message: `Confirm your email first, we sent a code to ${user.email}`,
        data: { verification_required: true, email: user.email },
      });
    }

    return this.signIn(user, remember);
  }

  private async signIn(user: User, remember?: boolean): Promise<SignedIn> {
    const accessToken = this.signToken(user._id, user.email);
    const refreshToken = remember
      ? await this.startSession(user._id)
      : undefined;
    return {
      accessToken,
      ...(refreshToken && { refreshToken }),
      user: this.usersService.toPublicUser(user),
    };
  }

  /** The code from signup (or from logging in unconfirmed), logs them in. */
  async verifyEmail({ email, code, remember }: VerifyEmailDto) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException({
        message: 'That code has expired, ask for a new one',
        data: { field: 'code' },
      });
    }
    await this.codes.check(email, 'verify', code);
    user.emailVerified = true;
    await user.save();
    return this.signIn(user, remember);
  }

  /** Same answer whether or not the email has an account. */
  async resendCode(email: string, purpose: 'verify' | 'reset') {
    const user = await this.usersService.findByEmail(email);
    if (user && (purpose === 'reset' || user.emailVerified !== true)) {
      await this.codes.send(user.email, purpose, { name: user.firstName });
    }
    return {
      message: 'If that email has an account, a new code is on its way',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      await this.codes.send(user.email, 'reset', { name: user.firstName });
    }
    return { message: 'If that email has an account, we sent it a code' };
  }

  /** Lets the reset screen move on to the new password before the code is used up. */
  async checkResetCode({ email, code }: EmailCodeDto) {
    await this.codes.check(email, 'reset', code, { keep: true });
    return { valid: true };
  }

  async resetPassword({ email, code, password }: ResetPasswordDto) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException({
        message: 'That code has expired, ask for a new one',
        data: { field: 'code' },
      });
    }
    await this.codes.check(email, 'reset', code);
    user.password = await bcrypt.hash(password, 10);
    // getting the code proves the email is theirs
    user.emailVerified = true;
    await user.save();
    // log out every remembered device, in case someone else had the old password
    await this.sessionModel.deleteMany({ userId: user._id });
    return { message: 'Password changed, you can log in now' };
  }

  /** Changing the email on the profile only happens after the new one gets a code. */
  async startEmailChange(userId: string, email: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('Please log in again');
    if (email.toLowerCase() === user.email.toLowerCase()) {
      throw new BadRequestException({
        message: "That's already your email",
        data: { field: 'email' },
      });
    }
    const taken = await this.usersService.findByEmail(email);
    if (taken && taken.emailVerified !== false) {
      throw new BadRequestException({
        message: 'User with this email already exists',
        data: { field: 'email' },
      });
    }
    await this.codes.send(email, 'change-email', {
      name: user.firstName,
      userId,
    });
    return { message: `We sent a code to ${email}` };
  }

  async confirmEmailChange(userId: string, { email, code }: EmailCodeDto) {
    await this.codes.check(email, 'change-email', code, { userId });
    const taken = await this.usersService.findByEmail(email);
    if (taken && String(taken._id) !== userId) {
      if (taken.emailVerified !== false) {
        throw new BadRequestException({
          message: 'User with this email already exists',
          data: { field: 'email' },
        });
      }
      // an unconfirmed signup was holding the email, the confirmed owner wins
      await taken.deleteOne();
    }
    const user = await this.usersService.update(userId, {
      email,
      emailVerified: true,
    });
    if (!user) throw new UnauthorizedException('Please log in again');
    return {
      accessToken: this.signToken(user._id, user.email),
      user: this.usersService.toPublicUser(user),
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
    // accounts from before email codes confirm theirs on the next login
    if (!session || !user || user.emailVerified !== true) {
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
  refresh(user: {
    _id: Types.ObjectId | string;
    email: string;
    emailVerified?: boolean;
  }): {
    accessToken: string;
  } {
    if (user.emailVerified !== true) {
      throw new UnauthorizedException('Please log in again');
    }
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
