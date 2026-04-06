import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import { ListLabelsInputSchema, wrapToolHandler } from '../types.js';

export function registerLabelTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listLabels',
    'List all Gmail labels (system and user-created) with message and thread counts.',
    ListLabelsInputSchema.shape,
    wrapToolHandler(async () => {
      const labels = await client.listLabels();
      return labels.map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
        color: label.color,
      }));
    }),
  );
}
