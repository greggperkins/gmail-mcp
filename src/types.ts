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

// ── Phase 2: Message Write Operations ──

export const ForwardMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to forward'),
  to: z.array(z.string()).min(1).describe('Recipient email addresses'),
  additionalBody: z.string().optional().describe('Additional text to prepend before the forwarded message'),
  cc: z.array(z.string()).optional().describe('CC recipients'),
  bcc: z.array(z.string()).optional().describe('BCC recipients'),
});

export const TrashMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to move to trash'),
});

export const UntrashMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to remove from trash'),
});

export const DeleteMessageInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to permanently delete. This action cannot be undone.'),
});

export const BatchModifyMessagesInputSchema = z.object({
  messageIds: z.array(z.string()).min(1).max(1000).describe('Message IDs to modify'),
  addLabelIds: z.array(z.string()).optional().describe('Label IDs to add to the messages'),
  removeLabelIds: z.array(z.string()).optional().describe('Label IDs to remove from the messages'),
});

// ── Phase 2: Thread Write Operations ──

export const TrashThreadInputSchema = z.object({
  threadId: z.string().describe('The ID of the thread to move to trash'),
});

export const UntrashThreadInputSchema = z.object({
  threadId: z.string().describe('The ID of the thread to remove from trash'),
});

export const ModifyThreadInputSchema = z.object({
  threadId: z.string().describe('The ID of the thread to modify'),
  addLabelIds: z.array(z.string()).optional().describe('Label IDs to add to the thread'),
  removeLabelIds: z.array(z.string()).optional().describe('Label IDs to remove from the thread'),
});

// ── Phase 2: Draft Operations ──

export const ListDraftsInputSchema = z.object({
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe('Maximum number of results'),
  pageToken: z.string().optional().describe('Page token for pagination'),
});

export const GetDraftInputSchema = z.object({
  draftId: z.string().describe('The ID of the draft to retrieve'),
  format: z.enum(['full', 'metadata', 'minimal']).optional().default('full').describe('The format to return the draft message in'),
});

export const CreateDraftInputSchema = z.object({
  to: z.array(z.string()).min(1).describe('Recipient email addresses'),
  subject: z.string().describe('Email subject'),
  body: z.string().describe('Email body content'),
  cc: z.array(z.string()).optional().describe('CC recipients'),
  bcc: z.array(z.string()).optional().describe('BCC recipients'),
  bodyType: z.enum(['text', 'html']).optional().default('text').describe('Body content type'),
  threadId: z.string().optional().describe('Thread ID to associate the draft with'),
});

export const UpdateDraftInputSchema = z.object({
  draftId: z.string().describe('The ID of the draft to update'),
  to: z.array(z.string()).optional().describe('Recipient email addresses'),
  subject: z.string().optional().describe('Email subject'),
  body: z.string().optional().describe('Email body content'),
  cc: z.array(z.string()).optional().describe('CC recipients'),
  bcc: z.array(z.string()).optional().describe('BCC recipients'),
  bodyType: z.enum(['text', 'html']).optional().default('text').describe('Body content type'),
});

export const SendDraftInputSchema = z.object({
  draftId: z.string().describe('The ID of the draft to send'),
});

// ── Phase 2: Label CRUD Operations ──

export const GetLabelInputSchema = z.object({
  labelId: z.string().describe('The ID of the label to retrieve'),
});

export const CreateLabelInputSchema = z.object({
  name: z.string().describe('The display name of the label'),
  labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Visibility in the label list'),
  messageListVisibility: z.enum(['show', 'hide']).optional().describe('Visibility in the message list'),
  backgroundColor: z.string().optional().describe('Background color hex code (e.g. #000000)'),
  textColor: z.string().optional().describe('Text color hex code (e.g. #ffffff)'),
});

export const UpdateLabelInputSchema = z.object({
  labelId: z.string().describe('The ID of the label to update'),
  name: z.string().optional().describe('New display name'),
  labelListVisibility: z.enum(['labelShow', 'labelShowIfUnread', 'labelHide']).optional().describe('Visibility in the label list'),
  messageListVisibility: z.enum(['show', 'hide']).optional().describe('Visibility in the message list'),
  backgroundColor: z.string().optional().describe('Background color hex code'),
  textColor: z.string().optional().describe('Text color hex code'),
});

export const DeleteLabelInputSchema = z.object({
  labelId: z.string().describe('The ID of the label to delete'),
});

export const ApplyLabelInputSchema = z.object({
  messageIds: z.array(z.string()).min(1).describe('Message IDs to apply the label to'),
  labelId: z.string().describe('The label ID to apply'),
});

// ── Phase 2: Utility Operations ──

export const MarkAsReadInputSchema = z.object({
  messageIds: z.array(z.string()).min(1).describe('Message IDs to mark as read'),
});

export const MarkAsUnreadInputSchema = z.object({
  messageIds: z.array(z.string()).min(1).describe('Message IDs to mark as unread'),
});

// ── Phase 3: Attachment Operations ──

export const ListAttachmentsInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to list attachments for'),
});

export const GetAttachmentInputSchema = z.object({
  messageId: z.string().describe('The ID of the message containing the attachment'),
  attachmentId: z.string().describe('The ID of the attachment to download'),
});

export const GetAttachmentMetadataInputSchema = z.object({
  messageId: z.string().describe('The ID of the message containing the attachment'),
  attachmentId: z.string().describe('The ID of the attachment'),
});

// ── Phase 3: Filter Operations ──

export const FilterCriteriaSchema = z.object({
  from: z.string().optional().describe('Sender match'),
  to: z.string().optional().describe('Recipient match'),
  subject: z.string().optional().describe('Subject match'),
  query: z.string().optional().describe('Gmail search query match'),
  negatedQuery: z.string().optional().describe('Exclude messages matching this query'),
  hasAttachment: z.boolean().optional().describe('Has attachment'),
  size: z.number().optional().describe('Size in bytes'),
  sizeComparison: z.enum(['larger', 'smaller']).optional().describe('Size comparison operator'),
});

export const FilterActionSchema = z.object({
  addLabelIds: z.array(z.string()).optional().describe('Label IDs to apply'),
  removeLabelIds: z.array(z.string()).optional().describe('Label IDs to remove (e.g. INBOX to archive)'),
  forward: z.string().optional().describe('Forward to this email address'),
  markAsRead: z.boolean().optional().describe('Mark matching messages as read'),
  star: z.boolean().optional().describe('Star matching messages'),
  trash: z.boolean().optional().describe('Move matching messages to trash'),
  neverSpam: z.boolean().optional().describe('Never send matching messages to spam'),
  markImportant: z.boolean().optional().describe('Mark matching messages as important'),
});

export const ListFiltersInputSchema = z.object({});

export const GetFilterInputSchema = z.object({
  filterId: z.string().describe('The ID of the filter to retrieve'),
});

export const CreateFilterInputSchema = z.object({
  criteria: FilterCriteriaSchema.describe('Filter matching criteria'),
  action: FilterActionSchema.optional().describe('Actions to perform on matching messages'),
});

export const DeleteFilterInputSchema = z.object({
  filterId: z.string().describe('The ID of the filter to delete'),
});

// ── Phase 3: Settings Operations ──

export const GetProfileInputSchema = z.object({});

export const GetVacationSettingsInputSchema = z.object({});

export const UpdateVacationSettingsInputSchema = z.object({
  enableAutoReply: z.boolean().describe('Whether to enable the vacation auto-reply'),
  responseSubject: z.string().optional().describe('Subject line for the auto-reply'),
  responseBodyPlainText: z.string().optional().describe('Plain text body for the auto-reply'),
  responseBodyHtml: z.string().optional().describe('HTML body for the auto-reply'),
  restrictToContacts: z.boolean().optional().describe('Only auto-reply to people in contacts'),
  restrictToDomain: z.boolean().optional().describe('Only auto-reply to people in the same domain'),
  startTime: z.string().optional().describe('Start time in ISO 8601 format (e.g. 2026-04-01T00:00:00Z)'),
  endTime: z.string().optional().describe('End time in ISO 8601 format (e.g. 2026-04-15T00:00:00Z)'),
});

export const ListSendAsAliasesInputSchema = z.object({});

export const ListForwardingAddressesInputSchema = z.object({});

// ── Phase 3: Unsubscribe ──

export const UnsubscribeInputSchema = z.object({
  messageId: z.string().describe('The ID of the message to find an unsubscribe mechanism for'),
});

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
