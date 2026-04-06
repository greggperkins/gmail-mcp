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

  async trashMessage(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.trash({ userId: 'me', id: messageId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async untrashMessage(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.untrash({ userId: 'me', id: messageId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.delete({ userId: 'me', id: messageId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async batchModifyMessages(params: {
    ids: string[];
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<void> {
    try {
      await this.gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: params.ids,
          addLabelIds: params.addLabelIds,
          removeLabelIds: params.removeLabelIds,
        },
      });
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

  async trashThread(threadId: string): Promise<void> {
    try {
      await this.gmail.users.threads.trash({ userId: 'me', id: threadId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async untrashThread(threadId: string): Promise<void> {
    try {
      await this.gmail.users.threads.untrash({ userId: 'me', id: threadId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async modifyThread(params: {
    threadId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }): Promise<void> {
    try {
      await this.gmail.users.threads.modify({
        userId: 'me',
        id: params.threadId,
        requestBody: {
          addLabelIds: params.addLabelIds,
          removeLabelIds: params.removeLabelIds,
        },
      });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Drafts ──

  async listDrafts(params: {
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    drafts: Array<{ id: string; messageId: string }>;
    nextPageToken?: string;
    resultSizeEstimate?: number;
  }> {
    try {
      const res = await this.gmail.users.drafts.list({
        userId: 'me',
        maxResults: params.maxResults,
        pageToken: params.pageToken,
      });
      return {
        drafts: (res.data.drafts || []).map((d) => ({
          id: d.id!,
          messageId: d.message?.id || '',
        })),
        nextPageToken: res.data.nextPageToken || undefined,
        resultSizeEstimate: res.data.resultSizeEstimate || undefined,
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getDraft(
    draftId: string,
    format: 'full' | 'metadata' | 'minimal' = 'full',
  ): Promise<gmail_v1.Schema$Draft> {
    try {
      const res = await this.gmail.users.drafts.get({
        userId: 'me',
        id: draftId,
        format,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async createDraft(raw: string, threadId?: string): Promise<{ id: string; messageId: string }> {
    try {
      const message: gmail_v1.Schema$Message = { raw };
      if (threadId) message.threadId = threadId;
      const res = await this.gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message },
      });
      return {
        id: res.data.id!,
        messageId: res.data.message?.id || '',
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async updateDraft(draftId: string, raw: string): Promise<{ id: string; messageId: string }> {
    try {
      const res = await this.gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: { message: { raw } },
      });
      return {
        id: res.data.id!,
        messageId: res.data.message?.id || '',
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async sendDraft(draftId: string): Promise<{ id: string; threadId: string; labelIds: string[] }> {
    try {
      const res = await this.gmail.users.drafts.send({
        userId: 'me',
        requestBody: { id: draftId },
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

  // ── Labels ──

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    try {
      const res = await this.gmail.users.labels.list({ userId: 'me' });
      return res.data.labels || [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getLabel(labelId: string): Promise<gmail_v1.Schema$Label> {
    try {
      const res = await this.gmail.users.labels.get({ userId: 'me', id: labelId });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async createLabel(params: {
    name: string;
    labelListVisibility?: string;
    messageListVisibility?: string;
    backgroundColor?: string;
    textColor?: string;
  }): Promise<gmail_v1.Schema$Label> {
    try {
      const requestBody: gmail_v1.Schema$Label = {
        name: params.name,
        labelListVisibility: params.labelListVisibility,
        messageListVisibility: params.messageListVisibility,
      };
      if (params.backgroundColor || params.textColor) {
        requestBody.color = {
          backgroundColor: params.backgroundColor,
          textColor: params.textColor,
        };
      }
      const res = await this.gmail.users.labels.create({
        userId: 'me',
        requestBody,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async updateLabel(
    labelId: string,
    params: {
      name?: string;
      labelListVisibility?: string;
      messageListVisibility?: string;
      backgroundColor?: string;
      textColor?: string;
    },
  ): Promise<gmail_v1.Schema$Label> {
    try {
      const requestBody: gmail_v1.Schema$Label = { id: labelId };
      if (params.name !== undefined) requestBody.name = params.name;
      if (params.labelListVisibility !== undefined) requestBody.labelListVisibility = params.labelListVisibility;
      if (params.messageListVisibility !== undefined) requestBody.messageListVisibility = params.messageListVisibility;
      if (params.backgroundColor !== undefined || params.textColor !== undefined) {
        requestBody.color = {
          backgroundColor: params.backgroundColor,
          textColor: params.textColor,
        };
      }
      const res = await this.gmail.users.labels.update({
        userId: 'me',
        id: labelId,
        requestBody,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async deleteLabel(labelId: string): Promise<void> {
    try {
      await this.gmail.users.labels.delete({ userId: 'me', id: labelId });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Attachments ──

  async getAttachment(
    messageId: string,
    attachmentId: string,
  ): Promise<{ data: string; size: number }> {
    try {
      const res = await this.gmail.users.messages.attachments.get({
        userId: 'me',
        messageId,
        id: attachmentId,
      });
      return {
        data: res.data.data || '',
        size: res.data.size || 0,
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Filters ──

  async listFilters(): Promise<gmail_v1.Schema$Filter[]> {
    try {
      const res = await this.gmail.users.settings.filters.list({ userId: 'me' });
      return res.data.filter || [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getFilter(filterId: string): Promise<gmail_v1.Schema$Filter> {
    try {
      const res = await this.gmail.users.settings.filters.get({
        userId: 'me',
        id: filterId,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async createFilter(params: {
    criteria: gmail_v1.Schema$FilterCriteria;
    action: gmail_v1.Schema$FilterAction;
  }): Promise<gmail_v1.Schema$Filter> {
    try {
      const res = await this.gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: {
          criteria: params.criteria,
          action: params.action,
        },
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async deleteFilter(filterId: string): Promise<void> {
    try {
      await this.gmail.users.settings.filters.delete({
        userId: 'me',
        id: filterId,
      });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // ── Settings ──

  async getVacationSettings(): Promise<gmail_v1.Schema$VacationSettings> {
    try {
      const res = await this.gmail.users.settings.getVacation({ userId: 'me' });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async updateVacationSettings(
    settings: gmail_v1.Schema$VacationSettings,
  ): Promise<gmail_v1.Schema$VacationSettings> {
    try {
      const res = await this.gmail.users.settings.updateVacation({
        userId: 'me',
        requestBody: settings,
      });
      return res.data;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async listSendAsAliases(): Promise<gmail_v1.Schema$SendAs[]> {
    try {
      const res = await this.gmail.users.settings.sendAs.list({ userId: 'me' });
      return res.data.sendAs || [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async listForwardingAddresses(): Promise<gmail_v1.Schema$ForwardingAddress[]> {
    try {
      const res = await this.gmail.users.settings.forwardingAddresses.list({ userId: 'me' });
      return res.data.forwardingAddresses || [];
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
