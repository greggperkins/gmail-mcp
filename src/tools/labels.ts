import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListLabelsInputSchema,
  GetLabelInputSchema,
  CreateLabelInputSchema,
  UpdateLabelInputSchema,
  DeleteLabelInputSchema,
  ApplyLabelInputSchema,
  wrapToolHandler,
} from '../types.js';

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

  // ── Phase 2: Label CRUD ──

  server.tool(
    'getLabel',
    'Get details for a specific Gmail label, including message and thread counts.',
    GetLabelInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetLabelInputSchema.parse(args);
      const label = await client.getLabel(parsed.labelId);
      return {
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
        color: label.color,
      };
    }),
  );

  server.tool(
    'createLabel',
    'Create a new user Gmail label with optional visibility and color settings.',
    CreateLabelInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = CreateLabelInputSchema.parse(args);
      const label = await client.createLabel({
        name: parsed.name,
        labelListVisibility: parsed.labelListVisibility,
        messageListVisibility: parsed.messageListVisibility,
        backgroundColor: parsed.backgroundColor,
        textColor: parsed.textColor,
      });
      return {
        success: true,
        id: label.id,
        name: label.name,
        type: label.type,
      };
    }),
  );

  server.tool(
    'updateLabel',
    'Update an existing Gmail label name, visibility, or color.',
    UpdateLabelInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = UpdateLabelInputSchema.parse(args);
      const label = await client.updateLabel(parsed.labelId, {
        name: parsed.name,
        labelListVisibility: parsed.labelListVisibility,
        messageListVisibility: parsed.messageListVisibility,
        backgroundColor: parsed.backgroundColor,
        textColor: parsed.textColor,
      });
      return {
        success: true,
        id: label.id,
        name: label.name,
        type: label.type,
      };
    }),
  );

  server.tool(
    'deleteLabel',
    'Delete a user-created Gmail label. System labels cannot be deleted.',
    DeleteLabelInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = DeleteLabelInputSchema.parse(args);
      await client.deleteLabel(parsed.labelId);
      return { success: true, labelId: parsed.labelId, action: 'deleted' };
    }),
  );

  server.tool(
    'applyLabel',
    'Apply a label to one or more Gmail messages.',
    ApplyLabelInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ApplyLabelInputSchema.parse(args);
      await client.batchModifyMessages({
        ids: parsed.messageIds,
        addLabelIds: [parsed.labelId],
      });
      return {
        success: true,
        labelId: parsed.labelId,
        appliedToCount: parsed.messageIds.length,
      };
    }),
  );
}
