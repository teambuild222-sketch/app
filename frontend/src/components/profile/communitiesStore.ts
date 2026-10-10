import { ME_AUTHOR_ID, getDefaultCommunityAvatarForCreator } from '../ExplorePage/exploreEvents';
import { createCommunityChat, ensureJoinedCommunityChat } from '../Chat/chatStore';

export type CommunityVisibility = 'public';

export type Community = {
  id: string;
  name: string;
  description: string;
  visibility: CommunityVisibility;
  creatorId: string;
  chatId: string;
  avatar?: string;
  memberIds?: string[];
  createdAt: number;
};

type CommunityMembership = {
  userId: string;
  communityId: string;
  joinedAt: number;
};

type StoredCommunityChat = {
  id: string;
  type?: string;
  name?: string;
  adminId?: string;
  communityId?: string;
  avatar?: string;
  memberIds?: string[];
  createdAt?: number;
};

export const COMMUNITIES_CHANGED = 'simsor-communities-changed';

const STORE_KEY = 'simsor-communities-v1';
const MEMBERSHIPS_KEY = 'simsor-community-memberships-v1';
const DEMO_SEEDED_KEY = 'simsor-community-demo-seeded-v1';
const CHAT_STORE_KEY = 'simsor-chat-store-v2';

const DEMO_JOINED_COMMUNITY_ID = 'community-demo-hyd-sports';

function loadOwnedCommunityChats(): StoredCommunityChat[] {
  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (chat): chat is StoredCommunityChat =>
        Boolean(chat?.type === 'community' && chat.adminId === ME_AUTHOR_ID && chat.id && chat.name),
    );
  } catch {
    return [];
  }
}

function reconcileCommunitiesFromChats(communities: Community[]): Community[] {
  const next = [...communities];
  let changed = false;

  for (const chat of loadOwnedCommunityChats()) {
    const communityId = chat.communityId ?? chat.id.replace(/^community-chat-/, '');
    const exists = next.some((c) => c.id === communityId || c.chatId === chat.id);
    if (exists) continue;

    next.unshift({
      id: communityId,
      name: chat.name!.trim(),
      description: '',
      visibility: 'public',
      creatorId: ME_AUTHOR_ID,
      chatId: chat.id,
      avatar: chat.avatar,
      memberIds: chat.memberIds,
      createdAt: chat.createdAt ?? Date.now(),
    });
    changed = true;
  }

  if (changed) {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  }

  return next;
}

function loadCommunities(): Community[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .filter((community): community is Community => Boolean(community && community.id && community.name))
      .map((community) => ({
        ...community,
        visibility: 'public' as const,
        creatorId: community.creatorId || ME_AUTHOR_ID,
      }));
    return normalized;
  } catch {
    return [];
  }
}

function saveCommunities(communities: Community[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(communities));
  window.dispatchEvent(new CustomEvent(COMMUNITIES_CHANGED));
}

function loadMemberships(): CommunityMembership[] {
  try {
    const raw = localStorage.getItem(MEMBERSHIPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMemberships(memberships: CommunityMembership[]): void {
  localStorage.setItem(MEMBERSHIPS_KEY, JSON.stringify(memberships));
  window.dispatchEvent(new CustomEvent(COMMUNITIES_CHANGED));
}

function seedDemoJoinedCommunity(): void {
  if (localStorage.getItem(DEMO_SEEDED_KEY) === '1') return;

  const communities = loadCommunities();
  let demo = communities.find((c) => c.id === DEMO_JOINED_COMMUNITY_ID);
  if (!demo) {
    demo = {
      id: DEMO_JOINED_COMMUNITY_ID,
      name: 'Hyderabad Sports Hub',
      description: 'Weekend leagues, pickup games, and local sports talk.',
      visibility: 'public',
      creatorId: 'org-rahul',
      chatId: `community-chat-${DEMO_JOINED_COMMUNITY_ID}`,
      createdAt: Date.now() - 172_800_000,
    };
    saveCommunities([demo, ...communities]);
  }

  ensureJoinedCommunityChat({
    communityId: demo.id,
    name: demo.name,
    adminId: demo.creatorId,
  });

  const memberships = loadMemberships();
  if (!memberships.some((m) => m.userId === ME_AUTHOR_ID && m.communityId === demo!.id)) {
    saveMemberships([
      ...memberships,
      { userId: ME_AUTHOR_ID, communityId: demo.id, joinedAt: Date.now() - 86_400_000 },
    ]);
  }

  localStorage.setItem(DEMO_SEEDED_KEY, '1');
}

export function getAllCommunities(): Community[] {
  seedDemoJoinedCommunity();
  const communities = loadCommunities().sort((a, b) => b.createdAt - a.createdAt);
  const reconciled = reconcileCommunitiesFromChats(communities);
  if (reconciled.length !== communities.length) {
    window.dispatchEvent(new CustomEvent(COMMUNITIES_CHANGED));
  }
  return reconciled.sort((a, b) => b.createdAt - a.createdAt);
}

export function getCommunitiesByCreator(creatorId: string): Community[] {
  return getAllCommunities().filter((c) => c.creatorId === creatorId);
}

export function getJoinedCommunities(): Community[] {
  seedDemoJoinedCommunity();
  const joinedIds = new Set(
    loadMemberships()
      .filter((m) => m.userId === ME_AUTHOR_ID)
      .map((m) => m.communityId),
  );
  return getAllCommunities().filter(
    (c) => joinedIds.has(c.id) && c.creatorId !== ME_AUTHOR_ID,
  );
}

export function isCommunityCreator(community: Community): boolean {
  return community.creatorId === ME_AUTHOR_ID;
}

export function getCommunityByChatId(chatId: string): Community | undefined {
  return getAllCommunities().find((c) => c.chatId === chatId);
}

export function getVisibleCommunitiesForProfile(userId: string | null, isOwnProfile: boolean): Community[] {
  const creatorId = isOwnProfile ? ME_AUTHOR_ID : userId;
  if (!creatorId) return [];
  return getCommunitiesByCreator(creatorId);
}

export function joinCommunity(communityId: string): boolean {
  const community = getAllCommunities().find((c) => c.id === communityId);
  if (!community || community.creatorId === ME_AUTHOR_ID) return false;

  const memberships = loadMemberships();
  if (memberships.some((m) => m.userId === ME_AUTHOR_ID && m.communityId === communityId)) {
    return true;
  }

  ensureJoinedCommunityChat({
    communityId: community.id,
    name: community.name,
    adminId: community.creatorId,
  });

  saveMemberships([
    ...memberships,
    { userId: ME_AUTHOR_ID, communityId, joinedAt: Date.now() },
  ]);
  return true;
}

export const MAX_COMMUNITIES_PER_USER = 1;

export function canUserCreateCommunity(creatorId: string = ME_AUTHOR_ID): boolean {
  return getCommunitiesByCreator(creatorId).length < MAX_COMMUNITIES_PER_USER;
}

function isLegacyCommunityAvatar(url?: string): boolean {
  return !url || url.includes('photo-1522075469751');
}

function loadCommunityChatById(chatId: string): StoredCommunityChat | undefined {
  try {
    const raw = localStorage.getItem(CHAT_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return undefined;
    return parsed.find(
      (chat): chat is StoredCommunityChat =>
        Boolean(chat?.type === 'community' && chat.id === chatId),
    );
  } catch {
    return undefined;
  }
}

export function getCommunityAvatar(community: Community): string {
  if (!isLegacyCommunityAvatar(community.avatar)) return community.avatar!;
  const chat = loadCommunityChatById(community.chatId);
  if (!isLegacyCommunityAvatar(chat?.avatar)) return chat!.avatar!;
  return getDefaultCommunityAvatarForCreator(community.creatorId);
}

export function createCommunity(input: {
  name: string;
  description?: string;
  avatar?: string;
  memberIds?: string[];
}): Community | null {
  if (!canUserCreateCommunity()) return null;

  const trimmed = input.name.trim();
  if (!trimmed) return null;

  const memberIds = (input.memberIds ?? []).filter((id) => id !== ME_AUTHOR_ID);
  const avatar = input.avatar?.trim() || getDefaultCommunityAvatarForCreator(ME_AUTHOR_ID);
  const id = `community-${Date.now()}`;
  const chat = createCommunityChat({
    communityId: id,
    name: trimmed,
    avatar,
    memberIds,
  });
  if (!chat) return null;

  const community: Community = {
    id,
    name: trimmed,
    description: input.description?.trim() ?? '',
    visibility: 'public',
    creatorId: ME_AUTHOR_ID,
    chatId: chat.id,
    avatar,
    memberIds: chat.members.map((member) => member.id),
    createdAt: Date.now(),
  };

  saveCommunities([community, ...loadCommunities()]);
  return community;
}

export function subscribeCommunities(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(COMMUNITIES_CHANGED, handler);
  return () => window.removeEventListener(COMMUNITIES_CHANGED, handler);
}

export function deleteOwnedCommunityByChatId(chatId: string): void {
  const communities = loadCommunities();
  const next = communities.filter((c) => !(c.chatId === chatId && c.creatorId === ME_AUTHOR_ID));
  if (next.length !== communities.length) saveCommunities(next);
}

export function leaveCommunityByChatId(chatId: string): void {
  const community = loadCommunities().find((c) => c.chatId === chatId);
  if (!community) return;
  saveMemberships(
    loadMemberships().filter(
      (m) => !(m.userId === ME_AUTHOR_ID && m.communityId === community.id),
    ),
  );
}
