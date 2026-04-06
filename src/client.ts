import { google, type gmail_v1 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { GmailApiError } from './types.js';

export class GmailClient {
  private gmail: gmail_v1.Gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: 'v1', auth });
  }

  // ── Messages ──

  async listMessages(params: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    q?: string;
    includeSpamTrash?: boolean;
  }): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        labelIds: params.labelIds,
        q: params.q,
        includeSpamTrash: params.includeSpamTrash,
      });
      return {
        messages: (res.data.messages || []).map((m) => ({
          id: m.id!,
          threadId: m.threadId!,
        })),
        nextPageToken: res.data.nextPageToken || undefined,
        resultSizeEstimate: res.data.resultSizeEstimate || undefined,
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getMessage(
    messageId: string,
    format: 'full' | 'metadata' | 'minimal' = 'full',
    metadataHeaders?: string[],
  ): Promise<gmail_v1.Schema$Message> {
    try {
      const res = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format,
        metadataHeaders,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async sendMessage(raw: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    try {
      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      return {
        id: res.data.id!,
        threadId: res.data.threadId!,
        labelIds: res.data.labelIds || [],
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async sendMessageInThread(raw: string, threadId: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    try {
      const res = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId },
      });
      return {
        id: res.data.id!,
        threadId: res.data.threadId!,
        labelIds: res.data.labelIds || [],
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Threads ──

  async listThreads(params: {
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    q?: string;
    includeSpamTrash?: boolean;
  }): Promise<{
    threads: Array<{ id: string; snippet: string; historyId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    try {
      const res = await this.gmail.users.threads.list({
        userId: 'me',
        maxResults: params.maxResults,
        pageToken: params.pageToken,
        labelIds: params.labelIds,
        q: params.q,
        includeSpamTrash: params.includeSpamTrash,
      });
      return {
        threads: (res.data.threads || []).map((t) => ({
          id: t.id!,
          snippet: t.snippet || '',
          historyId: t.historyId || '',
        })),
        nextPageToken: res.data.nextPageToken || undefined,
        resultSizeEstimate: res.data.resultSizeEstimate || undefined,
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getThread(
    threadId: string,
    format: 'full' | 'metadata' | 'minimal' = 'full',
  ): Promise<gmail_v1.Schema$Thread> {
    try {
      const res = await this.gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Labels ──

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    try {
      const res = await this.gmail.users.labels.list({ userId: 'me' });
      return res.data.labels || [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Profile ──

  async getProfile(): Promise<gmail_v1.Schema$Profile> {
    try {
      const res = await this.gmail.users.getProfile({ userId: 'me' });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Error Handling ──

  private handleApiError(error: unknown): GmailApiError {
    if (error && typeof error === 'object' && 'response' in error) {
      const resp = (error as { response?: { status?: number; data?: { error?: { message?: string } } } }).response;
      const status = resp?.status;
      const message = resp?.data?.error?.message || (error instanceof Error ? error.message : String(error));

      if (status === 401) return new GmailApiError('AUTH_EXPIRED', `Authentication expired: ${message}`, true);
      if (status === 403) return new GmailApiError('PERMISSION_DENIED', `Permission denied: ${message}`, false);
      if (status === 404) return new GmailApiError('NOT_FOUND', `Not found: ${message}`, false);
      if (status === 429) return new GmailApiError('RATE_LIMITED', `Rate limited: ${message}`, true);
      if (status && status >= 500) return new GmailApiError('API_ERROR', `Gmail API error (${status}): ${message}`, true);
      return new GmailApiError('API_ERROR', `Gmail API error (${status}): ${message}`, false);
    }

    if (error instanceof Error) {
      return new GmailApiError('UNKNOWN', error.message, false);
    }

    return new GmailApiError('UNKNOWN', String(error), false);
  }
}
