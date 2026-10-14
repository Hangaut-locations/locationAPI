import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { codeMail } from './auth-mails';
import { CodePurpose, EmailCode } from './schemas/email-code.schema';

const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_TRIES = 5;

@Injectable()
export class EmailCodesService {
  constructor(
    @InjectModel(EmailCode.name) private codeModel: Model<EmailCode>,
    private mailService: MailService,
    private configService: ConfigService,
  ) {}

  private hash(email: string, purpose: CodePurpose, code: string) {
    return createHmac(
      'sha256',
      this.configService.get<string>('JWT_SECRET') ?? '',
    )
      .update(`${purpose}:${email}:${code}`)
      .digest('hex');
  }

  /**
   * Emails a fresh 6 digit code. Asking again within a minute is refused,
   * unless `quiet`, then the code sent a moment ago just stays the live one.
   */
  async send(
    rawEmail: string,
    purpose: CodePurpose,
    options: { name?: string; userId?: string; quiet?: boolean } = {},
  ) {
    const email = rawEmail.trim().toLowerCase();
    const last = await this.codeModel.findOne({ email, purpose }).lean();
    const waited = last
      ? (Date.now() - last.sentAt.getTime()) / 1000
      : Infinity;
    if (
      waited < RESEND_SECONDS &&
      last &&
      last.expiresAt.getTime() > Date.now()
    ) {
      if (options.quiet) return;
      throw new HttpException(
        {
          message: `Wait ${Math.ceil(RESEND_SECONDS - waited)} seconds before asking for another code`,
          data: { retry_in: Math.ceil(RESEND_SECONDS - waited) },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const now = new Date();
    await this.codeModel.updateOne(
      { email, purpose },
      {
        $set: {
          codeHash: this.hash(email, purpose, code),
          attempts: 0,
          sentAt: now,
          expiresAt: new Date(now.getTime() + CODE_MINUTES * 60 * 1000),
          userId: options.userId,
        },
      },
      { upsert: true },
    );
    await this.mailService.send(
      codeMail(rawEmail.trim(), purpose, code, options.name),
    );
  }

  /** Throws when the code is wrong or old. `keep` checks it without using it up. */
  async check(
    rawEmail: string,
    purpose: CodePurpose,
    code: string,
    options: { userId?: string; keep?: boolean } = {},
  ) {
    const email = rawEmail.trim().toLowerCase();
    const saved = await this.codeModel.findOne({ email, purpose });
    if (
      !saved ||
      saved.expiresAt.getTime() <= Date.now() ||
      (options.userId && saved.userId !== options.userId)
    ) {
      throw new BadRequestException({
        message: 'That code has expired, ask for a new one',
        data: { field: 'code' },
      });
    }
    if (saved.attempts >= MAX_TRIES) {
      throw new BadRequestException({
        message: 'Too many wrong tries, ask for a new code',
        data: { field: 'code' },
      });
    }

    const given = Buffer.from(this.hash(email, purpose, code.trim()));
    const stored = Buffer.from(saved.codeHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      saved.attempts += 1;
      await saved.save();
      const left = MAX_TRIES - saved.attempts;
      throw new BadRequestException({
        message: left
          ? `That code isn't right, ${left} ${left === 1 ? 'try' : 'tries'} left`
          : 'Too many wrong tries, ask for a new code',
        data: { field: 'code' },
      });
    }

    if (!options.keep) await saved.deleteOne();
  }
}
