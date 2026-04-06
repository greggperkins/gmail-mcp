# @beam/gmail-mcp

The most complete Gmail MCP server. 42 tools across messages, threads, drafts, labels, attachments, filters, and settings. Thread-aware conversations. Smart reply construction. TypeScript. Stdio. Zero infrastructure.

Built by the team behind [BEAM](https://usebeam.sh) — the AI workspace that thinks with you.

Works with Claude Desktop, Cursor, Windsurf, Cline, BEAM, and any MCP-compatible client.

## Quick Start

### 1. Set up Google OAuth credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Desktop app**
6. Note your **Client ID** and **Client Secret**

### 2. Authenticate

```bash
npx @beam/gmail-mcp auth
```

This opens your browser for Google OAuth consent. Your token is saved to `~/.config/gmail-mcp/token.json`.

You can also provide credentials via environment variables:

```bash
GMAIL_MCP_CLIENT_ID="..." GMAIL_MCP_CLIENT_SECRET="..." npx @beam/gmail-mcp auth
```

### 3. Add to your MCP client

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@beam/gmail-mcp"]
    }
  }
}
```

**Cursor / Windsurf / Cline** — add the same config to your MCP settings.

**Container / hosted deployment** — pass the token as an environment variable:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "npx",
      "args": ["-y", "@beam/gmail-mcp"],
      "env": {
        "GMAIL_MCP_TOKEN_JSON": "{\"type\":\"authorized_user\",\"client_id\":\"...\",\"client_secret\":\"...\",\"refresh_token\":\"...\"}"
      }
    }
  }
}
```

## Tools (Phase 1)

### Messages

| Tool | Description |
|------|-------------|
| `listMessages` | List messages with optional query and label filters |
| `getMessage` | Get a complete message by ID with parsed body and headers |
| `searchMessages` | Search with Gmail query syntax or structured parameters |
| `sendMessage` | Send a new email (plain text or HTML) |
| `replyToMessage` | Reply to a message (auto-threads with correct headers) |

### Threads

| Tool | Description |
|------|-------------|
| `listThreads` | List conversation threads |
| `getThread` | Get full thread with all messages as a clean conversation |
| `searchThreads` | Search threads with query or structured parameters |

### Labels

| Tool | Description |
|------|-------------|
| `listLabels` | List all labels (system + user) with counts |

## Resources

| URI | Description |
|-----|-------------|
| `gmail://inbox` | Recent inbox messages with sender, subject, snippet |
| `gmail://profile` | Account email, total messages, total threads |

## Search Examples

The `searchMessages` and `searchThreads` tools accept both raw Gmail query strings and structured parameters:

```
// Raw query
{ "query": "from:boss@company.com after:2026/03/01 has:attachment" }

// Structured parameters
{ "from": "boss@company.com", "after": "2026/03/01", "hasAttachment": true }
```

## Configuration

### Token location

Tokens are stored at `$XDG_CONFIG_HOME/gmail-mcp/token.json` (defaults to `~/.config/gmail-mcp/token.json`).

### Environment variables

| Variable | Description |
|----------|-------------|
| `GMAIL_MCP_TOKEN_JSON` | Token JSON string (for containers) |
| `GMAIL_MCP_CLIENT_ID` | OAuth Client ID (for auth flow) |
| `GMAIL_MCP_CLIENT_SECRET` | OAuth Client Secret (for auth flow) |

## Privacy & Security

- **No telemetry.** Zero analytics, no usage tracking, no phone-home.
- **No content logging.** Email bodies and addresses are never written to logs.
- **Token security.** Token file is created with `0600` permissions.
- **Minimal scopes.** Only requests the Gmail API scopes needed for enabled tools.
- **Stateless.** No caching, no database, no temp files beyond the token.

## Development

```bash
npm install
npm run build
npm run dev     # watch mode
npm test
```

## License

MIT
