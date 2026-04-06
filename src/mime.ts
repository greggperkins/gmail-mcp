import type { ParsedMessage } from './types.js';

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`;
}

function buildRawMime(headers: Record<string, string>, body: string): string {
  const headerStr = Object.entries(headers)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');
  const mime = `${headerStr}\r\n\r\n${body}`;
  return Buffer.from(mime).toString('base64url');
}

function quoteBody(body: string, isHtml: boolean): string {
  if (isHtml) {
    return `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${body}</blockquote>`;
  }
  return body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function buildMimeMessage(params: {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  isHtml?: boolean;
}): string {
  const contentType = params.isHtml
    ? 'text/html; charset=utf-8'
    : 'text/plain; charset=utf-8';

  const headers: Record<string, string> = {
    'MIME-Version': '1.0',
    'Content-Type': contentType,
    To: params.to.join(', '),
    Subject: encodeSubject(params.subject),
  };

  if (params.cc?.length) {
    headers['Cc'] = params.cc.join(', ');
  }
  if (params.bcc?.length) {
    headers['Bcc'] = params.bcc.join(', ');
  }

  return buildRawMime(headers, params.body);
}

export function buildForwardMimeMessage(params: {
  originalMessage: ParsedMessage;
  to: string[];
  cc?: string[];
  bcc?: string[];
  additionalBody?: string;
}): { raw: string; threadId: string } {
  const { originalMessage, to, additionalBody } = params;

  const subject = originalMessage.subject.match(/^Fwd:/i)
    ? originalMessage.subject
    : `Fwd: ${originalMessage.subject}`;

  const forwardHeader = [
    '',
    '---------- Forwarded message ----------',
    `From: ${originalMessage.from}`,
    `Date: ${originalMessage.date}`,
    `Subject: ${originalMessage.subject}`,
    `To: ${originalMessage.to.join(', ')}`,
    originalMessage.cc.length ? `Cc: ${originalMessage.cc.join(', ')}` : '',
    '',
  ].filter(Boolean).join('\n');

  const fullBody = (additionalBody || '') + forwardHeader + originalMessage.body;

  const headers: Record<string, string> = {
    'MIME-Version': '1.0',
    'Content-Type': 'text/plain; charset=utf-8',
    To: to.join(', '),
    Subject: encodeSubject(subject),
  };

  if (params.cc?.length) {
    headers['Cc'] = params.cc.join(', ');
  }
  if (params.bcc?.length) {
    headers['Bcc'] = params.bcc.join(', ');
  }

  return {
    raw: buildRawMime(headers, fullBody),
    threadId: originalMessage.threadId,
  };
}

export function buildReplyMimeMessage(params: {
  originalMessage: ParsedMessage;
  body: string;
  replyAll: boolean;
  isHtml?: boolean;
  userEmail?: string;
}): { raw: string; threadId: string } {
  const { originalMessage, body, replyAll, isHtml } = params;
  const userEmail = params.userEmail?.toLowerCase();

  // Determine recipients
  let toAddrs: string[];
  let ccAddrs: string[] = [];

  if (replyAll) {
    // Reply-all: To = original sender, Cc = original To + Cc minus self and original sender
    toAddrs = [originalMessage.from];

    const allRecipients = [...originalMessage.to, ...originalMessage.cc];
    const fromLower = originalMessage.from.toLowerCase();

    ccAddrs = allRecipients.filter((addr) => {
      const lower = addr.toLowerCase();
      if (lower === fromLower) return false;
      if (userEmail && lower.includes(userEmail)) return false;
      return true;
    });
  } else {
    toAddrs = [originalMessage.from];
  }

  // Build subject
  let subject = originalMessage.subject;
  if (!subject.match(/^Re:/i)) {
    subject = `Re: ${subject}`;
  }

  // Build quoted body
  const quotedOriginal = quoteBody(
    isHtml ? (originalMessage.bodyHtml || originalMessage.body) : originalMessage.body,
    !!isHtml,
  );

  const separator = isHtml
    ? `<br><br>On ${originalMessage.date}, ${originalMessage.from} wrote:<br>`
    : `\n\nOn ${originalMessage.date}, ${originalMessage.from} wrote:\n`;

  const fullBody = `${body}${separator}${quotedOriginal}`;

  const contentType = isHtml
    ? 'text/html; charset=utf-8'
    : 'text/plain; charset=utf-8';

  const headers: Record<string, string> = {
    'MIME-Version': '1.0',
    'Content-Type': contentType,
    To: toAddrs.join(', '),
    Subject: encodeSubject(subject),
    'In-Reply-To': originalMessage.messageId,
    'References': originalMessage.references
      ? `${originalMessage.references} ${originalMessage.messageId}`
      : originalMessage.messageId,
  };

  if (ccAddrs.length > 0) {
    headers['Cc'] = ccAddrs.join(', ');
  }

  return {
    raw: buildRawMime(headers, fullBody),
    threadId: originalMessage.threadId,
  };
}
