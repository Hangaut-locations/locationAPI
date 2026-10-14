import { buildMail } from '../mail/layout';
import type { CodePurpose } from './schemas/email-code.schema';

const WORDING: Record<
  CodePurpose,
  { subject: string; heading: string; intro: string }
> = {
  verify: {
    subject: 'Your Hangaut code',
    heading: 'Confirm your email',
    intro: 'Enter this code on Hangaut to confirm this is your email.',
  },
  reset: {
    subject: 'Reset your Hangaut password',
    heading: 'Reset your password',
    intro: 'Enter this code on Hangaut to set a new password.',
  },
  'change-email': {
    subject: 'Confirm your new Hangaut email',
    heading: 'Confirm your new email',
    intro:
      'Enter this code on your Hangaut profile to switch your account to this email.',
  },
};

export const codeMail = (
  to: string,
  purpose: CodePurpose,
  code: string,
  name?: string,
) => {
  const wording = WORDING[purpose];
  return buildMail({
    to,
    subject: wording.subject,
    heading: name
      ? `Hi ${name}, ${wording.heading.toLowerCase()}`
      : wording.heading,
    intro: wording.intro,
    codes: [{ name: 'Your code', code }],
    outro:
      "The code works for 10 minutes. If you didn't ask for it, you can ignore this email.",
  });
};
