import { apiDelete, apiGet, apiPost, isBackendEnabled } from './client';
import { collectJoinAnswers, joinEventWithAnswers } from '../lib/joinFormGate';
import { API_ROUTES } from './types';

const JOINED_KEY = 'simsor-joined-v1';

let joinedCache = new Set<string>();
let hydrated = false;

function readLocalJoined(): Set<string> {
  try {
    const raw = localStorage.getItem(JOINED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeLocalJoined(ids: Set<string>): void {
  localStorage.setItem(JOINED_KEY, JSON.stringify([...ids]));
}

export async function hydrateJoinedEvents(): Promise<void> {
  if (!isBackendEnabled()) {
    joinedCache = readLocalJoined();
    hydrated = true;
    return;
  }
  const res = await apiGet<{ eventIds: string[] }>(API_ROUTES.eventsJoinedMine);
  joinedCache = new Set(res.eventIds);
  writeLocalJoined(joinedCache);
  hydrated = true;
}

export function isEventJoined(eventId: string): boolean {
  if (!hydrated) joinedCache = readLocalJoined();
  return joinedCache.has(eventId);
}

export async function joinEventRemote(eventId: string): Promise<{ conversationId?: string }> {
  if (!isBackendEnabled()) {
    const next = readLocalJoined();
    next.add(eventId);
    writeLocalJoined(next);
    joinedCache = next;
    return {};
  }
  const answers = await collectJoinAnswers(eventId);
  const res = answers
    ? await joinEventWithAnswers(eventId, answers)
    : await apiPost<{
        joined: boolean;
        conversationId?: string | null;
      }>(API_ROUTES.eventJoin(eventId));
  joinedCache.add(eventId);
  writeLocalJoined(joinedCache);
  return { conversationId: res.conversationId ?? undefined };
}

export async function leaveEventRemote(eventId: string): Promise<void> {
  if (!isBackendEnabled()) {
    const next = readLocalJoined();
    next.delete(eventId);
    writeLocalJoined(next);
    joinedCache = next;
    return;
  }
  await apiDelete(API_ROUTES.eventJoin(eventId));
  joinedCache.delete(eventId);
  writeLocalJoined(joinedCache);
}

export async function toggleEventJoinRemote(eventId: string): Promise<boolean> {
  if (isEventJoined(eventId)) {
    await leaveEventRemote(eventId);
    return false;
  }
  await joinEventRemote(eventId);
  return true;
}
