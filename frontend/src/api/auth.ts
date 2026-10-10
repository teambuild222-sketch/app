/**
 * Auth service — mock (localStorage) today, live HTTP when VITE_API_URL is set.
 */
import { apiPost, getAuthToken, isBackendEnabled, setAuthToken } from './client';
import { API_ROUTES, type AuthSession, type UserProfile } from './types';
import { clearStatsCache } from './statsApi';
import { hydrateJoinedEvents } from './joinsApi';
import { hydrateDabUps } from './dabUpsApi';
import { hydrateCommunities } from './communitiesApi';
import { ensurePeopleListsHydrated } from '../components/HomeFeed/audienceLists';
import { syncRealtimeAuth } from '../lib/supabaseClient';
import { registerForPush, unregisterPush } from '../lib/pushNotifications';

export const AUTH_FLAG_KEY = 'simsor-auth';
export const AUTH_CHANGED_EVENT = 'simsor-auth-changed';

const PROFILE_KEYS = {
  id: 'simsor-user-id',
  username: 'simsor-username',
  fullName: 'simsor-fullname',
  bio: 'simsor-bio',
  location: 'simsor-location',
  avatar: 'simsor-avatar',
  sports: 'simsor-sports',
  entertainment: 'simsor-ent',
} as const;

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function isLoggedIn(): boolean {
  if (isBackendEnabled()) return Boolean(getAuthToken());
  return localStorage.getItem(AUTH_FLAG_KEY) === 'true';
}

export function getLocalProfile(): UserProfile {
  return {
    id: localStorage.getItem(PROFILE_KEYS.id) || 'org-me',
    username: localStorage.getItem(PROFILE_KEYS.username) || 'admin',
    fullName: localStorage.getItem(PROFILE_KEYS.fullName) || 'Admin User',
    bio: localStorage.getItem(PROFILE_KEYS.bio) || 'Sports Enthusiast • Event Explorer',
    location: localStorage.getItem(PROFILE_KEYS.location) || 'Hyderabad, India',
    avatarUrl:
      localStorage.getItem(PROFILE_KEYS.avatar) ||
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=300&h=300&q=80',
    sports: readJSON(PROFILE_KEYS.sports, ['Cricket', 'Football']),
    entertainment: readJSON(PROFILE_KEYS.entertainment, ['Music', 'Food Events']),
  };
}

function persistLocalSession(user: Partial<UserProfile> & { username: string; fullName: string }) {
  localStorage.setItem(AUTH_FLAG_KEY, 'true');
  localStorage.setItem(PROFILE_KEYS.username, user.username);
  localStorage.setItem(PROFILE_KEYS.fullName, user.fullName);
  if (user.id) localStorage.setItem(PROFILE_KEYS.id, user.id);
  if (user.bio != null) localStorage.setItem(PROFILE_KEYS.bio, user.bio);
  if (user.location != null) localStorage.setItem(PROFILE_KEYS.location, user.location);
  if (user.avatarUrl != null) localStorage.setItem(PROFILE_KEYS.avatar, user.avatarUrl);
  if (user.sports) localStorage.setItem(PROFILE_KEYS.sports, JSON.stringify(user.sports));
  if (user.entertainment) {
    localStorage.setItem(PROFILE_KEYS.entertainment, JSON.stringify(user.entertainment));
  }
  emitAuthChanged();
}

function applyLiveSession(session: AuthSession) {
  setAuthToken(session.token);
  syncRealtimeAuth(session.token);
  persistLocalSession(session.user);
  void hydrateJoinedEvents();
  void hydrateDabUps();
  void hydrateCommunities();
  void ensurePeopleListsHydrated();
  void registerForPush();
}

/** Apply a live API session (password, Google, Apple, signup). */
export function applyAuthSession(session: AuthSession): UserProfile {
  applyLiveSession(session);
  return session.user;
}

/** Re-bridges an already-stored token into Supabase Realtime on app boot,
 * so an open tab reload doesn't lose live chat delivery. No-op if there's no
 * token or the backend/Supabase isn't configured. */
export function restoreRealtimeAuthOnBoot(): void {
  if (!isBackendEnabled()) return;
  const token = getAuthToken();
  if (token) {
    syncRealtimeAuth(token);
    void hydrateJoinedEvents();
    void hydrateDabUps();
    void hydrateCommunities();
    void ensurePeopleListsHydrated();
    void registerForPush();
  }
}

export async function loginWithPassword(username: string, password: string): Promise<UserProfile> {
  const u = username.trim();
  const p = password.trim();
  if (u.length < 3 || p.length < 3) {
    throw new Error('Username and password must be at least 3 characters');
  }

  if (isBackendEnabled()) {
    const session = await apiPost<AuthSession>(API_ROUTES.login, {
      username: u,
      password: p,
    });
    applyLiveSession(session);
    return session.user;
  }

  // Mock login (current app behavior)
  const fullName = u.toLowerCase() === 'admin' ? 'Admin User' : u;
  persistLocalSession({ username: u, fullName });
  return getLocalProfile();
}

export async function signupAccount(payload: {
  username: string;
  password: string;
  fullName: string;
  email?: string;
}): Promise<UserProfile> {
  const username = payload.username.trim().toLowerCase();
  const fullName = payload.fullName.trim();
  const password = payload.password.trim();

  if (username.length < 3 || password.length < 3 || !fullName) {
    throw new Error('Please fill in all fields correctly');
  }

  if (isBackendEnabled()) {
    const session = await apiPost<AuthSession>(API_ROUTES.signup, {
      username,
      password,
      fullName,
      email: payload.email,
    });
    applyLiveSession(session);
    return session.user;
  }

  persistLocalSession({ username, fullName });
  return getLocalProfile();
}

/** Drops the local session without calling the API (token already revoked/expired). */
export function clearLocalSession(): void {
  setAuthToken(null);
  syncRealtimeAuth(null);
  localStorage.removeItem(AUTH_FLAG_KEY);
  if (isBackendEnabled()) {
    // Never let the next account to sign in on this device inherit this one's identity / counters.
    Object.values(PROFILE_KEYS).forEach((key) => localStorage.removeItem(key));
    clearStatsCache();
  }
  emitAuthChanged();
}

export async function logout(): Promise<void> {
  if (isBackendEnabled()) {
    // Stop pushes to this device while the token is still valid.
    await unregisterPush();
    try {
      // Revokes this token server-side.
      await apiPost(API_ROUTES.logout);
    } catch {
      /* ignore network errors on logout */
    }
  }
  clearLocalSession();
}

/** Replaces the stored token (e.g. after change-password signs other devices out). */
export function replaceAuthToken(token: string): void {
  setAuthToken(token);
  syncRealtimeAuth(token);
}
