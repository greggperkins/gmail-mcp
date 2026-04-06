import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import { getHeader } from '../parser.js';

export function registerUnreadResource(server: McpServer, client: GmailClient): void {
  server.resource(
    'unread',
    'gmail://unread',
    {
      description: 'Last 20 unread messages with sender, subject, snippet, date, and labels',
      mimeType: 'application/json',
    },
    async (uri) => {
      const result = await client.listMessages({
        q: 'is:unread',
        maxResults: 20,
      });

      const messages = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, 'metadata', ['From', 'Subject', 'Date']);
            const headers = msg.payload?.headers || [];
            return {
              id: m.id,
              threadId: m.threadId,
              from: getHeader(headers, 'From'),
              subject: getHeader(headers, 'Subject'),
              date: getHeader(headers, 'Date'),
              snippet: msg.snippet || '',
              labelIds: msg.labelIds || [],
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        }),
      );

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              { unreadCount: result.resultSizeEstimate, messages },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
