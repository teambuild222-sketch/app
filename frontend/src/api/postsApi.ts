/**
 * Posts API facade (Phase 3) — real, shared posts replacing the localStorage
 * `simsor-user-posts-v1` store. No mock fallback here: callers that need to
 * work in mock mode too should branch on `isBackendEnabled()` themselves
 * (see components/HomeFeed/feedSource.ts), same pattern as usersApi.ts.
 */
import { apiDelete, apiGet, apiPost } from './client';
import { CACHE_TTL, cachedGet, invalidateCache, readCache } from '../lib/deviceCache';
import { API_ROUTES, type LikeResponseDto, type PostCreatePayload, type PostDto } from './types';

function postsKey(mainCategory?: string): string {
  return `posts:${mainCategory || 'all'}`;
}

export function getCachedPosts(mainCategory?: string): PostDto[] {
  return readCache<PostDto[]>(postsKey(mainCategory)) ?? [];
}

export async function listPosts(params?: { mainCategory?: string; force?: boolean }): Promise<PostDto[]> {
  return cachedGet(postsKey(params?.mainCategory), () => apiGet<PostDto[]>(API_ROUTES.posts, { params }), {
    maxAgeMs: CACHE_TTL.posts,
    force: params?.force,
  });
}

export async function createPost(payload: PostCreatePayload): Promise<PostDto> {
  const post = await apiPost<PostDto>(API_ROUTES.posts, payload);
  invalidateCache('posts:');
  return post;
}

export async function deletePost(postId: string): Promise<void> {
  await apiDelete(API_ROUTES.postById(postId));
  invalidateCache('posts:');
}

export async function toggleLike(postId: string): Promise<LikeResponseDto> {
  const res = await apiPost<LikeResponseDto>(API_ROUTES.postLike(postId));
  invalidateCache('posts:');
  return res;
}
