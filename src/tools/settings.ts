import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';
import {
  GetProfileInputSchema,
  GetVacationSettingsInputSchema,
  UpdateVacationSettingsInputSchema,
  ListSendAsAliasesInputSchema,
  ListForwardingAddressesInputSchema,
  wrapToolHandler,
} from '../types.js';

export function registerSettingsTools(server: McpServer, client: GmailClient): void {
  server.tool(
    'getProfile',
    'Get Gmail account profile information including email address, total messages, total threads, and history ID.',
    GetProfileInputSchema.shape,
    wrapToolHandler(async () => {
      const profile = await client.getProfile();
      return {
        emailAddress: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal,
        historyId: profile.historyId,
      };
    }),
  );

  server.tool(
    'getVacationSettings',
    'Get the current vacation auto-reply / out-of-office settings.',
    GetVacationSettingsInputSchema.shape,
    wrapToolHandler(async () => {
      const settings = await client.getVacationSettings();
      return {
        enableAutoReply: settings.enableAutoReply,
        responseSubject: settings.responseSubject,
        responseBodyPlainText: settings.responseBodyPlainText,
        responseBodyHtml: settings.responseBodyHtml,
        restrictToContacts: settings.restrictToContacts,
        restrictToDomain: settings.restrictToDomain,
        startTime: settings.startTime
          ? new Date(Number(settings.startTime)).toISOString()
          : undefined,
        endTime: settings.endTime
          ? new Date(Number(settings.endTime)).toISOString()
          : undefined,
      };
    }),
  );

  server.tool(
    'updateVacationSettings',
    'Enable or disable the Gmail vacation auto-reply / out-of-office responder. Times accept ISO 8601 format.',
    UpdateVacationSettingsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = UpdateVacationSettingsInputSchema.parse(args);

      const settings: Record<string, unknown> = {
        enableAutoReply: parsed.enableAutoReply,
      };

      if (parsed.responseSubject !== undefined) settings.responseSubject = parsed.responseSubject;
      if (parsed.responseBodyPlainText !== undefined) settings.responseBodyPlainText = parsed.responseBodyPlainText;
      if (parsed.responseBodyHtml !== undefined) settings.responseBodyHtml = parsed.responseBodyHtml;
      if (parsed.restrictToContacts !== undefined) settings.restrictToContacts = parsed.restrictToContacts;
      if (parsed.restrictToDomain !== undefined) settings.restrictToDomain = parsed.restrictToDomain;
      if (parsed.startTime) settings.startTime = new Date(parsed.startTime).getTime().toString();
      if (parsed.endTime) settings.endTime = new Date(parsed.endTime).getTime().toString();

      const updated = await client.updateVacationSettings(settings);
      return {
        success: true,
        enableAutoReply: updated.enableAutoReply,
        responseSubject: updated.responseSubject,
        startTime: updated.startTime
          ? new Date(Number(updated.startTime)).toISOString()
          : undefined,
        endTime: updated.endTime
          ? new Date(Number(updated.endTime)).toISOString()
          : undefined,
      };
    }),
  );

  server.tool(
    'listSendAsAliases',
    'List all configured send-as email addresses for the Gmail account.',
    ListSendAsAliasesInputSchema.shape,
    wrapToolHandler(async () => {
      const aliases = await client.listSendAsAliases();
      return aliases.map((alias) => ({
        sendAsEmail: alias.sendAsEmail,
        displayName: alias.displayName,
        replyToAddress: alias.replyToAddress,
        isPrimary: alias.isPrimary,
        isDefault: alias.isDefault,
        verificationStatus: alias.verificationStatus,
      }));
    }),
  );

  server.tool(
    'listForwardingAddresses',
    'List all configured forwarding addresses for the Gmail account.',
    ListForwardingAddressesInputSchema.shape,
    wrapToolHandler(async () => {
      const addresses = await client.listForwardingAddresses();
      return addresses.map((addr) => ({
        forwardingEmail: addr.forwardingEmail,
        verificationStatus: addr.verificationStatus,
      }));
    }),
  );
}
