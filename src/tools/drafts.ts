import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  ListDraftsInputSchema,
  GetDraftInputSchema,
  CreateDraftInputSchema,
  UpdateDraftInputSchema,
  SendDraftInputSchema,
  wrapToolHandler,
} from '../types.js';
import { parseMessage } from '../parser.js';
import { buildMimeMessage } from '../mime.js';

export function registerDraftTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'listDrafts',
    'List all Gmail drafts. Returns draft IDs and associated message IDs.',
    ListDraftsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListDraftsInputSchema.parse(args);
      const result = await client.listDrafts({
        maxResults: parsed.maxResults,
        pageToken: parsed.pageToken,
      });

      // Fetch metadata for each draft
      const draftsWithMeta = await Promise.all(
        result.drafts.map(async (d) => {
          try {
            const draft = await client.getDraft(d.id, 'metadata');
            const headers = draft.message?.payload?.headers || [];
            const getH = (name: string) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
            return {
              id: d.id,
              messageId: d.messageId,
              to: getH('To'),
              subject: getH('Subject'),
              date: getH('Date'),
              snippet: draft.message?.snippet || '',
            };
          } catch {
            return { id: d.id, messageId: d.messageId };
          }
        }),
      );

      return {
        drafts: draftsWithMeta,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate,
      };
    }),
  );

  server.tool(
    'getDraft',
    'Get a specific Gmail draft by ID with full parsed message content.',
    GetDraftInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetDraftInputSchema.parse(args);
      const draft = await client.getDraft(parsed.draftId, parsed.format);
      const message = draft.message ? parseMessage(draft.message) : null;
      return {
        id: draft.id,
        message,
      };
    }),
  );

  server.tool(
    'createDraft',
    'Create a new Gmail draft. The draft can be edited later with updateDraft or sent with sendDraft.',
    CreateDraftInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = CreateDraftInputSchema.parse(args);
      const raw = buildMimeMessage({
        to: parsed.to,
        subject: parsed.subject,
        body: parsed.body,
        cc: parsed.cc,
        bcc: parsed.bcc,
        isHtml: parsed.bodyType === 'html',
      });

      const result = await client.createDraft(raw, parsed.threadId);
      return {
        success: true,
        draftId: result.id,
        messageId: result.messageId,
      };
    }),
  );

  server.tool(
    'updateDraft',
    'Update an existing Gmail draft with new content. Replaces the entire draft message.',
    UpdateDraftInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = UpdateDraftInputSchema.parse(args);

      // If partial fields are provided, we need to fetch the existing draft
      // and merge — but Gmail API replaces the entire message on update,
      // so we need to fetch current values for any omitted fields.
      let to = parsed.to;
      let subject = parsed.subject;
      let body = parsed.body;
      let cc = parsed.cc;
      let bcc = parsed.bcc;

      if (to === undefined || subject === undefined || body === undefined) {
        const existing = await client.getDraft(parsed.draftId, 'full');
        const existingMsg = existing.message ? parseMessage(existing.message) : null;
        if (existingMsg) {
          if (to === undefined) to = existingMsg.to;
          if (subject === undefined) subject = existingMsg.subject;
          if (body === undefined) body = existingMsg.body;
          if (cc === undefined) cc = existingMsg.cc.length ? existingMsg.cc : undefined;
          if (bcc === undefined) bcc = existingMsg.bcc.length ? existingMsg.bcc : undefined;
        }
      }

      const raw = buildMimeMessage({
        to: to || [],
        subject: subject || '',
        body: body || '',
        cc,
        bcc,
        isHtml: parsed.bodyType === 'html',
      });

      const result = await client.updateDraft(parsed.draftId, raw);
      return {
        success: true,
        draftId: result.id,
        messageId: result.messageId,
      };
    }),
  );

  server.tool(
    'sendDraft',
    'Send an existing Gmail draft immediately.',
    SendDraftInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SendDraftInputSchema.parse(args);
      const result = await client.sendDraft(parsed.draftId);
      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        labelIds: result.labelIds,
      };
    }),
  );
}
