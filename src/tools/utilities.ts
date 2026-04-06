import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  MarkAsReadInputSchema,
  MarkAsUnreadInputSchema,
  wrapToolHandler,
} from '../types.js';

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
}
