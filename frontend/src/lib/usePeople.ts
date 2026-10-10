import { useSyncExternalStore } from 'react';
import { getPeopleCacheVersion, subscribePeopleCache } from '../components/ExplorePage/exploreEvents';

/** Re-renders the caller whenever a real user's profile finishes loading. */
export function usePeopleVersion(): number {
  return useSyncExternalStore(subscribePeopleCache, getPeopleCacheVersion, getPeopleCacheVersion);
}
