import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs';
import http from 'node:http';
import { URL } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { exec } from 'node:child_process';
import readline from 'node:readline';
import { TokenSchema, type Token } from './types.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.settings.basic',
];

const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

export function getTokenPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const configDir = xdg || path.join(os.homedir(), '.config');
  return path.join(configDir, 'gmail-mcp', 'token.json');
}

export function loadToken(): Token {
  // Check env var first
  const envToken = process.env.GMAIL_MCP_TOKEN_JSON;
  if (envToken) {
    try {
      const parsed = JSON.parse(envToken);
      return TokenSchema.parse(parsed);
    } catch (e) {
      throw new Error(`Invalid GMAIL_MCP_TOKEN_JSON environment variable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Read from file
  const tokenPath = getTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `No token found. Run "npx @beam/gmail-mcp auth" to authenticate.\nExpected token at: ${tokenPath}`,
    );
  }

  try {
    const raw = fs.readFileSync(tokenPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return TokenSchema.parse(parsed);
  } catch (e) {
    throw new Error(`Invalid token file at ${tokenPath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function createOAuth2Client(token: Token): OAuth2Client {
  const client = new OAuth2Client({
    clientId: token.client_id,
    clientSecret: token.client_secret,
  });
  client.setCredentials({
    refresh_token: token.refresh_token,
  });
  return client;
}

export function getAuthenticatedClient(): OAuth2Client {
  const token = loadToken();
  return createOAuth2Client(token);
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? 'open' :
    platform === 'win32' ? 'start' :
    'xdg-open';
  exec(`${cmd} "${url}"`);
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function runAuthFlow(clientId: string, clientSecret: string): Promise<void> {
  const oAuth2Client = new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
  });

  const authorizeUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  return new Promise<void>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url?.startsWith('/oauth2callback')) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const url = new URL(req.url, 'http://localhost:3000');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400);
          res.end(`Authorization error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end('No authorization code received');
          server.close();
          reject(new Error('No authorization code received'));
          return;
        }

        const { tokens } = await oAuth2Client.getToken(code);

        if (!tokens.refresh_token) {
          res.writeHead(500);
          res.end('No refresh token received. Try revoking access and re-authenticating.');
          server.close();
          reject(new Error('No refresh token received'));
          return;
        }

        // Write token file
        const tokenData: Token = {
          type: 'authorized_user',
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
          token_uri: 'https://oauth2.googleapis.com/token',
        };

        const tokenPath = getTokenPath();
        const tokenDir = path.dirname(tokenPath);
        fs.mkdirSync(tokenDir, { recursive: true });
        fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), { mode: 0o600 });

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authentication successful!</h1><p>You can close this window.</p></body></html>');

        console.error(`\nToken saved to: ${tokenPath}`);
        console.error('Authentication complete. You can now use @beam/gmail-mcp as an MCP server.');

        server.close();
        resolve();
      } catch (e) {
        res.writeHead(500);
        res.end('Internal error');
        server.close();
        reject(e);
      }
    });

    server.listen(3000, () => {
      console.error('\nOpening browser for Google OAuth consent...');
      console.error(`If the browser doesn't open, visit:\n${authorizeUrl}\n`);
      openBrowser(authorizeUrl);
    });
  });
}

export async function runAuthCli(): Promise<void> {
  console.error('@beam/gmail-mcp — Authentication\n');

  let clientId = process.env.GMAIL_MCP_CLIENT_ID || '';
  let clientSecret = process.env.GMAIL_MCP_CLIENT_SECRET || '';

  if (!clientId) {
    clientId = await prompt('Enter your Google OAuth Client ID: ');
  }
  if (!clientSecret) {
    clientSecret = await prompt('Enter your Google OAuth Client Secret: ');
  }

  if (!clientId || !clientSecret) {
    console.error('Error: Client ID and Client Secret are required.');
    console.error('Set GMAIL_MCP_CLIENT_ID and GMAIL_MCP_CLIENT_SECRET environment variables,');
    console.error('or enter them when prompted.');
    process.exit(1);
  }

  await runAuthFlow(clientId, clientSecret);
}
