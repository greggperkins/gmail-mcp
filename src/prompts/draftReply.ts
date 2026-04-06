import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDraftReplyPrompt(server: McpServer): void {
  server.prompt(
    'gmail_draft_reply',
    'Draft a reply to the most recent message from a specific sender in a given tone',
    {
      sender: z.string().describe('Email address or name of the sender to reply to'),
      tone: z.string().optional().default('professional').describe('Tone of the reply (e.g. professional, casual, friendly, formal)'),
    },
    async (args) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please help me draft a reply to the most recent email from "${args.sender}". Here's what to do:

1. Use \`searchMessages\` with from:"${args.sender}" to find the most recent message from this sender.
2. Use \`getMessage\` to read the full content of their most recent message.
3. Draft a thoughtful reply in a **${args.tone}** tone that:
   - Addresses the key points in their message
   - Is concise but complete
   - Matches the ${args.tone} tone requested
4. Show me the draft reply text.
5. Ask if I'd like to:
   - Send it immediately (using \`replyToMessage\`)
   - Save it as a draft (using \`createDraft\`)
   - Modify it first`,
          },
        },
      ],
    }),
  );
}
