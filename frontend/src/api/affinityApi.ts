/**
 * Affinity tracking API facade (Phase 3) — replaces the localStorage
 * `simsor-feed-affinity-v1` store. Weights are looked up server-side (see
 * backend/app/affinity.py); the client only ever reports what happened.
 */
import { apiGet, apiPost } from './client';
import { API_ROUTES, type AffinityMineDto, type AffinityTrackPayload } from './types';

export async function fetchMyAffinity(): Promise<AffinityMineDto> {
  return apiGet<AffinityMineDto>(API_ROUTES.affinityMine);
}

export async function trackAffinity(payload: AffinityTrackPayload): Promise<void> {
  await apiPost(API_ROUTES.affinityTrack, payload);
}
