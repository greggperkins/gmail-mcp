import type { gmail_v1 } from 'googleapis';
import { convert } from 'html-to-text';
import type { ParsedMessage, AttachmentInfo, ThreadConversation } from './types.js';

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string {
  if (!headers) return '';
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function htmlToText(html: string): string {
  return convert(html, {
    wordwrap: 120,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}

interface ExtractedBody {
  text: string;
  html?: string;
}

export function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): ExtractedBody {
  if (!payload) return { text: '' };

  const mimeType = payload.mimeType || '';

  // Single-part message with body data
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (mimeType === 'text/plain') {
      return { text: decoded };
    }
    if (mimeType === 'text/html') {
      return { text: htmlToText(decoded), html: decoded };
    }
    return { text: decoded };
  }

  // Multipart message — walk parts
  if (payload.parts && payload.parts.length > 0) {
    // multipart/alternative — prefer text/plain, fall back to text/html
    if (mimeType === 'multipart/alternative') {
      let textResult: ExtractedBody | null = null;
      let htmlResult: ExtractedBody | null = null;

      for (const part of payload.parts) {
        const partMime = part.mimeType || '';
        if (partMime === 'text/plain' && part.body?.data) {
          textResult = { text: decodeBase64Url(part.body.data) };
        } else if (partMime === 'text/html' && part.body?.data) {
          const html = decodeBase64Url(part.body.data);
          htmlResult = { text: htmlToText(html), html };
        } else if (partMime.startsWith('multipart/')) {
          // Nested multipart within alternative
          const nested = extractBody(part);
          if (nested.text) {
            if (partMime === 'multipart/alternative') {
              return nested;
            }
            if (!textResult) textResult = nested;
          }
        }
      }

      if (textResult) {
        return { ...textResult, html: htmlResult?.html };
      }
      if (htmlResult) return htmlResult;
    }

    // multipart/mixed, multipart/related, or other — find text content
    let textBody = '';
    let htmlBody: string | undefined;

    for (const part of payload.parts) {
      const partMime = part.mimeType || '';

      if (partMime === 'text/plain' && part.body?.data && !textBody) {
        textBody = decodeBase64Url(part.body.data);
      } else if (partMime === 'text/html' && part.body?.data && !htmlBody) {
        htmlBody = decodeBase64Url(part.body.data);
      } else if (partMime.startsWith('multipart/')) {
        const nested = extractBody(part);
        if (!textBody && nested.text) textBody = nested.text;
        if (!htmlBody && nested.html) htmlBody = nested.html;
      }
    }

    if (textBody) {
      return { text: textBody, html: htmlBody };
    }
    if (htmlBody) {
      return { text: htmlToText(htmlBody), html: htmlBody };
    }
  }

  return { text: '' };
}

function extractAttachments(payload: gmail_v1.Schema$MessagePart | undefined): AttachmentInfo[] {
  const attachments: AttachmentInfo[] = [];
  if (!payload) return attachments;

  function walk(part: gmail_v1.Schema$MessagePart): void {
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return attachments;
}

function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map((addr) => addr.trim()).filter(Boolean);
}

export function parseMessage(message: gmail_v1.Schema$Message): ParsedMessage {
  const headers = message.payload?.headers;
  const body = extractBody(message.payload);
  const attachments = extractAttachments(message.payload);

  return {
    id: message.id || '',
    threadId: message.threadId || '',
    labelIds: message.labelIds || [],
    snippet: message.snippet || '',
    from: getHeader(headers, 'From'),
    to: parseAddressList(getHeader(headers, 'To')),
    cc: parseAddressList(getHeader(headers, 'Cc')),
    bcc: parseAddressList(getHeader(headers, 'Bcc')),
    subject: getHeader(headers, 'Subject'),
    date: getHeader(headers, 'Date'),
    messageId: getHeader(headers, 'Message-ID'),
    inReplyTo: getHeader(headers, 'In-Reply-To'),
    references: getHeader(headers, 'References'),
    body: body.text,
    bodyHtml: body.html,
    hasAttachments: attachments.length > 0,
    attachments,
  };
}

export function parseThread(thread: gmail_v1.Schema$Thread): ThreadConversation {
  const messages = (thread.messages || []).map(parseMessage);
  const participantSet = new Set<string>();

  for (const msg of messages) {
    if (msg.from) participantSet.add(msg.from);
    for (const addr of msg.to) participantSet.add(addr);
    for (const addr of msg.cc) participantSet.add(addr);
  }

  const allLabelIds = new Set<string>();
  for (const msg of messages) {
    for (const labelId of msg.labelIds) {
      allLabelIds.add(labelId);
    }
  }

  return {
    id: thread.id || '',
    subject: messages[0]?.subject || '',
    messageCount: messages.length,
    participants: Array.from(participantSet),
    messages,
    snippet: thread.snippet || messages[messages.length - 1]?.snippet || '',
    labelIds: Array.from(allLabelIds),
  };
}
