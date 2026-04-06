import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GmailClient } from '../client.js';

export function registerProfileResource(server: McpServer, client: GmailClient): void {
  server.resource(
    'profile',
    'gmail://profile',
    {
      description: 'Gmail account profile — email address, total messages, total threads, history ID',
      mimeType: 'application/json',
    },
    async (uri) => {
      const profile = await client.getProfile();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                emailAddress: profile.emailAddress,
                messagesTotal: profile.messagesTotal,
                threadsTotal: profile.threadsTotal,
                historyId: profile.historyId,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
