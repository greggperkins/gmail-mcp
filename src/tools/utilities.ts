import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  MarkAsReadInputSchema,
  MarkAsUnreadInputSchema,
  UnsubscribeInputSchema,
  wrapToolHandler,
} from '../types.js';
import { parseMessage, getHeader } from '../parser.js';

export function registerUtilityTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'markAsRead',
    'Mark one or more Gmail messages as read by removing the UNREAD label.',
    MarkAsReadInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = MarkAsReadInputSchema.parse(args);
      await client.batchModifyMessages({
        ids: parsed.messageIds,
        removeLabelIds: ['UNREAD'],
      });
      return {
        success: true,
        markedCount: parsed.messageIds.length,
        action: 'marked_as_read',
      };
    }),
  );

  server.tool(
    'markAsUnread',
    'Mark one or more Gmail messages as unread by adding the UNREAD label.',
    MarkAsUnreadInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = MarkAsUnreadInputSchema.parse(args);
      await client.batchModifyMessages({
        ids: parsed.messageIds,
        addLabelIds: ['UNREAD'],
      });
      return {
        success: true,
        markedCount: parsed.messageIds.length,
        action: 'marked_as_unread',
      };
    }),
  );

  server.tool(
    'unsubscribe',
    'Find and return the unsubscribe mechanism for a Gmail message. Checks the List-Unsubscribe header (RFC 2369), List-Unsubscribe-Post header (RFC 8058), and falls back to scanning the message body for unsubscribe links. Does NOT automatically unsubscribe — returns the mechanism for user confirmation.',
    UnsubscribeInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = UnsubscribeInputSchema.parse(args);
      const raw = await client.getMessage(parsed.messageId, 'full');
      const headers = raw.payload?.headers;
      const message = parseMessage(raw);

      const listUnsubscribe = getHeader(headers, 'List-Unsubscribe');
      const listUnsubscribePost = getHeader(headers, 'List-Unsubscribe-Post');

      if (listUnsubscribe) {
        // Parse the header — can contain mailto: and/or https: URIs
        const mailtoMatch = listUnsubscribe.match(/<mailto:([^>]+)>/i);
        const httpsMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/i);

        // Prefer one-click POST if available (RFC 8058)
        if (httpsMatch && listUnsubscribePost) {
          return {
            method: 'one-click',
            url: httpsMatch[1],
            postBody: listUnsubscribePost.trim() || 'List-Unsubscribe=One-Click-Unsubscribe',
            messageId: parsed.messageId,
            from: message.from,
            subject: message.subject,
            note: 'This supports one-click unsubscribe (RFC 8058). A POST request to the URL with the given body will unsubscribe.',
          };
        }

        // Mailto unsubscribe
        if (mailtoMatch) {
          const mailtoUri = mailtoMatch[1];
          const [email, queryString] = mailtoUri.split('?');
          const params = new URLSearchParams(queryString || '');
          return {
            method: 'email',
            address: email,
            subject: params.get('subject') || 'Unsubscribe',
            body: params.get('body') || '',
            messageId: parsed.messageId,
            from: message.from,
            originalSubject: message.subject,
            note: 'Send an email to this address to unsubscribe. Use sendMessage to send the unsubscribe email after user confirmation.',
          };
        }

        // HTTPS link (without one-click POST)
        if (httpsMatch) {
          return {
            method: 'link',
            url: httpsMatch[1],
            messageId: parsed.messageId,
            from: message.from,
            subject: message.subject,
            note: 'Visit this URL to unsubscribe. Share the link with the user.',
          };
        }
      }

      // Fallback: scan message body for unsubscribe links
      const bodyToScan = message.bodyHtml || message.body;
      const unsubscribePatterns = [
        /https?:\/\/[^\s"'<>]+unsubscribe[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+opt[-_]?out[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+manage[-_]?preferences[^\s"'<>]*/gi,
        /https?:\/\/[^\s"'<>]+email[-_]?preferences[^\s"'<>]*/gi,
      ];

      const foundUrls = new Set<string>();
      for (const pattern of unsubscribePatterns) {
        const matches = bodyToScan.matchAll(pattern);
        for (const match of matches) {
          // Clean up any trailing HTML artifacts
          const url = match[0].replace(/['"]+$/, '').replace(/&amp;/g, '&');
          foundUrls.add(url);
        }
      }

      if (foundUrls.size > 0) {
        return {
          method: 'body-link',
          urls: Array.from(foundUrls),
          messageId: parsed.messageId,
          from: message.from,
          subject: message.subject,
          note: 'Found unsubscribe links in the message body. Share these with the user to visit.',
        };
      }

      return {
        method: 'none',
        messageId: parsed.messageId,
        from: message.from,
        subject: message.subject,
        message: 'No unsubscribe mechanism found in this message. The message may not be a mailing list or newsletter.',
      };
    }),
  );
}
