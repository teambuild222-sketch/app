import { Capacitor } from '@capacitor/core';
import { apiDelete, apiGet, apiPost, apiPut, isBackendEnabled } from './client';
import { API_ROUTES } from './types';
import type { JoinFormField } from './communitiesApi';

export type NotionStatus = {
  communityId: string;
  verified: boolean;
  status: string;
  workspaceName: string;
  workspaceIcon: string;
  databaseId: string;
  databaseTitle: string;
  lastError: string;
  fields: JoinFormField[];
  databases: { id: string; title: string }[];
};

export async function fetchNotionStatus(communityId: string): Promise<NotionStatus> {
  return apiGet<NotionStatus>(API_ROUTES.communityNotion(communityId));
}

export async function startNotionOAuth(communityId: string): Promise<void> {
  const { url } = await apiPost<{ url: string }>(API_ROUTES.communityNotionOAuthStart(communityId));
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_blank');
    return;
  }
  window.location.href = url;
}

export async function selectNotionDatabase(communityId: string, databaseId: string): Promise<NotionStatus> {
  return apiPost<NotionStatus>(API_ROUTES.communityNotionDatabase(communityId), { databaseId });
}

export async function saveJoinForm(communityId: string, fields: JoinFormField[]): Promise<NotionStatus> {
  return apiPut<NotionStatus>(API_ROUTES.communityJoinForm(communityId), { fields });
}

export async function syncNotionNow(communityId: string): Promise<void> {
  await apiPost(API_ROUTES.communityNotionSync(communityId));
}

export async function disconnectNotion(communityId: string): Promise<void> {
  await apiDelete(API_ROUTES.communityNotion(communityId));
}

export function notionConfigured(): boolean {
  return isBackendEnabled();
}
