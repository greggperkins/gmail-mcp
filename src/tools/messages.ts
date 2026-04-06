import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListMessagesInputSchema,
  GetMessageInputSchema,
  SearchMessagesInputSchema,
  SendMessageInputSchema,
  ReplyToMessageInputSchema,
  buildGmailQuery,
  wrapToolHandler,
} from '../types.js';
import { parseMessage } from '../parser.js';
import { buildMimeMessage, buildReplyMimeMessage } from '../mime.js';

export function registerMessageTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listMessages',
    'List Gmail messages with optional query and label filters. Returns message IDs and snippets for fast browsing. Use getMessage to read full content.',
    ListMessagesInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListMessagesInputSchema.parse(args);
      const result = await client.listMessages({
        q: parsed.query,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        includeSpamTrash: parsed.includeSpamTrash,
        pageToken: parsed.pageToken,
      });

      // Fetch snippets for each message
      const messagesWithSnippets = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, 'metadata', ['From', 'Subject', 'Date']);
            const headers = msg.payload?.headers || [];
            const getH = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
            return {
              id: m.id,
              threadId: m.threadId,
              from: getH('From'),
              subject: getH('Subject'),
              date: getH('Date'),
              snippet: msg.snippet || '',
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        }),
      );

      return {
        messages: messagesWithSnippets,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      };
    }),
  );

  server.tool(
    'getMessage',
    'Get a complete Gmail message by ID, including parsed body text, headers, and attachment info.',
    GetMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetMessageInputSchema.parse(args);
      const raw = await client.getMessage(parsed.messageId, parsed.format, parsed.metadataHeaders);
      return parseMessage(raw);
    }),
  );

  server.tool(
    'searchMessages',
    'Search Gmail messages using a query string or structured parameters (from, to, subject, date range, hasAttachment). Returns matching messages with metadata.',
    SearchMessagesInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SearchMessagesInputSchema.parse(args);
      const q = buildGmailQuery({
        query: parsed.query,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        after: parsed.after,
        before: parsed.before,
        hasAttachment: parsed.hasAttachment,
      });

      const result = await client.listMessages({
        q: q || undefined,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        pageToken: parsed.pageToken,
      });

      // Fetch metadata for each result
      const messagesWithMeta = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, 'metadata', ['From', 'To', 'Subject', 'Date']);
            const headers = msg.payload?.headers || [];
            const getH = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
            return {
              id: m.id,
              threadId: m.threadId,
              from: getH('From'),
              to: getH('To'),
              subject: getH('Subject'),
              date: getH('Date'),
              snippet: msg.snippet || '',
              labelIds: msg.labelIds || [],
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        }),
      );

      return {
        messages: messagesWithMeta,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      };
    }),
  );

  server.tool(
    'sendMessage',
    'Send a new Gmail message. Supports plain text or HTML body, CC, and BCC recipients.',
    SendMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SendMessageInputSchema.parse(args);
      const raw = buildMimeMessage({
        to: parsed.to,
        subject: parsed.subject,
        body: parsed.body,
        cc: parsed.cc,
        bcc: parsed.bcc,
        isHtml: parsed.bodyType === 'html',
      });

      const result = await client.sendMessage(raw);
      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        labelIds: result.labelIds,
      };
    }),
  );

  server.tool(
    'replyToMessage',
    'Reply to an existing Gmail message. Automatically threads into the conversation with correct In-Reply-To and References headers. Supports reply-all.',
    ReplyToMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ReplyToMessageInputSchema.parse(args);

      // Fetch the original message to get headers for threading
      const rawOriginal = await client.getMessage(parsed.messageId, 'full');
      const original = parseMessage(rawOriginal);

      // Get user's email for filtering reply-all recipients
      const profile = await client.getProfile();
      const userEmail = profile.emailAddress || undefined;

      const { raw, threadId } = buildReplyMimeMessage({
        originalMessage: original,
        body: parsed.body,
        replyAll: parsed.replyAll,
        isHtml: parsed.bodyType === 'html',
        userEmail,
      });

      const result = await client.sendMessageInThread(raw, threadId);
      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        labelIds: result.labelIds,
      };
    }),
  );
}
