import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListMessagesInputSchema,
  GetMessageInputSchema,
  SearchMessagesInputSchema,
  SendMessageInputSchema,
  ReplyToMessageInputSchema,
  ForwardMessageInputSchema,
  TrashMessageInputSchema,
  UntrashMessageInputSchema,
  DeleteMessageInputSchema,
  BatchModifyMessagesInputSchema,
  buildGmailQuery,
  wrapToolHandler,
} from '../types.js';
import { parseMessage } from '../parser.js';
import { buildMimeMessage, buildReplyMimeMessage, buildForwardMimeMessage } from '../mime.js';

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

  // ── Phase 2: Write Operations ──

  server.tool(
    'forwardMessage',
    'Forward a Gmail message to new recipients. Includes the original message content with a standard forwarded message header.',
    ForwardMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ForwardMessageInputSchema.parse(args);

      const rawOriginal = await client.getMessage(parsed.messageId, 'full');
      const original = parseMessage(rawOriginal);

      const { raw } = buildForwardMimeMessage({
        originalMessage: original,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        additionalBody: parsed.additionalBody,
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
    'trashMessage',
    'Move a Gmail message to the trash. The message can be recovered with untrashMessage.',
    TrashMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = TrashMessageInputSchema.parse(args);
      await client.trashMessage(parsed.messageId);
      return { success: true, messageId: parsed.messageId, action: 'trashed' };
    }),
  );

  server.tool(
    'untrashMessage',
    'Remove a Gmail message from the trash, restoring it to its previous location.',
    UntrashMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = UntrashMessageInputSchema.parse(args);
      await client.untrashMessage(parsed.messageId);
      return { success: true, messageId: parsed.messageId, action: 'untrashed' };
    }),
  );

  server.tool(
    'deleteMessage',
    'Permanently delete a Gmail message. WARNING: This action cannot be undone. The message is immediately and irreversibly deleted. Use trashMessage for recoverable deletion.',
    DeleteMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = DeleteMessageInputSchema.parse(args);
      await client.deleteMessage(parsed.messageId);
      return { success: true, messageId: parsed.messageId, action: 'permanently_deleted' };
    }),
  );

  server.tool(
    'batchModifyMessages',
    'Add or remove labels on multiple Gmail messages at once. Useful for bulk organizing, archiving, or categorizing messages.',
    BatchModifyMessagesInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = BatchModifyMessagesInputSchema.parse(args);
      await client.batchModifyMessages({
        ids: parsed.messageIds,
        addLabelIds: parsed.addLabelIds,
        removeLabelIds: parsed.removeLabelIds,
      });
      return {
        success: true,
        modifiedCount: parsed.messageIds.length,
        addedLabels: parsed.addLabelIds || [],
        removedLabels: parsed.removeLabelIds || [],
      };
    }),
  );
}
