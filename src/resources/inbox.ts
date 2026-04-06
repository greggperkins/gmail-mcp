import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import { getHeader } from '../parser.js';

export function registerInboxResource(server: McpServer, client: GmailClient): void {
  server.resource(
    'inbox',
    'gmail://inbox',
    {
      description: 'Current inbox summary — recent messages with sender, subject, and snippet',
      mimeType: 'application/json',
    },
    async (uri) => {
      const result = await client.listMessages({
        labelIds: ['INBOX'],
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
            text: JSON.stringify({ messages, total: result.resultSizeEstimate }, null, 2),
          },
        ],
      };
    },
  );
}
