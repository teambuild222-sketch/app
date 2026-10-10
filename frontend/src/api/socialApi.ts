/**
 * Social features facade (Dab Ups + chat previews).
 * Mock implementations use existing local stores; live paths call REST.
 */
import { apiGet, apiPost, isBackendEnabled } from './client';
import { hydrateDabUps } from './dabUpsApi';
import { API_ROUTES, type ConversationPreview, type DabUpStatus } from './types';
import { getDabUpStatus, sendDabUpRequest } from '../components/profile/profileData';

export async function requestDabUp(userId: string): Promise<DabUpStatus> {
  if (isBackendEnabled()) {
    const res = await apiPost<{ status: DabUpStatus }>(API_ROUTES.dabUpRequest, { userId });
    await hydrateDabUps();
    window.dispatchEvent(new CustomEvent('simsor-dabups-changed'));
    return res.status;
  }
  sendDabUpRequest(userId);
  return getDabUpStatus(userId);
}

export async function fetchDabUpStatus(userId: string): Promise<DabUpStatus> {
  if (isBackendEnabled()) {
    const res = await apiGet<{ status: DabUpStatus }>(`${API_ROUTES.dabUps}/${userId}`);
    return res.status;
  }
  return getDabUpStatus(userId);
}

export async function listConversations(): Promise<ConversationPreview[]> {
  if (isBackendEnabled()) {
    return apiGet<ConversationPreview[]>(API_ROUTES.conversations);
  }
  // Chat still uses chatStore locally until backend chat is live
  return [];
}
