/**
 * Profile service — localStorage today, PATCH /api/me when backend is on.
 */
import { apiGet, apiPatch, isBackendEnabled } from './client';
import { getLocalProfile } from './auth';
import { API_ROUTES, type UserProfile } from './types';
import { notifyUserInterestsChanged } from '../components/ExplorePage/profileExploreInterests';

export async function fetchProfile(): Promise<UserProfile> {
  if (isBackendEnabled()) {
    return apiGet<UserProfile>(API_ROUTES.me);
  }
  return getLocalProfile();
}

export async function saveProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
  if (isBackendEnabled()) {
    const updated = await apiPatch<UserProfile>(API_ROUTES.updateMe, patch);
    if (updated.fullName) localStorage.setItem('simsor-fullname', updated.fullName);
    if (updated.username) localStorage.setItem('simsor-username', updated.username);
    if (updated.bio != null) localStorage.setItem('simsor-bio', updated.bio);
    if (updated.location != null) localStorage.setItem('simsor-location', updated.location);
    if (updated.avatarUrl) localStorage.setItem('simsor-avatar', updated.avatarUrl);
    if (updated.sports) localStorage.setItem('simsor-sports', JSON.stringify(updated.sports));
    if (updated.entertainment) {
      localStorage.setItem('simsor-ent', JSON.stringify(updated.entertainment));
    }
    notifyUserInterestsChanged();
    return updated;
  }

  const current = getLocalProfile();
  const next: UserProfile = { ...current, ...patch };
  localStorage.setItem('simsor-fullname', next.fullName);
  localStorage.setItem('simsor-username', next.username);
  localStorage.setItem('simsor-bio', next.bio);
  localStorage.setItem('simsor-location', next.location);
  localStorage.setItem('simsor-avatar', next.avatarUrl);
  localStorage.setItem('simsor-sports', JSON.stringify(next.sports));
  localStorage.setItem('simsor-ent', JSON.stringify(next.entertainment));
  notifyUserInterestsChanged();
  return next;
}
