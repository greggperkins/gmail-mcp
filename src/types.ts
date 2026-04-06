import { z } from 'zod';

// ── Token Schema ──

export const TokenSchema = z.object({
  type: z.literal('authorized_user'),
  client_id: z.string(),
  client_secret: z.string(),
  refresh_token: z.string(),
  token_uri: z.string().url().optional().default('https://oauth2.googleapis.com/token'),
});

export type Token = z.infer<typeof TokenSchema>;

// ── Tool Input Schemas ──

export const ListMessagesInputSchema = z.object({
  query: z.string().optional().describe('Gmail search query string'),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe('Maximum number of results to return'),
  labelIds: z.array(z.string()).optional().describe('Only return messages with these label IDs'),
  includeSpamTrash: z.boolean().optional().default(false).describe('Include messages from SPAM and TRASH'),
  pageToken: z.string().optional().describe('Page token from a previous list request'),
});

export const GetMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to retrieve'),
  format: z.enum(['full', 'metadata', 'minimal']).optional().default('full').describe('The format to return the message in'),
  metadataHeaders: z.array(z.string()).optional().describe('When format is metadata, only include these headers'),
});

export const SearchMessagesInputSchema = z.object({
  query: z.string().optional().describe('Raw Gmail search query string'),
  from: z.string().optional().describe('Filter by sender email address'),
  to: z.string().optional().describe('Filter by recipient email address'),
  subject: z.string().optional().describe('Filter by subject text'),
  after: z.string().optional().describe('Only messages after this date (YYYY/MM/DD)'),
  before: z.string().optional().describe('Only messages before this date (YYYY/MM/DD)'),
  hasAttachment: z.boolean().optional().describe('Only messages with attachments'),
  labelIds: z.array(z.string()).optional().describe('Only return messages with these label IDs'),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe('Maximum number of results'),
  pageToken: z.string().optional().describe('Page token for pagination'),
});

export const SendMessageInputSchema = z.object({
  to: z.array(z.string()).min(1).describe('Recipient email addresses'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body content'),
  cc: z.array(z.string()).optional().describe('CC recipients'),
  bcc: z.array(z.string()).optional().describe('BCC recipients'),
  bodyType: z.enum(['text', 'html']).optional().default('text').describe('Body content type'),
});

export const ReplyToMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to reply to'),
  body: z.string().describe('Reply body content'),
  replyAll: z.boolean().optional().default(false).describe('Reply to all recipients'),
  bodyType: z.enum(['text', 'html']).optional().default('text').describe('Body content type'),
});

export const ListThreadsInputSchema = z.object({
  query: z.string().optional().describe('Gmail search query string'),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe('Maximum number of results'),
  labelIds: z.array(z.string()).optional().describe('Only return threads with these label IDs'),
  includeSpamTrash: z.boolean().optional().default(false).describe('Include threads from SPAM and TRASH'),
  pageToken: z.string().optional().describe('Page token for pagination'),
});

export const GetThreadInputSchema = z.object({
  threadId: z.string().describe('The ID of the thread to retrieve'),
  format: z.enum(['full', 'metadata', 'minimal']).optional().default('full').describe('The format to return messages in'),
});

export const SearchThreadsInputSchema = z.object({
  query: z.string().optional().describe('Raw Gmail search query string'),
  from: z.string().optional().describe('Filter by sender'),
  to: z.string().optional().describe('Filter by recipient'),
  subject: z.string().optional().describe('Filter by subject'),
  after: z.string().optional().describe('Only threads after this date (YYYY/MM/DD)'),
  before: z.string().optional().describe('Only threads before this date (YYYY/MM/DD)'),
  hasAttachment: z.boolean().optional().describe('Only threads with attachments'),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe('Maximum number of results'),
  pageToken: z.string().optional().describe('Page token for pagination'),
});

export const ListLabelsInputSchema = z.object({});

// ── Output Types ──

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
}

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  date: string;
  messageId: string;
  inReplyTo: string;
  references: string;
  body: string;
  bodyHtml?: string;
  hasAttachments: boolean;
  attachments: AttachmentInfo[];
}

export interface ThreadConversation {
  id: string;
  subject: string;
  messageCount: number;
  participants: string[];
  messages: ParsedMessage[];
  snippet: string;
  labelIds: string[];
}

// ── Error Class ──

export class GmailApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

// ── Query Builder ──

export function buildGmailQuery(params: {
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  after?: string;
  before?: string;
  hasAttachment?: boolean;
}): string {
  const parts: string[] = [];
  if (params.query) parts.push(params.query);
  if (params.from) parts.push(`from:${params.from}`);
  if (params.to) parts.push(`to:${params.to}`);
  if (params.subject) parts.push(`subject:${params.subject}`);
  if (params.after) parts.push(`after:${params.after}`);
  if (params.before) parts.push(`before:${params.before}`);
  if (params.hasAttachment) parts.push('has:attachment');
  return parts.join(' ');
}

// ── Tool Handler Wrapper ──

export interface ToolCallResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function wrapToolHandler<T>(
  fn: (args: T) => Promise<unknown>,
): (args: T) => Promise<ToolCallResult> {
  return async (args: T) => {
    try {
      const result = await fn(args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      if (error instanceof GmailApiError) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              code: error.code,
              message: error.message,
              retryable: error.retryable,
            }),
          }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: true,
            code: 'UNKNOWN',
            message: error instanceof Error ? error.message : String(error),
            retryable: false,
          }),
        }],
        isError: true,
      };
    }
  };
}
