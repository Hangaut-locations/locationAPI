import { buildMail } from '../mail/layout';

export const newMessageMail = (
  to: string,
  recipientName: string,
  senderName: string,
  preview: string,
  url: string,
) =>
  buildMail({
    to,
    subject: `${senderName} sent you a message on Hangaut`,
    heading: `Hi ${recipientName}, you have a new message`,
    intro: `${senderName}: ${preview}`,
    link: { label: 'Reply', url },
    outro: "We won't email again for this chat till you've read it.",
  });

export const reportMail = (
  to: string,
  report: {
    reporter: string;
    reported: string;
    reportedId: string;
    reason: string;
    details: string;
    conversationId?: string;
  },
) =>
  buildMail({
    to,
    subject: `Chat report: ${report.reason} (${report.reported})`,
    heading: 'Someone reported a user in chat',
    intro: `${report.reporter} reported ${report.reported}.`,
    rows: [
      { label: 'Reason', value: report.reason },
      { label: 'Details', value: report.details || '-' },
      { label: 'Reported user id', value: report.reportedId },
      ...(report.conversationId
        ? [{ label: 'Chat id', value: report.conversationId }]
        : []),
    ],
  });
