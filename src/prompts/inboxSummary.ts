import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerInboxSummaryPrompt(server: McpServer): void {
  server.prompt(
    'gmail_inbox_summary',
    'Summarize my inbox — what\'s urgent, what can wait, what should I unsubscribe from?',
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please summarize my Gmail inbox. Here's what I'd like you to do:

1. First, use the \`listMessages\` tool with query "is:unread" to see my unread messages.
2. For each unread message, use \`getMessage\` to read the full content.
3. Then categorize the messages into:
   - **Urgent / Action Required**: Messages that need a response or action soon
   - **Important but not urgent**: Messages worth reading but can wait
   - **FYI / Low Priority**: Newsletters, notifications, updates that are informational only
   - **Unsubscribe Candidates**: Recurring emails I might want to unsubscribe from (use the \`unsubscribe\` tool to find unsubscribe mechanisms for these)

4. For each category, list the messages with sender, subject, and a one-line summary.
5. At the end, give me a recommended action plan: what to reply to first, what to archive, and what to unsubscribe from.`,
          },
        },
      ],
    }),
  );
}
