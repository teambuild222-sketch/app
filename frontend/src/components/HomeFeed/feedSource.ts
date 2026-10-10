/**
 * Single entry point for "all posts the feed/Discover should consider".
 * Behind a live backend this fetches the real, shared posts table (Phase 3);
 * otherwise it falls back to the original localStorage + seed array so mock
 * mode stays byte-for-byte unchanged.
 */
import { isBackendEnabled } from '../../api/client';
import { listPosts } from '../../api/postsApi';
import { HOME_FEED_POSTS, mapPostDtoToHomeFeedPost, type HomeFeedPost } from './homeFeed';
import { loadUserPosts } from './publishContent';
import { requestPeople } from '../ExplorePage/exploreEvents';

/** Last posts fetched from the live API: lets synchronous code (profiles,
 * stats) see real posts instead of the bundled demo seeds. */
let liveCache: HomeFeedPost[] = [];
export const LIVE_POSTS_CHANGED_EVENT = 'simsor-live-posts-changed';

export function getLiveCachedPosts(): HomeFeedPost[] {
  return liveCache;
}

/** What to render before the first network response arrives. */
export function getInitialFeedPosts(): HomeFeedPost[] {
  return isBackendEnabled() ? liveCache : [...loadUserPosts(), ...HOME_FEED_POSTS];
}

export async function loadFeedPosts(): Promise<HomeFeedPost[]> {
  if (isBackendEnabled()) {
    const dtos = await listPosts();
    const posts = dtos.map(mapPostDtoToHomeFeedPost);
    liveCache = posts;
    // Pre-load the real people behind these posts so names/avatars appear.
    requestPeople(posts.flatMap((p) => [p.authorId, p.originalHostId]));
    window.dispatchEvent(new CustomEvent(LIVE_POSTS_CHANGED_EVENT));
    return posts;
  }
  return [...loadUserPosts(), ...HOME_FEED_POSTS];
}
