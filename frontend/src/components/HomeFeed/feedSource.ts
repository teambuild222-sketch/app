/**
 * Single entry point for "all posts the feed/Discover should consider".
 * Behind a live backend this fetches the real, shared posts table (Phase 3);
 * otherwise it falls back to the original localStorage + seed array so mock
 * mode stays byte-for-byte unchanged.
 */
import { isBackendEnabled } from '../../api/client';
import { getCachedPosts, listPosts } from '../../api/postsApi';
import { DEVICE_CACHE_CLEARED } from '../../lib/deviceCache';
import { HOME_FEED_POSTS, mapPostDtoToHomeFeedPost, type HomeFeedPost } from './homeFeed';
import { loadUserPosts } from './publishContent';
import { requestPeople } from '../ExplorePage/exploreEvents';

/** Last posts fetched from the live API: lets synchronous code (profiles,
 * stats) see real posts instead of the bundled demo seeds. */
let liveCache: HomeFeedPost[] = isBackendEnabled()
  ? getCachedPosts().map(mapPostDtoToHomeFeedPost)
  : [];
export const LIVE_POSTS_CHANGED_EVENT = 'simsor-live-posts-changed';

if (typeof window !== 'undefined') {
  window.addEventListener(DEVICE_CACHE_CLEARED, () => {
    liveCache = [];
  });
}

export function getLiveCachedPosts(): HomeFeedPost[] {
  return liveCache;
}

/** What to render before the first network response arrives. */
export function getInitialFeedPosts(): HomeFeedPost[] {
  return isBackendEnabled() ? liveCache : [...loadUserPosts(), ...HOME_FEED_POSTS];
}

function applyLivePosts(dtos: Awaited<ReturnType<typeof listPosts>>): HomeFeedPost[] {
  const posts = dtos.map(mapPostDtoToHomeFeedPost);
  liveCache = posts;
  requestPeople(posts.flatMap((p) => [p.authorId, p.originalHostId]));
  window.dispatchEvent(new CustomEvent(LIVE_POSTS_CHANGED_EVENT));
  return posts;
}

export async function loadFeedPosts(): Promise<HomeFeedPost[]> {
  if (isBackendEnabled()) {
    const cached = getCachedPosts();
    if (cached.length) {
      const posts = applyLivePosts(cached);
      void listPosts({ force: true }).then((dtos) => {
        if (JSON.stringify(dtos) !== JSON.stringify(cached)) applyLivePosts(dtos);
      }).catch(() => undefined);
      return posts;
    }
    return applyLivePosts(await listPosts({ force: true }));
  }
  return [...loadUserPosts(), ...HOME_FEED_POSTS];
}
