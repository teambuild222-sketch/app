/**
 * Follow graph API facade (Phase 3) — replaces the localStorage
 * `simsor-following-v1` store. See components/HomeFeed/feedAlgorithm.ts for
 * the stale-while-revalidate cache that lets synchronous feed scoring keep
 * working against this async data.
 */
import { apiDelete, apiGet, apiPost } from './client';
import { API_ROUTES, type FollowingListDto } from './types';

export async function fetchMyFollowing(): Promise<string[]> {
  const { userIds } = await apiGet<FollowingListDto>(API_ROUTES.followingMine);
  return userIds;
}

export async function followUser(userId: string): Promise<void> {
  await apiPost(API_ROUTES.followUser(userId));
}

export async function unfollowUser(userId: string): Promise<void> {
  await apiDelete(API_ROUTES.followUser(userId));
}
