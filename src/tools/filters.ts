import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { gmail_v1 } from 'googleapis';
import type { GmailClient } from '../client.js';
import {
  ListFiltersInputSchema,
  GetFilterInputSchema,
  CreateFilterInputSchema,
  DeleteFilterInputSchema,
  wrapToolHandler,
} from '../types.js';
import type { z } from 'zod';
import type { FilterActionSchema } from '../types.js';

type FilterAction = z.infer<typeof FilterActionSchema>;

function buildFilterAction(action: FilterAction): gmail_v1.Schema$FilterAction {
  const addLabelIds: string[] = [...(action.addLabelIds || [])];
  const removeLabelIds: string[] = [...(action.removeLabelIds || [])];

  if (action.markAsRead) removeLabelIds.push('UNREAD');
  if (action.star) addLabelIds.push('STARRED');
  if (action.trash) addLabelIds.push('TRASH');
  if (action.neverSpam) removeLabelIds.push('SPAM');
  if (action.markImportant) addLabelIds.push('IMPORTANT');

  const result: gmail_v1.Schema$FilterAction = {};
  if (addLabelIds.length) result.addLabelIds = addLabelIds;
  if (removeLabelIds.length) result.removeLabelIds = removeLabelIds;
  if (action.forward) result.forward = action.forward;

  return result;
}

function formatFilter(filter: gmail_v1.Schema$Filter) {
  return {
    id: filter.id,
    criteria: {
      from: filter.criteria?.from,
      to: filter.criteria?.to,
      subject: filter.criteria?.subject,
      query: filter.criteria?.query,
      negatedQuery: filter.criteria?.negatedQuery,
      hasAttachment: filter.criteria?.hasAttachment,
      size: filter.criteria?.size,
      sizeComparison: filter.criteria?.sizeComparison,
    },
    action: {
      addLabelIds: filter.action?.addLabelIds,
      removeLabelIds: filter.action?.removeLabelIds,
      forward: filter.action?.forward,
    },
  };
}

export function registerFilterTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listFilters',
    'List all Gmail email filters with their criteria and actions.',
    ListFiltersInputSchema.shape,
    wrapToolHandler(async () => {
      const filters = await client.listFilters();
      return filters.map(formatFilter);
    }),
  );

  server.tool(
    'getFilter',
    'Get a specific Gmail email filter by ID with its criteria and actions.',
    GetFilterInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetFilterInputSchema.parse(args);
      const filter = await client.getFilter(parsed.filterId);
      return formatFilter(filter);
    }),
  );

  server.tool(
    'createFilter',
    'Create a new Gmail email filter. Specify criteria to match messages and actions to perform. Actions support friendly options like markAsRead, star, trash, neverSpam, markImportant, or raw addLabelIds/removeLabelIds.',
    CreateFilterInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = CreateFilterInputSchema.parse(args);

      const criteria: gmail_v1.Schema$FilterCriteria = {};
      if (parsed.criteria.from) criteria.from = parsed.criteria.from;
      if (parsed.criteria.to) criteria.to = parsed.criteria.to;
      if (parsed.criteria.subject) criteria.subject = parsed.criteria.subject;
      if (parsed.criteria.query) criteria.query = parsed.criteria.query;
      if (parsed.criteria.negatedQuery) criteria.negatedQuery = parsed.criteria.negatedQuery;
      if (parsed.criteria.hasAttachment !== undefined) criteria.hasAttachment = parsed.criteria.hasAttachment;
      if (parsed.criteria.size !== undefined) criteria.size = parsed.criteria.size;
      if (parsed.criteria.sizeComparison) criteria.sizeComparison = parsed.criteria.sizeComparison;

      const action = parsed.action ? buildFilterAction(parsed.action) : {};

      const filter = await client.createFilter({ criteria, action });
      return {
        success: true,
        filter: formatFilter(filter),
      };
    }),
  );

  server.tool(
    'deleteFilter',
    'Delete a Gmail email filter by ID.',
    DeleteFilterInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = DeleteFilterInputSchema.parse(args);
      await client.deleteFilter(parsed.filterId);
      return { success: true, filterId: parsed.filterId, action: 'deleted' };
    }),
  );
}
