import { apiGet, apiPost, isBackendEnabled } from './client';
import { CACHE_TTL, cachedGet, DEVICE_CACHE_CLEARED, readCache, writeCache } from '../lib/deviceCache';
import { API_ROUTES } from './types';
import type { Community } from '../components/profile/communitiesStore';
import { getCurrentViewerId } from '../components/ExplorePage/exploreEvents';

export type CommunityDto = {
  id: string;
  name: string;
  avatarUrl: string;
  memberCount: number;
  role: 'admin' | 'member';
  creatorId: string;
  conversationId?: string | null;
  createdAt?: string | null;
};

function mapDto(dto: CommunityDto): Community {
  return {
    id: dto.id,
    name: dto.name,
    description: '',
    visibility: 'public',
    creatorId: dto.creatorId,
    chatId: dto.conversationId ?? `community-chat-${dto.id}`,
    avatar: dto.avatarUrl,
    createdAt: dto.createdAt ? new Date(dto.createdAt).getTime() : Date.now(),
  };
}

let membershipCache: Community[] = readCache<Community[]>('communities:mine') ?? [];

function persistMemberships(next: Community[]): void {
  membershipCache = next;
  writeCache('communities:mine', next);
}

if (typeof window !== 'undefined') {
  window.addEventListener(DEVICE_CACHE_CLEARED, () => {
    membershipCache = [];
  });
}

export async function hydrateCommunities(opts?: { force?: boolean }): Promise<void> {
  if (!isBackendEnabled()) return;
  const rows = await cachedGet('communities:raw', () => apiGet<CommunityDto[]>(API_ROUTES.communities), {
    maxAgeMs: CACHE_TTL.communities,
    force: opts?.force,
  });
  persistMemberships(rows.map(mapDto));
}

export function getMembershipCommunitiesCache(): Community[] {
  return membershipCache;
}

export async function fetchCommunitiesByCreator(userId: string): Promise<Community[]> {
  if (!isBackendEnabled()) return [];
  const rows = await apiGet<CommunityDto[]>(API_ROUTES.communitiesByCreator(userId));
  return rows.map(mapDto);
}

export async function createCommunityRemote(input: {
  name: string;
  avatarUrl?: string;
  memberIds?: string[];
}): Promise<Community> {
  const dto = await apiPost<CommunityDto>(API_ROUTES.communities, {
    name: input.name,
    avatarUrl: input.avatarUrl ?? '',
    memberIds: input.memberIds ?? [],
  });
  const mapped = mapDto(dto);
  persistMemberships([mapped, ...membershipCache]);
  return mapped;
}

export async function joinCommunityRemote(communityId: string): Promise<void> {
  await apiPost(API_ROUTES.communityJoin(communityId));
  await hydrateCommunities({ force: true });
}

export function canCreateCommunityRemote(): boolean {
  const me = getCurrentViewerId();
  return membershipCache.filter((c) => c.creatorId === me).length < 1;
}
