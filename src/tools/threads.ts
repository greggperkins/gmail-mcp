import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListThreadsInputSchema,
  GetThreadInputSchema,
  SearchThreadsInputSchema,
  buildGmailQuery,
  wrapToolHandler,
} from '../types.js';
import { parseThread } from '../parser.js';

export function registerThreadTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listThreads',
    'List Gmail conversation threads with optional query and label filters. Returns thread IDs and snippets.',
    ListThreadsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListThreadsInputSchema.parse(args);
      const result = await client.listThreads({
        q: parsed.query,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        includeSpamTrash: parsed.includeSpamTrash,
        pageToken: parsed.pageToken,
      });

      return {
        threads: result.threads,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      };
    }),
  );

  server.tool(
    'getThread',
    'Get a full Gmail conversation thread with all messages parsed into a clean conversation view. Shows participants, message bodies (with quoted content separated), and attachment metadata.',
    GetThreadInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetThreadInputSchema.parse(args);
      const rawThread = await client.getThread(parsed.threadId, parsed.format);
      return parseThread(rawThread);
    }),
  );

  server.tool(
    'searchThreads',
    'Search Gmail threads using a query string or structured parameters (from, to, subject, date range, hasAttachment). Returns matching thread IDs.',
    SearchThreadsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SearchThreadsInputSchema.parse(args);
      const q = buildGmailQuery({
        query: parsed.query,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        after: parsed.after,
        before: parsed.before,
        hasAttachment: parsed.hasAttachment,
      });

      const result = await client.listThreads({
        q: q || undefined,
        maxResults: parsed.maxResults,
        pageToken: parsed.pageToken,
      });

      return {
        threads: result.threads,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      };
    }),
  );
}
