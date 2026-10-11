/**
 * Social features facade (Dab Ups + chat previews).
 * Mock implementations use existing local stores; live paths call REST.
 */
import { apiGet, apiPost, isBackendEnabled } from './client';
import { hydrateDabUps } from './dabUpsApi';
import { API_ROUTES, type ConversationPreview, type DabUpStatus } from './types';
import { getDabUpStatus, respondToDabUp, sendDabUpRequest } from '../components/profile/profileData';

export async function requestDabUp(userId: string): Promise<DabUpStatus> {
  if (isBackendEnabled()) {
    const res = await apiPost<{ status: DabUpStatus }>(API_ROUTES.dabUpRequest, { userId });
    await hydrateDabUps({ force: true });
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

/** Confirm (accept) or deny an incoming Dab Up request from `userId`. */
export async function respondDabUp(userId: string, accept: boolean): Promise<DabUpStatus> {
  if (isBackendEnabled()) {
    const res = await apiPost<{ status: DabUpStatus }>(
      `${API_ROUTES.dabUps}/${userId}/${accept ? 'accept' : 'deny'}`,
      {},
    );
    await hydrateDabUps({ force: true });
    window.dispatchEvent(new CustomEvent('simsor-dabups-changed'));
    return res.status;
  }
  respondToDabUp(userId, accept);
  return getDabUpStatus(userId);
}

export async function listConversations(): Promise<ConversationPreview[]> {
  if (isBackendEnabled()) {
    return apiGet<ConversationPreview[]>(API_ROUTES.conversations);
  }
  // Chat still uses chatStore locally until backend chat is live
  return [];
}
