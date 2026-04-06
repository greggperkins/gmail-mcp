import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListAttachmentsInputSchema,
  GetAttachmentInputSchema,
  GetAttachmentMetadataInputSchema,
  wrapToolHandler,
} from '../types.js';
import { parseMessage } from '../parser.js';

export function registerAttachmentTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listAttachments',
    'List all attachments on a Gmail message with filename, mimeType, size, and attachmentId. Use getAttachment to download content.',
    ListAttachmentsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListAttachmentsInputSchema.parse(args);
      const raw = await client.getMessage(parsed.messageId, 'full');
      const message = parseMessage(raw);
      return {
        messageId: parsed.messageId,
        attachments: message.attachments,
        count: message.attachments.length,
      };
    }),
  );

  server.tool(
    'getAttachment',
    'Download a Gmail attachment as base64-encoded content. For large attachments this may be slow. Use listAttachments first to get the attachmentId.',
    GetAttachmentInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetAttachmentInputSchema.parse(args);

      // Get attachment metadata from the message
      const raw = await client.getMessage(parsed.messageId, 'full');
      const message = parseMessage(raw);
      const attachmentMeta = message.attachments.find(
        (a) => a.attachmentId === parsed.attachmentId,
      );

      // Download the attachment data
      const attachment = await client.getAttachment(parsed.messageId, parsed.attachmentId);

      return {
        messageId: parsed.messageId,
        attachmentId: parsed.attachmentId,
        filename: attachmentMeta?.filename || 'unknown',
        mimeType: attachmentMeta?.mimeType || 'application/octet-stream',
        size: attachment.size,
        data: attachment.data,
      };
    }),
  );

  server.tool(
    'getAttachmentMetadata',
    'Get metadata for a specific attachment (filename, mimeType, size) without downloading the content.',
    GetAttachmentMetadataInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetAttachmentMetadataInputSchema.parse(args);
      const raw = await client.getMessage(parsed.messageId, 'full');
      const message = parseMessage(raw);
      const attachment = message.attachments.find(
        (a) => a.attachmentId === parsed.attachmentId,
      );

      if (!attachment) {
        return {
          error: true,
          code: 'NOT_FOUND',
          message: `Attachment ${parsed.attachmentId} not found on message ${parsed.messageId}`,
        };
      }

      return {
        messageId: parsed.messageId,
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
      };
    }),
  );
}
