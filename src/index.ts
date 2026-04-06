import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getAuthenticatedClient, runAuthCli } from './auth.js';
import { GmailClient } from './client.js';
import { registerMessageTools } from './tools/messages.js';
import { registerThreadTools } from './tools/threads.js';
import { registerLabelTools } from './tools/labels.js';
import { registerDraftTools } from './tools/drafts.js';
import { registerAttachmentTools } from './tools/attachments.js';
import { registerFilterTools } from './tools/filters.js';
import { registerSettingsTools } from './tools/settings.js';
import { registerUtilityTools } from './tools/utilities.js';
import { registerInboxResource } from './resources/inbox.js';
import { registerProfileResource } from './resources/profile.js';
import { registerLabelsResource } from './resources/labels.js';
import { registerUnreadResource } from './resources/unread.js';
import { registerInboxSummaryPrompt } from './prompts/inboxSummary.js';
import { registerDraftReplyPrompt } from './prompts/draftReply.js';
import { registerWeeklyDigestPrompt } from './prompts/weeklyDigest.js';

async function main(): Promise<void> {
  // Handle auth subcommand
  if (process.argv[2] === 'auth') {
    await runAuthCli();
    return;
  }

  // Initialize Gmail client
  const oauth2Client = getAuthenticatedClient();
  const gmailClient = new GmailClient(oauth2Client);

  // Create MCP server
  const server = new McpServer(
    { name: '@beam/gmail-mcp', version: '0.1.0' },
    {
      instructions:
        'Gmail MCP server providing full email access. Use listMessages or searchMessages to find emails, getMessage to read full content, sendMessage to compose, and replyToMessage to reply. Use getThread for conversation view. Use listLabels to see available labels.',
    },
  );

  // Register tools
  registerMessageTools(server, gmailClient);
  registerThreadTools(server, gmailClient);
  registerLabelTools(server, gmailClient);
  registerDraftTools(server, gmailClient);
  registerAttachmentTools(server, gmailClient);
  registerFilterTools(server, gmailClient);
  registerSettingsTools(server, gmailClient);
  registerUtilityTools(server, gmailClient);

  // Register resources
  registerInboxResource(server, gmailClient);
  registerProfileResource(server, gmailClient);
  registerLabelsResource(server, gmailClient);
  registerUnreadResource(server, gmailClient);

  // Register prompts
  registerInboxSummaryPrompt(server);
  registerDraftReplyPrompt(server);
  registerWeeklyDigestPrompt(server);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
