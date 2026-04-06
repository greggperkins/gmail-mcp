#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/auth.ts
import { OAuth2Client } from "google-auth-library";
import fs from "fs";
import http from "http";
import { URL } from "url";
import os from "os";
import path from "path";
import { exec } from "child_process";
import readline from "readline";

// src/types.ts
import { z } from "zod";
var TokenSchema = z.object({
  type: z.literal("authorized_user"),
  client_id: z.string(),
  client_secret: z.string(),
  refresh_token: z.string(),
  token_uri: z.string().url().optional().default("https://oauth2.googleapis.com/token")
});
var ListMessagesInputSchema = z.object({
  query: z.string().optional().describe("Gmail search query string"),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe("Maximum number of results to return"),
  labelIds: z.array(z.string()).optional().describe("Only return messages with these label IDs"),
  includeSpamTrash: z.boolean().optional().default(false).describe("Include messages from SPAM and TRASH"),
  pageToken: z.string().optional().describe("Page token from a previous list request")
});
var GetMessageInputSchema = z.object({
  messageId: z.string().describe("The ID of the message to retrieve"),
  format: z.enum(["full", "metadata", "minimal"]).optional().default("full").describe("The format to return the message in"),
  metadataHeaders: z.array(z.string()).optional().describe("When format is metadata, only include these headers")
});
var SearchMessagesInputSchema = z.object({
  query: z.string().optional().describe("Raw Gmail search query string"),
  from: z.string().optional().describe("Filter by sender email address"),
  to: z.string().optional().describe("Filter by recipient email address"),
  subject: z.string().optional().describe("Filter by subject text"),
  after: z.string().optional().describe("Only messages after this date (YYYY/MM/DD)"),
  before: z.string().optional().describe("Only messages before this date (YYYY/MM/DD)"),
  hasAttachment: z.boolean().optional().describe("Only messages with attachments"),
  labelIds: z.array(z.string()).optional().describe("Only return messages with these label IDs"),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe("Maximum number of results"),
  pageToken: z.string().optional().describe("Page token for pagination")
});
var SendMessageInputSchema = z.object({
  to: z.array(z.string()).min(1).describe("Recipient email addresses"),
  subject: z.string().describe("Email subject"),
  body: z.string().describe("Email body content"),
  cc: z.array(z.string()).optional().describe("CC recipients"),
  bcc: z.array(z.string()).optional().describe("BCC recipients"),
  bodyType: z.enum(["text", "html"]).optional().default("text").describe("Body content type")
});
var ReplyToMessageInputSchema = z.object({
  messageId: z.string().describe("The ID of the message to reply to"),
  body: z.string().describe("Reply body content"),
  replyAll: z.boolean().optional().default(false).describe("Reply to all recipients"),
  bodyType: z.enum(["text", "html"]).optional().default("text").describe("Body content type")
});
var ListThreadsInputSchema = z.object({
  query: z.string().optional().describe("Gmail search query string"),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe("Maximum number of results"),
  labelIds: z.array(z.string()).optional().describe("Only return threads with these label IDs"),
  includeSpamTrash: z.boolean().optional().default(false).describe("Include threads from SPAM and TRASH"),
  pageToken: z.string().optional().describe("Page token for pagination")
});
var GetThreadInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to retrieve"),
  format: z.enum(["full", "metadata", "minimal"]).optional().default("full").describe("The format to return messages in")
});
var SearchThreadsInputSchema = z.object({
  query: z.string().optional().describe("Raw Gmail search query string"),
  from: z.string().optional().describe("Filter by sender"),
  to: z.string().optional().describe("Filter by recipient"),
  subject: z.string().optional().describe("Filter by subject"),
  after: z.string().optional().describe("Only threads after this date (YYYY/MM/DD)"),
  before: z.string().optional().describe("Only threads before this date (YYYY/MM/DD)"),
  hasAttachment: z.boolean().optional().describe("Only threads with attachments"),
  maxResults: z.number().int().min(1).max(500).optional().default(20).describe("Maximum number of results"),
  pageToken: z.string().optional().describe("Page token for pagination")
});
var ListLabelsInputSchema = z.object({});
var GmailApiError = class extends Error {
  constructor(code, message, retryable) {
    super(message);
    this.code = code;
    this.retryable = retryable;
    this.name = "GmailApiError";
  }
  code;
  retryable;
};
function buildGmailQuery(params) {
  const parts = [];
  if (params.query) parts.push(params.query);
  if (params.from) parts.push(`from:${params.from}`);
  if (params.to) parts.push(`to:${params.to}`);
  if (params.subject) parts.push(`subject:${params.subject}`);
  if (params.after) parts.push(`after:${params.after}`);
  if (params.before) parts.push(`before:${params.before}`);
  if (params.hasAttachment) parts.push("has:attachment");
  return parts.join(" ");
}
function wrapToolHandler(fn) {
  return async (args) => {
    try {
      const result = await fn(args);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (error) {
      if (error instanceof GmailApiError) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              code: error.code,
              message: error.message,
              retryable: error.retryable
            })
          }],
          isError: true
        };
      }
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: true,
            code: "UNKNOWN",
            message: error instanceof Error ? error.message : String(error),
            retryable: false
          })
        }],
        isError: true
      };
    }
  };
}

// src/auth.ts
var SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic"
];
var REDIRECT_URI = "http://localhost:3000/oauth2callback";
function getTokenPath() {
  const xdg = process.env.XDG_CONFIG_HOME;
  const configDir = xdg || path.join(os.homedir(), ".config");
  return path.join(configDir, "gmail-mcp", "token.json");
}
function loadToken() {
  const envToken = process.env.GMAIL_MCP_TOKEN_JSON;
  if (envToken) {
    try {
      const parsed = JSON.parse(envToken);
      return TokenSchema.parse(parsed);
    } catch (e) {
      throw new Error(`Invalid GMAIL_MCP_TOKEN_JSON environment variable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const tokenPath = getTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `No token found. Run "npx @beam/gmail-mcp auth" to authenticate.
Expected token at: ${tokenPath}`
    );
  }
  try {
    const raw = fs.readFileSync(tokenPath, "utf-8");
    const parsed = JSON.parse(raw);
    return TokenSchema.parse(parsed);
  } catch (e) {
    throw new Error(`Invalid token file at ${tokenPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
function createOAuth2Client(token) {
  const client = new OAuth2Client({
    clientId: token.client_id,
    clientSecret: token.client_secret
  });
  client.setCredentials({
    refresh_token: token.refresh_token
  });
  return client;
}
function getAuthenticatedClient() {
  const token = loadToken();
  return createOAuth2Client(token);
}
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} "${url}"`);
}
function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
async function runAuthFlow(clientId, clientSecret) {
  const oAuth2Client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI
  });
  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES
  });
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith("/oauth2callback")) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const url = new URL(req.url, "http://localhost:3000");
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400);
          res.end(`Authorization error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }
        if (!code) {
          res.writeHead(400);
          res.end("No authorization code received");
          server.close();
          reject(new Error("No authorization code received"));
          return;
        }
        const { tokens } = await oAuth2Client.getToken(code);
        if (!tokens.refresh_token) {
          res.writeHead(500);
          res.end("No refresh token received. Try revoking access and re-authenticating.");
          server.close();
          reject(new Error("No refresh token received"));
          return;
        }
        const tokenData = {
          type: "authorized_user",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
          token_uri: "https://oauth2.googleapis.com/token"
        };
        const tokenPath = getTokenPath();
        const tokenDir = path.dirname(tokenPath);
        fs.mkdirSync(tokenDir, { recursive: true });
        fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), { mode: 384 });
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>");
        console.error(`
Token saved to: ${tokenPath}`);
        console.error("Authentication complete. You can now use @beam/gmail-mcp as an MCP server.");
        server.close();
        resolve();
      } catch (e) {
        res.writeHead(500);
        res.end("Internal error");
        server.close();
        reject(e);
      }
    });
    server.listen(3e3, () => {
      console.error("\nOpening browser for Google OAuth consent...");
      console.error(`If the browser doesn't open, visit:
${authorizeUrl}
`);
      openBrowser(authorizeUrl);
    });
  });
}
async function runAuthCli() {
  console.error("@beam/gmail-mcp \u2014 Authentication\n");
  let clientId = process.env.GMAIL_MCP_CLIENT_ID || "";
  let clientSecret = process.env.GMAIL_MCP_CLIENT_SECRET || "";
  if (!clientId) {
    clientId = await prompt("Enter your Google OAuth Client ID: ");
  }
  if (!clientSecret) {
    clientSecret = await prompt("Enter your Google OAuth Client Secret: ");
  }
  if (!clientId || !clientSecret) {
    console.error("Error: Client ID and Client Secret are required.");
    console.error("Set GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET environment variables,");
    console.error("or enter them when prompted.");
    process.exit(1);
  }
  await runAuthFlow(clientId, clientSecret);
}

// src/client.ts
import { google } from "googleapis";
var GmailClient = class {
  gmail;
  constructor(auth) {
    this.gmail = google.gmail({ version: "v1", auth });
  }
  // ── Messages ──
  async listMessages(params) {
    try {
      const res = await this.gmail.users.messages.list({
        userId: "me",
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        labelIds: params.labelIds,
        q: params.q,
        includeSpamTrash: params.includeSpamTrash
      });
      return {
        messages: (res.data.messages || []).map((m) => ({
          id: m.id,
          threadId: m.threadId
        })),
        nextPageToken: res.data.nextPageToken || void 0,
        resultSizeEstimate: res.data.resultSizeEstimate || void 0
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  async getMessage(messageId, format = "full", metadataHeaders) {
    try {
      const res = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format,
        metadataHeaders
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  async sendMessage(raw) {
    try {
      const res = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: { raw }
      });
      return {
        id: res.data.id,
        threadId: res.data.threadId,
        labelIds: res.data.labelIds || []
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  async sendMessageInThread(raw, threadId) {
    try {
      const res = await this.gmail.users.messages.send({
        userId: "me",
        requestBody: { raw, threadId }
      });
      return {
        id: res.data.id,
        threadId: res.data.threadId,
        labelIds: res.data.labelIds || []
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  // ── Threads ──
  async listThreads(params) {
    try {
      const res = await this.gmail.users.threads.list({
        userId: "me",
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        labelIds: params.labelIds,
        q: params.q,
        includeSpamTrash: params.includeSpamTrash
      });
      return {
        threads: (res.data.threads || []).map((t) => ({
          id: t.id,
          snippet: t.snippet || "",
          historyId: t.historyId || ""
        })),
        nextPageToken: res.data.nextPageToken || void 0,
        resultSizeEstimate: res.data.resultSizeEstimate || void 0
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  async getThread(threadId, format = "full") {
    try {
      const res = await this.gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  // ── Labels ──
  async listLabels() {
    try {
      const res = await this.gmail.users.labels.list({ userId: "me" });
      return res.data.labels || [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  // ── Profile ──
  async getProfile() {
    try {
      const res = await this.gmail.users.getProfile({ userId: "me" });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }
  // ── Error Handling ──
  handleApiError(error) {
    if (error && typeof error === "object" && "response" in error) {
      const resp = error.response;
      const status = resp?.status;
      const message = resp?.data?.error?.message || (error instanceof Error ? error.message : String(error));
      if (status === 401) return new GmailApiError("AUTH_EXPIRED", `Authentication expired: ${message}`, true);
      if (status === 403) return new GmailApiError("PERMISSION_DENIED", `Permission denied: ${message}`, false);
      if (status === 404) return new GmailApiError("NOT_FOUND", `Not found: ${message}`, false);
      if (status === 429) return new GmailApiError("RATE_LIMITED", `Rate limited: ${message}`, true);
      if (status && status >= 500) return new GmailApiError("API_ERROR", `Gmail API error (${status}): ${message}`, true);
      return new GmailApiError("API_ERROR", `Gmail API error (${status}): ${message}`, false);
    }
    if (error instanceof Error) {
      return new GmailApiError("UNKNOWN", error.message, false);
    }
    return new GmailApiError("UNKNOWN", String(error), false);
  }
};

// src/parser.ts
import { convert } from "html-to-text";
function getHeader(headers, name) {
  if (!headers) return "";
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || "";
}
function decodeBase64Url(data) {
  return Buffer.from(data, "base64url").toString("utf-8");
}
function htmlToText(html) {
  return convert(html, {
    wordwrap: 120,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" }
    ]
  });
}
function extractBody(payload) {
  if (!payload) return { text: "" };
  const mimeType = payload.mimeType || "";
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (mimeType === "text/plain") {
      return { text: decoded };
    }
    if (mimeType === "text/html") {
      return { text: htmlToText(decoded), html: decoded };
    }
    return { text: decoded };
  }
  if (payload.parts && payload.parts.length > 0) {
    if (mimeType === "multipart/alternative") {
      let textResult = null;
      let htmlResult = null;
      for (const part of payload.parts) {
        const partMime = part.mimeType || "";
        if (partMime === "text/plain" && part.body?.data) {
          textResult = { text: decodeBase64Url(part.body.data) };
        } else if (partMime === "text/html" && part.body?.data) {
          const html = decodeBase64Url(part.body.data);
          htmlResult = { text: htmlToText(html), html };
        } else if (partMime.startsWith("multipart/")) {
          const nested = extractBody(part);
          if (nested.text) {
            if (partMime === "multipart/alternative") {
              return nested;
            }
            if (!textResult) textResult = nested;
          }
        }
      }
      if (textResult) {
        return { ...textResult, html: htmlResult?.html };
      }
      if (htmlResult) return htmlResult;
    }
    let textBody = "";
    let htmlBody;
    for (const part of payload.parts) {
      const partMime = part.mimeType || "";
      if (partMime === "text/plain" && part.body?.data && !textBody) {
        textBody = decodeBase64Url(part.body.data);
      } else if (partMime === "text/html" && part.body?.data && !htmlBody) {
        htmlBody = decodeBase64Url(part.body.data);
      } else if (partMime.startsWith("multipart/")) {
        const nested = extractBody(part);
        if (!textBody && nested.text) textBody = nested.text;
        if (!htmlBody && nested.html) htmlBody = nested.html;
      }
    }
    if (textBody) {
      return { text: textBody, html: htmlBody };
    }
    if (htmlBody) {
      return { text: htmlToText(htmlBody), html: htmlBody };
    }
  }
  return { text: "" };
}
function extractAttachments(payload) {
  const attachments = [];
  if (!payload) return attachments;
  function walk(part) {
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        filename: part.filename,
        mimeType: part.mimeType || "application/octet-stream",
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId
      });
    }
    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }
  walk(payload);
  return attachments;
}
function parseAddressList(raw) {
  if (!raw) return [];
  return raw.split(",").map((addr) => addr.trim()).filter(Boolean);
}
function parseMessage(message) {
  const headers = message.payload?.headers;
  const body = extractBody(message.payload);
  const attachments = extractAttachments(message.payload);
  return {
    id: message.id || "",
    threadId: message.threadId || "",
    labelIds: message.labelIds || [],
    snippet: message.snippet || "",
    from: getHeader(headers, "From"),
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    bcc: parseAddressList(getHeader(headers, "Bcc")),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    messageId: getHeader(headers, "Message-ID"),
    inReplyTo: getHeader(headers, "In-Reply-To"),
    references: getHeader(headers, "References"),
    body: body.text,
    bodyHtml: body.html,
    hasAttachments: attachments.length > 0,
    attachments
  };
}
function parseThread(thread) {
  const messages = (thread.messages || []).map(parseMessage);
  const participantSet = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    if (msg.from) participantSet.add(msg.from);
    for (const addr of msg.to) participantSet.add(addr);
    for (const addr of msg.cc) participantSet.add(addr);
  }
  const allLabelIds = /* @__PURE__ */ new Set();
  for (const msg of messages) {
    for (const labelId of msg.labelIds) {
      allLabelIds.add(labelId);
    }
  }
  return {
    id: thread.id || "",
    subject: messages[0]?.subject || "",
    messageCount: messages.length,
    participants: Array.from(participantSet),
    messages,
    snippet: thread.snippet || messages[messages.length - 1]?.snippet || "",
    labelIds: Array.from(allLabelIds)
  };
}

// src/mime.ts
function encodeSubject(subject) {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
}
function buildRawMime(headers, body) {
  const headerStr = Object.entries(headers).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  const mime = `${headerStr}\r
\r
${body}`;
  return Buffer.from(mime).toString("base64url");
}
function quoteBody(body, isHtml) {
  if (isHtml) {
    return `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${body}</blockquote>`;
  }
  return body.split("\n").map((line) => `> ${line}`).join("\n");
}
function buildMimeMessage(params) {
  const contentType = params.isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  const headers = {
    "MIME-Version": "1.0",
    "Content-Type": contentType,
    To: params.to.join(", "),
    Subject: encodeSubject(params.subject)
  };
  if (params.cc?.length) {
    headers["Cc"] = params.cc.join(", ");
  }
  if (params.bcc?.length) {
    headers["Bcc"] = params.bcc.join(", ");
  }
  return buildRawMime(headers, params.body);
}
function buildReplyMimeMessage(params) {
  const { originalMessage, body, replyAll, isHtml } = params;
  const userEmail = params.userEmail?.toLowerCase();
  let toAddrs;
  let ccAddrs = [];
  if (replyAll) {
    toAddrs = [originalMessage.from];
    const allRecipients = [...originalMessage.to, ...originalMessage.cc];
    const fromLower = originalMessage.from.toLowerCase();
    ccAddrs = allRecipients.filter((addr) => {
      const lower = addr.toLowerCase();
      if (lower === fromLower) return false;
      if (userEmail && lower.includes(userEmail)) return false;
      return true;
    });
  } else {
    toAddrs = [originalMessage.from];
  }
  let subject = originalMessage.subject;
  if (!subject.match(/^Re:/i)) {
    subject = `Re: ${subject}`;
  }
  const quotedOriginal = quoteBody(
    isHtml ? originalMessage.bodyHtml || originalMessage.body : originalMessage.body,
    !!isHtml
  );
  const separator = isHtml ? `<br><br>On ${originalMessage.date}, ${originalMessage.from} wrote:<br>` : `

On ${originalMessage.date}, ${originalMessage.from} wrote:
`;
  const fullBody = `${body}${separator}${quotedOriginal}`;
  const contentType = isHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
  const headers = {
    "MIME-Version": "1.0",
    "Content-Type": contentType,
    To: toAddrs.join(", "),
    Subject: encodeSubject(subject),
    "In-Reply-To": originalMessage.messageId,
    "References": originalMessage.references ? `${originalMessage.references} ${originalMessage.messageId}` : originalMessage.messageId
  };
  if (ccAddrs.length > 0) {
    headers["Cc"] = ccAddrs.join(", ");
  }
  return {
    raw: buildRawMime(headers, fullBody),
    threadId: originalMessage.threadId
  };
}

// src/tools/messages.ts
function registerMessageTools(server, client) {
  server.tool(
    "listMessages",
    "List Gmail messages with optional query and label filters. Returns message IDs and snippets for fast browsing. Use getMessage to read full content.",
    ListMessagesInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListMessagesInputSchema.parse(args);
      const result = await client.listMessages({
        q: parsed.query,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        includeSpamTrash: parsed.includeSpamTrash,
        pageToken: parsed.pageToken
      });
      const messagesWithSnippets = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, "metadata", ["From", "Subject", "Date"]);
            const headers = msg.payload?.headers || [];
            const getH = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
            return {
              id: m.id,
              threadId: m.threadId,
              from: getH("From"),
              subject: getH("Subject"),
              date: getH("Date"),
              snippet: msg.snippet || ""
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        })
      );
      return {
        messages: messagesWithSnippets,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate
      };
    })
  );
  server.tool(
    "getMessage",
    "Get a complete Gmail message by ID, including parsed body text, headers, and attachment info.",
    GetMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetMessageInputSchema.parse(args);
      const raw = await client.getMessage(parsed.messageId, parsed.format, parsed.metadataHeaders);
      return parseMessage(raw);
    })
  );
  server.tool(
    "searchMessages",
    "Search Gmail messages using a query string or structured parameters (from, to, subject, date range, hasAttachment). Returns matching messages with metadata.",
    SearchMessagesInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SearchMessagesInputSchema.parse(args);
      const q = buildGmailQuery({
        query: parsed.query,
        from: parsed.from,
        to: parsed.to,
        subject: parsed.subject,
        after: parsed.after,
        before: parsed.before,
        hasAttachment: parsed.hasAttachment
      });
      const result = await client.listMessages({
        q: q || void 0,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        pageToken: parsed.pageToken
      });
      const messagesWithMeta = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, "metadata", ["From", "To", "Subject", "Date"]);
            const headers = msg.payload?.headers || [];
            const getH = (name) => headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
            return {
              id: m.id,
              threadId: m.threadId,
              from: getH("From"),
              to: getH("To"),
              subject: getH("Subject"),
              date: getH("Date"),
              snippet: msg.snippet || "",
              labelIds: msg.labelIds || []
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        })
      );
      return {
        messages: messagesWithMeta,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate
      };
    })
  );
  server.tool(
    "sendMessage",
    "Send a new Gmail message. Supports plain text or HTML body, CC, and BCC recipients.",
    SendMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = SendMessageInputSchema.parse(args);
      const raw = buildMimeMessage({
        to: parsed.to,
        subject: parsed.subject,
        body: parsed.body,
        cc: parsed.cc,
        bcc: parsed.bcc,
        isHtml: parsed.bodyType === "html"
      });
      const result = await client.sendMessage(raw);
      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        labelIds: result.labelIds
      };
    })
  );
  server.tool(
    "replyToMessage",
    "Reply to an existing Gmail message. Automatically threads into the conversation with correct In-Reply-To and References headers. Supports reply-all.",
    ReplyToMessageInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ReplyToMessageInputSchema.parse(args);
      const rawOriginal = await client.getMessage(parsed.messageId, "full");
      const original = parseMessage(rawOriginal);
      const profile = await client.getProfile();
      const userEmail = profile.emailAddress || void 0;
      const { raw, threadId } = buildReplyMimeMessage({
        originalMessage: original,
        body: parsed.body,
        replyAll: parsed.replyAll,
        isHtml: parsed.bodyType === "html",
        userEmail
      });
      const result = await client.sendMessageInThread(raw, threadId);
      return {
        success: true,
        messageId: result.id,
        threadId: result.threadId,
        labelIds: result.labelIds
      };
    })
  );
}

// src/tools/threads.ts
function registerThreadTools(server, client) {
  server.tool(
    "listThreads",
    "List Gmail conversation threads with optional query and label filters. Returns thread IDs and snippets.",
    ListThreadsInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = ListThreadsInputSchema.parse(args);
      const result = await client.listThreads({
        q: parsed.query,
        maxResults: parsed.maxResults,
        labelIds: parsed.labelIds,
        includeSpamTrash: parsed.includeSpamTrash,
        pageToken: parsed.pageToken
      });
      return {
        threads: result.threads,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate
      };
    })
  );
  server.tool(
    "getThread",
    "Get a full Gmail conversation thread with all messages parsed into a clean conversation view. Shows participants, message bodies (with quoted content separated), and attachment metadata.",
    GetThreadInputSchema.shape,
    wrapToolHandler(async (args) => {
      const parsed = GetThreadInputSchema.parse(args);
      const rawThread = await client.getThread(parsed.threadId, parsed.format);
      return parseThread(rawThread);
    })
  );
  server.tool(
    "searchThreads",
    "Search Gmail threads using a query string or structured parameters (from, to, subject, date range, hasAttachment). Returns matching thread IDs.",
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
        hasAttachment: parsed.hasAttachment
      });
      const result = await client.listThreads({
        q: q || void 0,
        maxResults: parsed.maxResults,
        pageToken: parsed.pageToken
      });
      return {
        threads: result.threads,
        nextPageToken: result.nextPageToken,
        resultSizeEstimate: result.resultSizeEstimate
      };
    })
  );
}

// src/tools/labels.ts
function registerLabelTools(server, client) {
  server.tool(
    "listLabels",
    "List all Gmail labels (system and user-created) with message and thread counts.",
    ListLabelsInputSchema.shape,
    wrapToolHandler(async () => {
      const labels = await client.listLabels();
      return labels.map((label) => ({
        id: label.id,
        name: label.name,
        type: label.type,
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
        color: label.color
      }));
    })
  );
}

// src/resources/inbox.ts
function registerInboxResource(server, client) {
  server.resource(
    "inbox",
    "gmail://inbox",
    {
      description: "Current inbox summary \u2014 recent messages with sender, subject, and snippet",
      mimeType: "application/json"
    },
    async (uri) => {
      const result = await client.listMessages({
        labelIds: ["INBOX"],
        maxResults: 20
      });
      const messages = await Promise.all(
        result.messages.map(async (m) => {
          try {
            const msg = await client.getMessage(m.id, "metadata", ["From", "Subject", "Date"]);
            const headers = msg.payload?.headers || [];
            return {
              id: m.id,
              threadId: m.threadId,
              from: getHeader(headers, "From"),
              subject: getHeader(headers, "Subject"),
              date: getHeader(headers, "Date"),
              snippet: msg.snippet || "",
              labelIds: msg.labelIds || []
            };
          } catch {
            return { id: m.id, threadId: m.threadId };
          }
        })
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ messages, total: result.resultSizeEstimate }, null, 2)
          }
        ]
      };
    }
  );
}

// src/resources/profile.ts
function registerProfileResource(server, client) {
  server.resource(
    "profile",
    "gmail://profile",
    {
      description: "Gmail account profile \u2014 email address, total messages, total threads, history ID",
      mimeType: "application/json"
    },
    async (uri) => {
      const profile = await client.getProfile();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                emailAddress: profile.emailAddress,
                messagesTotal: profile.messagesTotal,
                threadsTotal: profile.threadsTotal,
                historyId: profile.historyId
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}

// src/index.ts
async function main() {
  if (process.argv[2] === "auth") {
    await runAuthCli();
    return;
  }
  const oauth2Client = getAuthenticatedClient();
  const gmailClient = new GmailClient(oauth2Client);
  const server = new McpServer(
    { name: "@beam/gmail-mcp", version: "0.1.0" },
    {
      instructions: "Gmail MCP server providing full email access. Use listMessages or searchMessages to find emails, getMessage to read full content, sendMessage to compose, and replyToMessage to reply. Use getThread for conversation view. Use listLabels to see available labels."
    }
  );
  registerMessageTools(server, gmailClient);
  registerThreadTools(server, gmailClient);
  registerLabelTools(server, gmailClient);
  registerInboxResource(server, gmailClient);
  registerProfileResource(server, gmailClient);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
//# sourceMappingURL=index.js.map