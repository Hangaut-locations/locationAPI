import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  /** Never throws, a failed email shouldn't break the booking that sent it. */
  async send(mail: Mail) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.log(`No RESEND_API_KEY, skipped "${mail.subject}"`);
      return;
    }
    try {
      const response = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.configService.get<string>('MAIL_FROM'),
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      });
      if (!response.ok) {
        this.logger.error(
          `Resend said ${response.status} for "${mail.subject}": ${await response.text()}`,
        );
      }
    } catch (error) {
      this.logger.error(`Couldn't send "${mail.subject}"`, error);
    }
  }

  async sendAll(mails: Mail[]) {
    await Promise.all(mails.map((mail) => this.send(mail)));
  }
}
