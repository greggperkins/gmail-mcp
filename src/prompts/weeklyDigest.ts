import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerWeeklyDigestPrompt(server: McpServer): void {
  server.prompt(
    'gmail_weekly_digest',
    'Give me a digest of important emails from the past week, grouped by sender/topic',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please create a weekly email digest for me. Here's what to do:

1. Use \`searchMessages\` with query "newer_than:7d" to get messages from the past 7 days.
2. For the most important-looking messages, use \`getMessage\` to read their content.
3. Group the messages by:
   - **By Sender**: Group messages from the same sender together, showing count and key subjects
   - **By Thread/Topic**: Identify ongoing conversations and summarize their progression
   - **Action Items**: Messages that contain requests, deadlines, or questions directed at me

4. Present the digest in this format:
   - **Top Priority**: Threads/messages that need my attention most
   - **Conversations in Progress**: Active threads with recent replies
   - **Informational**: Updates, newsletters, and notifications
   - **Stats**: Total messages received, unique senders, busiest day

5. End with specific recommendations: which threads to follow up on and any approaching deadlines.`,
          },
        },
      ],
    }),
  );
}
