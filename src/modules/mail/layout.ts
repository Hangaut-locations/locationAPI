import { Mail, MailAttachment } from './mail.service';

export interface MailImage {
  id: string;
  filename: string;
  content: string;
}

export interface MailContent {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  rows?: { label: string; value: string }[];
  codes?: { name: string; code: string; qrId?: string }[];
  images?: MailImage[];
  outro?: string;
  link?: { label: string; url: string };
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ] ?? char,
  );

const paragraph = (text: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#374151">${escape(text)}</p>`;

export const buildMail = (content: MailContent): Mail => {
  const rows = (content.rows ?? [])
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;vertical-align:top;white-space:nowrap">${escape(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;white-space:pre-line">${escape(value)}</td></tr>`,
    )
    .join('');
  const codes = (content.codes ?? [])
    .map(({ name, code, qrId }) => {
      const qr = qrId
        ? `<img src="cid:${escape(qrId)}" width="140" height="140" alt="QR code for ${escape(name)}" style="display:block;margin:0 0 8px;background:#ffffff"/>`
        : '';
      return `<div style="margin:0 0 10px;padding:14px 16px;border:1px dashed #a855f7;border-radius:12px;background:#faf5ff">${qr}<div style="font-size:13px;color:#6b7280">${escape(name)}</div><div style="font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:3px;color:#581c87">${escape(code)}</div></div>`;
    })
    .join('');
  const attachments: MailAttachment[] = (content.images ?? []).map((image) => ({
    filename: image.filename,
    content: image.content,
    content_id: image.id,
  }));

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:28px;background:#ffffff;border-radius:16px">
<div style="font-size:20px;font-weight:bold;color:#581c87;margin-bottom:20px">Hangaut</div>
<h1 style="margin:0 0 12px;font-size:22px;color:#111827">${escape(content.heading)}</h1>
${paragraph(content.intro)}
${codes}
${rows ? `<table style="margin:8px 0 16px;border-collapse:collapse">${rows}</table>` : ''}
${content.outro ? paragraph(content.outro) : ''}
${content.link ? `<a href="${escape(content.link.url)}" style="display:inline-block;padding:12px 22px;background:#a855f7;color:#ffffff;border-radius:999px;text-decoration:none;font-weight:bold;font-size:14px">${escape(content.link.label)}</a>` : ''}
</div></body></html>`;

  const text = [
    content.heading,
    '',
    content.intro,
    ...(content.codes ?? []).map(({ name, code }) => `${name}: ${code}`),
    '',
    ...(content.rows ?? []).map(({ label, value }) => `${label}: ${value}`),
    ...(content.outro ? ['', content.outro] : []),
    ...(content.link ? ['', `${content.link.label}: ${content.link.url}`] : []),
  ].join('\n');

  return {
    to: content.to,
    subject: content.subject,
    html,
    text,
    ...(attachments.length ? { attachments } : {}),
  };
};
