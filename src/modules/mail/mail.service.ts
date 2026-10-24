import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailAttachment {
  filename: string;
  content: string;
  content_id: string;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
}

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    if (this.configService.get<string>('RESEND_API_KEY')) {
      this.logger.log(
        `Emails on, sending from ${this.configService.get<string>('MAIL_FROM')}`,
      );
    } else {
      this.logger.warn('Emails off, RESEND_API_KEY is not set');
    }
  }

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
          ...(mail.attachments?.length
            ? { attachments: mail.attachments }
            : {}),
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

  /** Whether emails can go out, without showing the key. */
  async status() {
    const from = this.configService.get<string>('MAIL_FROM') ?? '';
    const fromDomain = from.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? '';
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      return {
        emails_on: false,
        key_set: false,
        from,
        problem: 'RESEND_API_KEY is not set on this server',
      };
    }

    try {
      const response = await fetch(RESEND_DOMAINS_URL, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await response.json().catch(() => ({}))) as {
        name?: string;
        message?: string;
        data?: { name: string; status: string }[];
      };
      // Sending-only keys can't list domains, that still means the key works.
      if (body.name === 'restricted_api_key') {
        return {
          emails_on: true,
          key_set: true,
          from,
          key: 'works (sending only)',
        };
      }
      if (!response.ok) {
        return {
          emails_on: false,
          key_set: true,
          from,
          problem: `Resend rejected the key (${response.status}): ${body.message ?? 'no reason given'}`,
        };
      }
      const domains = (body.data ?? []).map(({ name, status }) => ({
        name,
        status,
      }));
      const fromDomainStatus = domains.find(
        (domain) => domain.name.toLowerCase() === fromDomain,
      )?.status;
      return {
        emails_on: fromDomainStatus === 'verified',
        key_set: true,
        from,
        key: 'works (full access)',
        domains,
        ...(fromDomainStatus === 'verified'
          ? {}
          : {
              problem: fromDomainStatus
                ? `${fromDomain} is ${fromDomainStatus} in this Resend account`
                : `${fromDomain} isn't in the Resend account this key belongs to`,
            }),
      };
    } catch (error) {
      return {
        emails_on: false,
        key_set: true,
        from,
        problem: `Couldn't reach Resend: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
