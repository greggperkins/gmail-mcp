import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';

export function registerLabelsResource(server: McpServer, client: GmailClient): void {
  server.resource(
    'labels',
    'gmail://labels',
    {
      description: 'All Gmail labels with message and thread counts',
      mimeType: 'application/json',
    },
    async (uri) => {
      const labels = await client.listLabels();

      const formatted = labels.map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    },
  );
}
