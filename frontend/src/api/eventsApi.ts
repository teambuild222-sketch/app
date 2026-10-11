/**
 * Events API facade.
 * Until VITE_API_URL is set, delegates to existing exploreEvents local store.
 */
import { apiDelete, apiGet, apiPost, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, invalidateCache, readCache } from '../lib/deviceCache';
import { API_ROUTES, type EventDto } from './types';
import { loadExploreEvents, type ExploreEvent } from '../components/ExplorePage/exploreEvents';

function toDto(e: ExploreEvent): EventDto {
  return { ...e };
}

function eventsKey(mainCategory?: string): string {
  return `events:${mainCategory || 'all'}`;
}

export function getCachedEvents(mainCategory?: string): EventDto[] {
  return readCache<EventDto[]>(eventsKey(mainCategory)) ?? [];
}

export async function listEvents(params?: {
  lat?: number;
  lng?: number;
  radiusKm?: number;
  mainCategory?: string;
  force?: boolean;
}): Promise<EventDto[]> {
  if (isBackendEnabled()) {
    return cachedGet(eventsKey(params?.mainCategory), () => apiGet<EventDto[]>(API_ROUTES.events, { params }), {
      maxAgeMs: CACHE_TTL.events,
      force: params?.force,
    });
  }
  return loadExploreEvents().map(toDto);
}

export async function createEventRemote(
  // organizerId is intentionally not accepted here: the backend always sets
  // it from the authenticated user (see backend/app/routers/events.py) and
  // ignores any client-supplied value, so it shouldn't be required to call this.
  payload: Omit<EventDto, 'id' | 'attendees' | 'organizerId'> & { attendees?: number },
): Promise<EventDto> {
  if (isBackendEnabled()) {
    const created = await apiPost<EventDto>(API_ROUTES.events, payload);
    invalidateCache('events:');
    return created;
  }
  throw new Error('Use publishEvent() while backend is offline');
}

export async function deleteEventRemote(eventId: string): Promise<void> {
  if (isBackendEnabled()) {
    await apiDelete(API_ROUTES.eventById(eventId));
    invalidateCache('events:');
    return;
  }
  throw new Error('Use removeExploreEvent() while backend is offline');
}

export async function getEventRemote(eventId: string): Promise<EventDto> {
  if (isBackendEnabled()) {
    return apiGet<EventDto>(API_ROUTES.eventById(eventId));
  }
  const match = loadExploreEvents().find((e) => e.id === eventId);
  if (!match) throw new Error('Event not found');
  return toDto(match);
}
