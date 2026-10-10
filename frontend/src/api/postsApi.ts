/**
 * Posts API facade (Phase 3) — real, shared posts replacing the localStorage
 * `simsor-user-posts-v1` store. No mock fallback here: callers that need to
 * work in mock mode too should branch on `isBackendEnabled()` themselves
 * (see components/HomeFeed/feedSource.ts), same pattern as usersApi.ts.
 */
import { apiDelete, apiGet, apiPost } from './client';
import { API_ROUTES, type LikeResponseDto, type PostCreatePayload, type PostDto } from './types';

export async function listPosts(params?: { mainCategory?: string }): Promise<PostDto[]> {
  return apiGet<PostDto[]>(API_ROUTES.posts, { params });
}

export async function createPost(payload: PostCreatePayload): Promise<PostDto> {
  return apiPost<PostDto>(API_ROUTES.posts, payload);
}

export async function deletePost(postId: string): Promise<void> {
  await apiDelete(API_ROUTES.postById(postId));
}

export async function toggleLike(postId: string): Promise<LikeResponseDto> {
  return apiPost<LikeResponseDto>(API_ROUTES.postLike(postId));
}
