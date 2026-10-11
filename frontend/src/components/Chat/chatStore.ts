import {
  EVENT_ORGANIZERS,
  ME_AUTHOR_ID,
  ORGANIZER_BY_ID,
  getCurrentUserOrganizer,
  getCurrentViewerId,
  getDefaultCommunityAvatarForCreator,
  type EventOrganizer,
} from '../ExplorePage/exploreEvents';
import {
  getEventChats,
  appendEventChatMessage,
  EVENT_CHATS_CHANGED_EVENT,
} from '../common/eventChats';
import type { HomeFeedPost } from '../HomeFeed/homeFeed';
import { isBackendEnabled } from '../../api/client';
import { uploadFile } from '../../api/uploadApi';
import {
  bytesFromMb,
  prepareImageForUpload,
  UPLOAD_MAX_MB,
  uploadKindFromFile,
} from '../../lib/mediaUpload';
import {
  addGroupMemberRemote,
  createConversationRemote,
  deleteConversationRemote,
  getMessagesRemote,
  listConversationsRemote,
  markConversationReadRemote,
  removeGroupMemberRemote,
  sendMessageRemote,
  setConversationPrefsRemote,
  toggleReactionRemote,
} from '../../api/chatApi';
import { listUsers } from '../../api/usersApi';
import type { ConversationDto, MessageDto, PublicUserDto } from '../../api/types';
import { CACHE_UPDATED, DEVICE_CACHE_CLEARED, readCache, writeCache } from '../../lib/deviceCache';
import {
  broadcastTyping as broadcastTypingRealtime,
  subscribeToConversation as subscribeToConversationRealtime,
  unsubscribeFromConversation as unsubscribeFromConversationRealtime,
  type ChatPresenceState,
} from '../../lib/chatRealtime';

export const CHAT_STORE_CHANGED = 'simsor-chat-store-changed';
export const REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '👏', '🔥'] as const;

export type MessageKind = 'text' | 'post' | 'video' | 'image';

export type ChatReaction = {
  emoji: string;
  userId: string;
  userName: string;
};

export type SharedPostRef = {
  postId: string;
  caption: string;
  eventTitle: string;
  image?: string;
  videoUrl?: string;
  authorName: string;
  authorAvatar: string;
  postType: HomeFeedPost['type'];
};

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  sender: 'me' | 'other';
  kind: MessageKind;
  text?: string;
  sharedPost?: SharedPostRef;
  mediaUrl?: string;
  time: string;
  createdAt: number;
  reactions: ChatReaction[];
};

export type ChatMember = {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  username?: string;
};

export type ChatConversation = {
  id: string;
  type: 'dm' | 'group' | 'event' | 'community';
  name: string;
  avatar: string;
  subtitle: string;
  online?: boolean;
  unread?: number;
  eventId?: string;
  communityId?: string;
  visibility?: 'public' | 'private';
  adminId?: string;
  members: ChatMember[];
  messages: ChatMessage[];
  createdAt: number;
};

type StoredMessage = Omit<ChatMessage, 'sender' | 'time'>;

type StoredConversation = {
  id: string;
  type: 'dm' | 'group' | 'community';
  name: string;
  avatar: string;
  subtitle: string;
  online?: boolean;
  adminId?: string;
  communityId?: string;
  visibility?: 'public' | 'private';
  memberIds: string[];
  messages: StoredMessage[];
  createdAt: number;
};

const STORE_KEY = 'simsor-chat-store-v2';
const REACTIONS_KEY = 'simsor-chat-reactions-v1';
const PINS_KEY = 'simsor-chat-pins-v1';
const MUTES_KEY = 'simsor-chat-mutes-v1';
const HIDDEN_KEY = 'simsor-chat-hidden-v1';

function formatTime(createdAt: number): string {
  const diff = Date.now() - createdAt;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/* ============================================================
   Remote (backend) DM/group support — Chat Phase
   ------------------------------------------------------------
   Real conversations always get a `conv_...` id from the backend
   (see backend/app/models.py::_new_conversation_id), which never collides
   with the local `dm-*`/`group-*`/`community-chat-*`/`event-*` id schemes
   below — so a single id prefix check is enough to route every exported
   function to the right storage. Event chats stay local. Club/community
   chats are the linked `conv_*` group when a backend is live — local
   `community-chat-*` stubs are hidden so they cannot duplicate the inbox.
   ============================================================ */

function isRemoteChatId(id: string): boolean {
  return id.startsWith('conv_');
}

function notifyChatStoreChanged(): void {
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

// Stale-while-revalidate caches, same pattern as feedAlgorithm.ts's follow
// graph / affinity — keeps every exported function below synchronous even
// though the real data now comes from network calls.
let remoteConversations: ConversationDto[] | null = readCache<ConversationDto[]>('chat:inbox');
let remoteConversationsRefreshInFlight: Promise<void> | null = null;
const remoteMessagesById = new Map<string, MessageDto[]>();
const remoteMessagesLoadedIds = new Set<string>();

function hydrateCachedThreads(): void {
  for (const c of (remoteConversations ?? []).slice(0, 10)) {
    if (remoteMessagesById.has(c.id)) continue;
    const msgs = readCache<MessageDto[]>(`chat:msgs:${c.id}`);
    if (msgs?.length) remoteMessagesById.set(c.id, msgs);
  }
}

hydrateCachedThreads();

if (typeof window !== 'undefined') {
  window.addEventListener(DEVICE_CACHE_CLEARED, () => {
    remoteConversations = null;
    remoteConversationsRefreshInFlight = null;
    remoteMessagesById.clear();
    remoteMessagesLoadedIds.clear();
  });
  window.addEventListener(CACHE_UPDATED, (event) => {
    const key = (event as CustomEvent<string>).detail;
    if (key === 'communities:mine') {
      notifyChatStoreChanged();
      return;
    }
    if (key === 'chat:inbox') {
      const list = readCache<ConversationDto[]>('chat:inbox');
      if (list) {
        remoteConversations = list;
        hydrateCachedThreads();
        notifyChatStoreChanged();
      }
      return;
    }
    if (typeof key === 'string' && key.startsWith('chat:msgs:')) {
      const msgs = readCache<MessageDto[]>(key);
      if (msgs) {
        remoteMessagesById.set(key.slice('chat:msgs:'.length), msgs);
        notifyChatStoreChanged();
      }
    }
  });
}
const remotePresenceById = new Map<string, ChatPresenceState>();
let activeRemoteChatId: string | null = null;

function refreshRemoteConversations(force = false): Promise<void> {
  if (remoteConversationsRefreshInFlight) return remoteConversationsRefreshInFlight;
  remoteConversationsRefreshInFlight = listConversationsRemote({ force })
    .then((list) => {
      remoteConversations = list;
      writeCache('chat:inbox', list);
      hydrateCachedThreads();
      notifyChatStoreChanged();
      list.slice(0, 6).forEach((c) => ensureRemoteMessagesLoaded(c.id));
    })
    .catch(() => {
      remoteConversations = remoteConversations ?? [];
    })
    .finally(() => {
      remoteConversationsRefreshInFlight = null;
    });
  return remoteConversationsRefreshInFlight;
}

function optimisticallyUpdateRemoteConversation(
  chatId: string,
  updater: (c: ConversationDto) => ConversationDto,
): void {
  if (!remoteConversations) return;
  remoteConversations = remoteConversations.map((c) => (c.id === chatId ? updater(c) : c));
  writeCache('chat:inbox', remoteConversations);
  notifyChatStoreChanged();
}

function remoteMemberToChatMember(m: ConversationDto['members'][number]): ChatMember {
  return { id: m.id, name: m.name, avatar: m.avatarUrl, role: m.role === 'admin' ? 'Admin' : 'Member' };
}

function remoteMessageToChatMessage(m: MessageDto, members: ChatMember[], myId: string): ChatMessage {
  return {
    id: m.id,
    authorId: m.authorId,
    authorName: members.find((mem) => mem.id === m.authorId)?.name ?? 'Member',
    sender: m.authorId === myId ? 'me' : 'other',
    kind: m.kind,
    text: m.text ?? undefined,
    mediaUrl: m.mediaUrl ?? undefined,
    sharedPost: m.sharedPost
      ? {
          postId: m.sharedPost.postId,
          caption: m.sharedPost.caption,
          eventTitle: m.sharedPost.eventTitle,
          image: m.sharedPost.image ?? undefined,
          videoUrl: m.sharedPost.videoUrl ?? undefined,
          authorName: m.sharedPost.authorName,
          authorAvatar: m.sharedPost.authorAvatar,
          postType: m.sharedPost.postType,
        }
      : undefined,
    time: formatTime(new Date(m.createdAt).getTime()),
    createdAt: new Date(m.createdAt).getTime(),
    reactions: m.reactions.map((r) => ({ emoji: r.emoji, userId: r.userId, userName: r.userName })),
  };
}

function communityIdFromMembershipCache(conversationId: string): string | undefined {
  const cached = readCache<Array<{ id?: string; chatId?: string }>>('communities:mine');
  const hit = cached?.find((c) => c.chatId === conversationId);
  return hit?.id;
}

function findRemoteCommunityConversation(communityId: string): ConversationDto | undefined {
  const cached = readCache<Array<{ id?: string; chatId?: string }>>('communities:mine');
  const cachedChatId = cached?.find((row) => row.id === communityId)?.chatId;
  return (remoteConversations ?? []).find(
    (c) => c.communityId === communityId || (cachedChatId != null && c.id === cachedChatId),
  );
}

/** Map leftover local `community-chat-{communityId}` ids to the real `conv_*`. */
export function resolveConversationId(chatId: string): string {
  if (!chatId || isRemoteChatId(chatId)) return chatId;
  if (!chatId.startsWith('community-chat-')) return chatId;
  const communityId = chatId.slice('community-chat-'.length);
  const fromDto = (remoteConversations ?? []).find((c) => c.communityId === communityId);
  if (fromDto) return fromDto.id;
  const cached = readCache<Array<{ id?: string; chatId?: string }>>('communities:mine');
  const hit = cached?.find((c) => c.id === communityId && c.chatId?.startsWith('conv_'));
  if (hit?.chatId) return hit.chatId;
  const byLinked = findRemoteCommunityConversation(communityId);
  return byLinked?.id ?? chatId;
}

export function isRemoteInboxReady(): boolean {
  return !isBackendEnabled() || remoteConversations !== null;
}

export function refreshRemoteInbox(force = true): Promise<void> {
  if (!isBackendEnabled()) return Promise.resolve();
  return refreshRemoteConversations(force);
}

function remoteToChatConversation(dto: ConversationDto): ChatConversation {
  const myId = getCurrentViewerId();
  const members = dto.members.map(remoteMemberToChatMember);
  const presence = remotePresenceById.get(dto.id);
  // Full history is fetched lazily when the conversation is opened (see
  // ensureRemoteMessagesLoaded) — until then, fall back to the one-message
  // preview the list endpoint already gives us so the inbox row isn't empty.
  const messages = remoteMessagesById.get(dto.id) ?? (dto.lastMessage ? [dto.lastMessage] : []);
  const communityId = dto.communityId ?? communityIdFromMembershipCache(dto.id);
  const type: ChatConversation['type'] = communityId ? 'community' : dto.type;

  return {
    id: dto.id,
    type,
    name: dto.name,
    avatar: dto.avatarUrl,
    subtitle: type === 'group' || type === 'community' ? `${dto.members.length} members` : '',
    // Presence only reflects people who currently have THIS conversation's
    // realtime channel open (see chatRealtime.ts) — a reasonable proxy for
    // "online" without a separate app-wide presence system.
    online: dto.type === 'dm' ? (presence?.onlineUserIds.length ?? 0) > 0 : undefined,
    unread: dto.unread ?? 0,
    adminId: dto.adminId ?? undefined,
    communityId,
    members,
    createdAt: new Date(dto.createdAt).getTime(),
    messages: messages.map((m) => remoteMessageToChatMessage(m, members, myId)),
  };
}

function appendRemoteMessage(chatId: string, message: MessageDto): void {
  const existing = remoteMessagesById.get(chatId) ?? [];
  if (existing.some((m) => m.id === message.id)) return; // de-dupe our own send echoed back over realtime
  const next = [...existing, message];
  remoteMessagesById.set(chatId, next);
  remoteMessagesLoadedIds.add(chatId);
  writeCache(`chat:msgs:${chatId}`, next);
  optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, lastMessage: message, updatedAt: message.createdAt }));
}

/** Fetches full message history for a remote conversation the first time
 * it's opened. Safe to call repeatedly — no-ops once loaded (realtime/sends
 * keep the cache fresh after that). Exported for ChatPage to call on open. */
export function ensureRemoteMessagesLoaded(chatId: string): void {
  if (!isRemoteChatId(chatId)) return;
  if (!remoteMessagesById.has(chatId)) {
    const cached = readCache<MessageDto[]>(`chat:msgs:${chatId}`);
    if (cached?.length) {
      remoteMessagesById.set(chatId, cached);
      notifyChatStoreChanged();
    }
  }
  if (remoteMessagesLoadedIds.has(chatId)) return;
  remoteMessagesLoadedIds.add(chatId);
  getMessagesRemote(chatId)
    .then((messages) => {
      remoteMessagesById.set(chatId, messages);
      writeCache(`chat:msgs:${chatId}`, messages);
      notifyChatStoreChanged();
    })
    .catch(() => {
      remoteMessagesLoadedIds.delete(chatId); // allow a retry on next open
    });
}

function rawRealtimeRowToMessage(row: Record<string, unknown>): MessageDto | null {
  const id = row.id as string | undefined;
  const conversationId = row.conversation_id as string | undefined;
  const authorId = row.author_id as string | undefined;
  const kind = row.kind as MessageDto['kind'] | undefined;
  const createdAt = row.created_at as string | undefined;
  if (!id || !conversationId || !authorId || !kind || !createdAt) return null;
  return {
    id,
    conversationId,
    authorId,
    kind,
    text: (row.text as string | null | undefined) ?? null,
    mediaUrl: (row.media_url as string | null | undefined) ?? null,
    sharedPost: null,
    reactions: [],
    createdAt,
  };
}

/** Opens the realtime channel for a conversation (new messages + presence +
 * typing). Call when a conversation becomes the active thread; always pair
 * with `closeRemoteConversationRealtime` on close/unmount. No-op for
 * non-remote ids or when Supabase isn't configured. */
export function openRemoteConversationRealtime(chatId: string): void {
  if (!isRemoteChatId(chatId)) return;
  activeRemoteChatId = chatId;
  const myId = getCurrentViewerId();
  const myName = getCurrentUserOrganizer().name;

  subscribeToConversationRealtime(chatId, myId, myName, {
    onMessageInsert: (row) => {
      const message = rawRealtimeRowToMessage(row);
      if (!message) return;
      if (message.kind === 'post') {
        // Shared-post messages need a join we can't do client-side (event
        // title, author, image) — just re-fetch this conversation's history
        // rather than partially rendering it.
        remoteMessagesLoadedIds.delete(chatId);
        ensureRemoteMessagesLoaded(chatId);
        return;
      }
      appendRemoteMessage(chatId, message);
    },
    onPresenceChange: (state) => {
      remotePresenceById.set(chatId, state);
      notifyChatStoreChanged();
    },
  });
}

/** Safety net behind Supabase Realtime: re-pulls the inbox and the thread that
 * is currently open, so messages still arrive if the websocket was dropped
 * (phone sleep, flaky wifi). Called by the app-wide live sync tick. */
export function syncChatsFromServer(): void {
  if (!isBackendEnabled()) return;
  void refreshRemoteConversations(true);
  const chatId = activeRemoteChatId;
  if (!chatId) return;
  getMessagesRemote(chatId, undefined, { force: true })
    .then((messages) => {
      const current = remoteMessagesById.get(chatId) ?? [];
      const lastNew = messages[messages.length - 1]?.id;
      const lastOld = current[current.length - 1]?.id;
      if (messages.length !== current.length || lastNew !== lastOld) {
        remoteMessagesById.set(chatId, messages);
        writeCache(`chat:msgs:${chatId}`, messages);
        notifyChatStoreChanged();
      }
    })
    .catch(() => {});
}

export function closeRemoteConversationRealtime(chatId: string): void {
  if (!isRemoteChatId(chatId)) return;
  if (activeRemoteChatId === chatId) activeRemoteChatId = null;
  unsubscribeFromConversationRealtime(chatId);
  remotePresenceById.delete(chatId);
}

/** Broadcasts a "typing" ping on an already-open remote conversation. No-op
 * otherwise (local chats don't have a typing indicator). */
export function notifyTyping(chatId: string): void {
  if (!isRemoteChatId(chatId)) return;
  broadcastTypingRealtime(chatId, getCurrentViewerId());
}

export function isSomeoneTyping(chatId: string): boolean {
  return (remotePresenceById.get(chatId)?.typingUserIds.length ?? 0) > 0;
}

export function markConversationReadIfRemote(chatId: string): void {
  if (!isRemoteChatId(chatId)) return;
  optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, unread: 0 }));
  void markConversationReadRemote(chatId).catch(() => {
    /* best-effort — unread will just re-sync on next list refresh */
  });
}

/** Starts (or reuses) a 1:1 DM with a real user. Returns null in mock mode —
 * there's no real user directory to message there. */
export async function createDirectMessage(userId: string): Promise<ChatConversation | null> {
  if (!isBackendEnabled()) return null;
  try {
    const dto = await createConversationRemote({ type: 'dm', memberIds: [userId] });
    remoteConversations = [dto, ...(remoteConversations ?? []).filter((c) => c.id !== dto.id)];
    writeCache('chat:inbox', remoteConversations);
    notifyChatStoreChanged();
    return remoteToChatConversation(dto);
  } catch {
    return null;
  }
}

function organizerToMember(org: EventOrganizer): ChatMember {
  return { id: org.id, name: org.name, avatar: org.avatar, role: org.role };
}

function meMember(): ChatMember {
  const me = getCurrentUserOrganizer();
  return { id: me.id, name: me.name, avatar: me.avatar, role: 'You' };
}

function isLegacyCommunityAvatar(url?: string): boolean {
  return !url || url.includes('photo-1522075469751');
}

function normalizeCommunityConversation(conv: StoredConversation): StoredConversation {
  if (conv.type !== 'community') return conv;
  const memberCount = conv.memberIds?.length ?? 0;
  const memberLabel = memberCount === 1 ? '1 member' : `${memberCount} members`;
  const avatar = isLegacyCommunityAvatar(conv.avatar) && conv.adminId
    ? getDefaultCommunityAvatarForCreator(conv.adminId)
    : conv.avatar;
  return {
    ...conv,
    avatar,
    visibility: 'public',
    subtitle: `Public community · ${memberLabel}`,
  };
}

function loadStore(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return seedConversations();
    return parsed.map(normalizeCommunityConversation);
  } catch {
    return seedConversations();
  }
}

function saveStore(conversations: StoredConversation[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(conversations));
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePins(chatIds: string[]): void {
  localStorage.setItem(PINS_KEY, JSON.stringify(chatIds));
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

export function getPinnedChatIds(): string[] {
  return loadPins();
}

export function isChatPinned(chatId: string): boolean {
  if (isRemoteChatId(chatId)) {
    return remoteConversations?.find((c) => c.id === chatId)?.pinned ?? false;
  }
  return loadPins().includes(chatId);
}

export function pinChat(chatId: string): void {
  const pins = loadPins();
  if (pins.includes(chatId)) return;
  savePins([chatId, ...pins]);
}

export function unpinChat(chatId: string): void {
  savePins(loadPins().filter((id) => id !== chatId));
}

export function toggleChatPin(chatId: string): boolean {
  if (isRemoteChatId(chatId)) {
    const next = !isChatPinned(chatId);
    optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, pinned: next }));
    void setConversationPrefsRemote(chatId, { pinned: next }).catch(() => {
      optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, pinned: !next }));
    });
    return next;
  }
  if (isChatPinned(chatId)) {
    unpinChat(chatId);
    return false;
  }
  pinChat(chatId);
  return true;
}

function loadMutedChatIds(): string[] {
  try {
    const raw = localStorage.getItem(MUTES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMutedChatIds(chatIds: string[]): void {
  localStorage.setItem(MUTES_KEY, JSON.stringify(chatIds));
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

export function isChatMuted(chatId: string): boolean {
  if (isRemoteChatId(chatId)) {
    return remoteConversations?.find((c) => c.id === chatId)?.muted ?? false;
  }
  return loadMutedChatIds().includes(chatId);
}

export function muteChat(chatId: string): void {
  const muted = loadMutedChatIds();
  if (muted.includes(chatId)) return;
  saveMutedChatIds([...muted, chatId]);
}

export function unmuteChat(chatId: string): void {
  saveMutedChatIds(loadMutedChatIds().filter((id) => id !== chatId));
}

export function toggleChatMute(chatId: string): boolean {
  if (isRemoteChatId(chatId)) {
    const next = !isChatMuted(chatId);
    optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, muted: next }));
    void setConversationPrefsRemote(chatId, { muted: next }).catch(() => {
      optimisticallyUpdateRemoteConversation(chatId, (c) => ({ ...c, muted: !next }));
    });
    return next;
  }
  if (isChatMuted(chatId)) {
    unmuteChat(chatId);
    return false;
  }
  muteChat(chatId);
  return true;
}

function loadHiddenChatIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHiddenChatIds(chatIds: string[]): void {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(chatIds));
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

export function deleteConversation(chatId: string): boolean {
  if (isRemoteChatId(chatId)) {
    remoteConversations = (remoteConversations ?? []).filter((c) => c.id !== chatId);
    writeCache('chat:inbox', remoteConversations);
    notifyChatStoreChanged();
    void deleteConversationRemote(chatId).catch(() => {
      void refreshRemoteConversations(); // undo the optimistic removal if the request actually failed
    });
    return true;
  }

  unpinChat(chatId);
  unmuteChat(chatId);

  if (chatId.startsWith('event-')) {
    const hidden = loadHiddenChatIds();
    if (hidden.includes(chatId)) return false;
    saveHiddenChatIds([...hidden, chatId]);
    return true;
  }

  const store = loadStore();
  const next = store.filter((c) => c.id !== chatId);
  if (next.length === store.length) return false;
  saveStore(next);
  return true;
}

export function sortConversationsByPinAndActivity(
  conversations: ChatConversation[],
): ChatConversation[] {
  return [...conversations].sort((a, b) => {
    const aPinned = isChatPinned(a.id);
    const bPinned = isChatPinned(b.id);
    if (aPinned !== bPinned) return aPinned ? -1 : 1;
    const aTime = a.messages[a.messages.length - 1]?.createdAt ?? a.createdAt;
    const bTime = b.messages[b.messages.length - 1]?.createdAt ?? b.createdAt;
    return bTime - aTime;
  });
}

function isViewerAdmin(adminId?: string): boolean {
  if (!adminId) return false;
  return adminId === ME_AUTHOR_ID || adminId === getCurrentViewerId();
}

export function isOwnCreatedCommunityChat(chat: ChatConversation): boolean {
  return chat.type === 'community' && isViewerAdmin(chat.adminId);
}

export function isJoinedCommunityChat(chat: ChatConversation): boolean {
  return chat.type === 'community' && !isViewerAdmin(chat.adminId);
}

function loadReactionOverlay(): Record<string, Record<string, ChatReaction[]>> {
  try {
    const raw = localStorage.getItem(REACTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveReactionOverlay(overlay: Record<string, Record<string, ChatReaction[]>>): void {
  localStorage.setItem(REACTIONS_KEY, JSON.stringify(overlay));
  window.dispatchEvent(new CustomEvent(CHAT_STORE_CHANGED));
}

function seedConversations(): StoredConversation[] {
  const rahul = EVENT_ORGANIZERS.find((o) => o.name.includes('Rahul')) ?? EVENT_ORGANIZERS[0];
  const neha = EVENT_ORGANIZERS.find((o) => o.name.includes('Neha')) ?? EVENT_ORGANIZERS[1];
  const aisha = EVENT_ORGANIZERS.find((o) => o.name.includes('Aisha')) ?? EVENT_ORGANIZERS[2];

  const now = Date.now();
  return [
    {
      id: 'dm-rahul',
      type: 'dm',
      name: rahul.name,
      avatar: rahul.avatar,
      subtitle: rahul.role,
      online: true,
      memberIds: [ME_AUTHOR_ID, rahul.id],
      createdAt: now - 86400000 * 3,
      messages: [
        {
          id: 'dm-rahul-1',
          authorId: rahul.id,
          authorName: rahul.name,
          kind: 'text',
          text: 'Hey, are you down for the cricket match this Sunday?',
          createdAt: now - 86400000,
          reactions: [],
        },
        {
          id: 'dm-rahul-2',
          authorId: ME_AUTHOR_ID,
          authorName: getCurrentUserOrganizer().name,
          kind: 'text',
          text: 'Yeah, definitely! What time does it start?',
          createdAt: now - 86400000 + 180000,
          reactions: [{ emoji: '👏', userId: rahul.id, userName: rahul.name }],
        },
        {
          id: 'dm-rahul-3',
          authorId: rahul.id,
          authorName: rahul.name,
          kind: 'text',
          text: 'We start at 9 AM in Gachibowli. See you there!',
          createdAt: now - 86400000 + 300000,
          reactions: [],
        },
      ],
    },
    {
      id: 'dm-neha',
      type: 'dm',
      name: neha.name,
      avatar: neha.avatar,
      subtitle: neha.role,
      online: true,
      memberIds: [ME_AUTHOR_ID, neha.id],
      createdAt: now - 86400000 * 5,
      messages: [
        {
          id: 'dm-neha-1',
          authorId: neha.id,
          authorName: neha.name,
          kind: 'text',
          text: 'Hi! Thanks for attending the open mic night!',
          createdAt: now - 86400000 * 2,
          reactions: [],
        },
        {
          id: 'dm-neha-2',
          authorId: ME_AUTHOR_ID,
          authorName: getCurrentUserOrganizer().name,
          kind: 'text',
          text: 'It was amazing! The performances were great.',
          createdAt: now - 86400000 * 2 + 120000,
          reactions: [{ emoji: '❤️', userId: neha.id, userName: neha.name }],
        },
      ],
    },
    {
      id: 'dm-aisha',
      type: 'dm',
      name: aisha.name,
      avatar: aisha.avatar,
      subtitle: aisha.role,
      online: false,
      memberIds: [ME_AUTHOR_ID, aisha.id],
      createdAt: now - 86400000 * 7,
      messages: [
        {
          id: 'dm-aisha-1',
          authorId: aisha.id,
          authorName: aisha.name,
          kind: 'text',
          text: 'Group yoga session is scheduled for Saturday morning.',
          createdAt: now - 86400000 * 3,
          reactions: [],
        },
      ],
    },
  ];
}

function hydrateMessage(msg: StoredMessage, reactionOverlay: ChatReaction[]): ChatMessage {
  const reactions = [...(msg.reactions ?? []), ...reactionOverlay];
  return {
    ...msg,
    reactions,
    sender: msg.authorId === ME_AUTHOR_ID ? 'me' : 'other',
    time: formatTime(msg.createdAt),
  };
}

function membersFromIds(ids: string[]): ChatMember[] {
  const unique = [...new Set(ids)];
  return unique.map((id) => {
    if (id === ME_AUTHOR_ID) return meMember();
    const org = EVENT_ORGANIZERS.find((o) => o.id === id);
    if (org) return organizerToMember(org);
    return { id, name: 'Member', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', role: 'Member' };
  });
}

function hydrateConversation(stored: StoredConversation): ChatConversation {
  const overlay = loadReactionOverlay()[stored.id] ?? {};
  return {
    id: stored.id,
    type: stored.type,
    name: stored.name,
    avatar: stored.avatar,
    subtitle: stored.subtitle,
    online: stored.online,
    adminId: stored.adminId,
    communityId: stored.communityId,
    visibility: stored.visibility,
    members: membersFromIds(stored.memberIds),
    createdAt: stored.createdAt,
    messages: stored.messages.map((m) => hydrateMessage(m, overlay[m.id] ?? [])),
  };
}

const EVENT_DEMO_MEMBERS = [
  { id: 'org-priya', name: 'Priya Reddy' },
  { id: 'org-arjun', name: 'Arjun Mehta' },
  { id: 'org-sneha', name: 'Sneha Kapoor' },
];

function eventChatToConversation(
  eventChat: ReturnType<typeof getEventChats>[number],
): ChatConversation {
  const overlay = loadReactionOverlay()[`event-${eventChat.eventId}`] ?? {};
  const hostMember: ChatMember = {
    id: 'event-host',
    name: eventChat.hostName,
    avatar: eventChat.avatar,
    role: 'Host',
  };
  const demoMembers = EVENT_DEMO_MEMBERS.map((m) => {
    const org = EVENT_ORGANIZERS.find((o) => o.id === m.id);
    return org
      ? organizerToMember(org)
      : { id: m.id, name: m.name, avatar: eventChat.avatar, role: 'Member' };
  });

  return {
    id: `event-${eventChat.eventId}`,
    type: 'event',
    name: eventChat.title,
    avatar: eventChat.avatar,
    subtitle: `Event group · hosted by ${eventChat.hostName}`,
    online: true,
    eventId: eventChat.eventId,
    adminId: 'event-host',
    members: [meMember(), hostMember, ...demoMembers],
    createdAt: eventChat.joinedAt,
    messages: eventChat.messages.map((msg) => {
      const authorId = msg.sender === 'me' ? ME_AUTHOR_ID : 'event-member';
      const stored: StoredMessage = {
        id: String(msg.id),
        authorId,
        authorName: msg.authorName ?? (msg.sender === 'me' ? getCurrentUserOrganizer().name : 'Member'),
        kind: 'text',
        text: msg.text,
        createdAt: Date.now(),
        reactions: overlay[String(msg.id)] ?? [],
      };
      return hydrateMessage(stored, []);
    }),
  };
}

function pruneLocalCommunityShadows(): void {
  if (!isBackendEnabled()) return;
  const store = loadStore();
  const next = store.filter((c) => c.type !== 'community');
  if (next.length === store.length) return;
  // Write silently — getAllConversations already hides these rows. Emitting
  // CHAT_STORE_CHANGED from a render-time read would loop the inbox.
  localStorage.setItem(STORE_KEY, JSON.stringify(next));
}

export function getAllConversations(): ChatConversation[] {
  const backendEnabled = isBackendEnabled();
  if (backendEnabled) pruneLocalCommunityShadows();
  const hidden = new Set(loadHiddenChatIds());
  const stored = loadStore()
    .map(hydrateConversation)
    .filter((c) => !hidden.has(c.id))
    // Once a backend is live, real dm/group/community chats come from the API
    // instead — local demo dm-*/group-*/community-chat-* rows would otherwise
    // show up as dead-end duplicates (empty members, no history).
    .filter((c) => !(backendEnabled && (c.type === 'dm' || c.type === 'group' || c.type === 'community')));
  const events = getEventChats()
    .map(eventChatToConversation)
    .filter((c) => !hidden.has(c.id));

  let remote: ChatConversation[] = [];
  if (backendEnabled) {
    if (remoteConversations === null) {
      void refreshRemoteConversations();
    } else {
      remote = remoteConversations.map(remoteToChatConversation);
    }
  }

  const seen = new Set<string>();
  const all: ChatConversation[] = [];
  for (const c of [...events, ...remote, ...stored]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    all.push(c);
  }
  return sortConversationsByPinAndActivity(collapseUnusedGroupDuplicates(all));
}

/** Accidental Create-group retries leave several empty chats with the same
 * name and the same people. Keep the active one; hide the unused clones. */
function collapseUnusedGroupDuplicates(conversations: ChatConversation[]): ChatConversation[] {
  const byKey = new Map<string, ChatConversation[]>();
  for (const c of conversations) {
    if (c.type !== 'group') continue;
    const key = `${c.name.trim().toLowerCase()}::${[...c.members.map((m) => m.id)].sort().join(',')}`;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }
  const hide = new Set<string>();
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const withActivity = list.filter((c) => c.messages.length > 0);
    const keep = withActivity[0] ?? [...list].sort((a, b) => b.createdAt - a.createdAt)[0];
    for (const c of list) {
      if (c.id !== keep.id && c.messages.length === 0) hide.add(c.id);
    }
  }
  if (hide.size === 0) return conversations;
  return conversations.filter((c) => !hide.has(c.id));
}

let remoteContactsCache: PublicUserDto[] | null = readCache<PublicUserDto[]>('users:all');
let remoteContactsRefreshInFlight: Promise<void> | null = null;

function refreshRemoteContacts(force = false): Promise<void> {
  if (remoteContactsRefreshInFlight) return remoteContactsRefreshInFlight;
  remoteContactsRefreshInFlight = listUsers(undefined, { force })
    .then((users) => {
      remoteContactsCache = users;
      notifyChatStoreChanged();
    })
    .catch(() => {
      remoteContactsCache = remoteContactsCache ?? [];
    })
    .finally(() => {
      remoteContactsRefreshInFlight = null;
    });
  return remoteContactsRefreshInFlight;
}

/** Reload the people directory. Empty lists retry; `force` hits the server. */
export function ensureContactsLoaded(force = false): void {
  if (!isBackendEnabled()) return;
  if (!force && remoteContactsCache && remoteContactsCache.length > 0) return;
  void refreshRemoteContacts(force || !remoteContactsCache?.length);
}

/** Contacts for starting a DM / adding group members. Real user directory
 * once a backend is live; the mock organizer roster in demo mode. */
export function getAvailableContacts(): ChatMember[] {
  if (isBackendEnabled()) {
    if (remoteContactsCache === null) {
      void refreshRemoteContacts();
      return [];
    }
    return remoteContactsCache.map((u) => ({
      id: u.id,
      name: u.fullName || u.username,
      avatar: u.avatarUrl,
      role: 'Member',
      username: u.username,
    }));
  }

  const me = meMember();
  return [
    me,
    ...EVENT_ORGANIZERS.filter((o) => o.id !== ME_AUTHOR_ID).map(organizerToMember),
  ];
}

export function messagePreview(msg: ChatMessage): string {
  if (msg.kind === 'post') return `📎 ${msg.sharedPost?.eventTitle ?? 'Shared a post'}`;
  if (msg.kind === 'video') return '🎬 Shared a video';
  if (msg.kind === 'image') return '📷 Photo';
  return msg.text ?? '';
}

function updateStoredConversation(
  chatId: string,
  updater: (conv: StoredConversation) => StoredConversation,
): void {
  const store = loadStore();
  const idx = store.findIndex((c) => c.id === chatId);
  if (idx === -1) return;
  store[idx] = updater(store[idx]);
  saveStore(store);
}

function appendStoredMessage(chatId: string, message: StoredMessage): void {
  updateStoredConversation(chatId, (conv) => ({
    ...conv,
    messages: [...conv.messages, message],
  }));
}

export function sendTextMessage(chatId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (chatId.startsWith('event-')) {
    const eventId = chatId.replace('event-', '');
    appendEventChatMessage(eventId, trimmed);
    return;
  }

  if (isRemoteChatId(chatId)) {
    void sendMessageRemote(chatId, { kind: 'text', text: trimmed })
      .then((msg) => appendRemoteMessage(chatId, msg))
      .catch(() => {
        /* best-effort for v1 — a failed send just silently doesn't appear */
      });
    return;
  }

  const me = getCurrentUserOrganizer();
  appendStoredMessage(chatId, {
    id: `${chatId}-${Date.now()}`,
    authorId: ME_AUTHOR_ID,
    authorName: me.name,
    kind: 'text',
    text: trimmed,
    createdAt: Date.now(),
    reactions: [],
  });
}

export function sendSharedPost(chatId: string, post: HomeFeedPost): void {
  if (chatId.startsWith('event-')) {
    const eventId = chatId.replace('event-', '');
    appendEventChatMessage(eventId, `📎 Shared: ${post.eventTitle} — ${post.caption.slice(0, 80)}`);
    return;
  }

  if (isRemoteChatId(chatId)) {
    void sendMessageRemote(chatId, { kind: 'post', sharedPostId: post.id })
      .then((msg) => appendRemoteMessage(chatId, msg))
      .catch(() => {});
    return;
  }

  const me = getCurrentUserOrganizer();
  const author = ORGANIZER_BY_ID[post.authorId] ?? me;
  const ref: SharedPostRef = {
    postId: post.id,
    caption: post.caption,
    eventTitle: post.eventTitle,
    image: post.image,
    videoUrl: post.videoUrl,
    authorName: author.name,
    authorAvatar: author.avatar,
    postType: post.type,
  };

  appendStoredMessage(chatId, {
    id: `${chatId}-${Date.now()}`,
    authorId: ME_AUTHOR_ID,
    authorName: me.name,
    kind: 'post',
    sharedPost: ref,
    createdAt: Date.now(),
    reactions: [],
  });
}

export function sendVideoMessage(chatId: string, videoUrl: string, caption?: string): void {
  if (chatId.startsWith('event-')) {
    const eventId = chatId.replace('event-', '');
    appendEventChatMessage(eventId, caption ? `🎬 ${caption}` : '🎬 Shared a video');
    return;
  }

  if (isRemoteChatId(chatId)) {
    void sendMessageRemote(chatId, { kind: 'video', mediaUrl: videoUrl, text: caption })
      .then((msg) => appendRemoteMessage(chatId, msg))
      .catch(() => {});
    return;
  }

  const me = getCurrentUserOrganizer();
  appendStoredMessage(chatId, {
    id: `${chatId}-${Date.now()}`,
    authorId: ME_AUTHOR_ID,
    authorName: me.name,
    kind: 'video',
    mediaUrl: videoUrl,
    text: caption,
    createdAt: Date.now(),
    reactions: [],
  });
}

/** Uploads a real photo / video picked from the device, then posts it into the
 * chat. Live backend: stored via /api/uploads and delivered to everyone in the
 * conversation. Resolves with the uploaded media type. */
export async function sendMediaMessage(chatId: string, file: File): Promise<'image' | 'video'> {
  const kind = uploadKindFromFile(file);
  if (!kind) {
    throw new Error('Choose a photo or a video');
  }

  let toUpload = file;
  if (kind === 'image' && isBackendEnabled()) {
    toUpload = await prepareImageForUpload(file);
  }
  if (toUpload.size > bytesFromMb(UPLOAD_MAX_MB[kind])) {
    throw new Error(
      kind === 'video'
        ? `Video is too large (max ${UPLOAD_MAX_MB.video} MB).`
        : `Photo is still too large after resizing (max ${UPLOAD_MAX_MB.image} MB).`,
    );
  }

  if (!isBackendEnabled()) {
    // Offline demo mode: keep it on-device so the flow still works.
    const url = URL.createObjectURL(file);
    if (kind === 'video') {
      sendVideoMessage(chatId, url);
    } else {
      const me = getCurrentUserOrganizer();
      appendStoredMessage(chatId, {
        id: `${chatId}-${Date.now()}`,
        authorId: ME_AUTHOR_ID,
        authorName: me.name,
        kind: 'image',
        mediaUrl: url,
        createdAt: Date.now(),
        reactions: [],
      });
    }
    return kind;
  }

  const uploaded = await uploadFile(toUpload, toUpload.name);

  if (chatId.startsWith('event-')) {
    appendEventChatMessage(chatId.replace('event-', ''), uploaded.url);
    return kind;
  }

  if (isRemoteChatId(chatId)) {
    const msg = await sendMessageRemote(chatId, { kind, mediaUrl: uploaded.url });
    appendRemoteMessage(chatId, msg);
    return kind;
  }

  if (kind === 'video') {
    sendVideoMessage(chatId, uploaded.url);
  } else {
    const me = getCurrentUserOrganizer();
    appendStoredMessage(chatId, {
      id: `${chatId}-${Date.now()}`,
      authorId: ME_AUTHOR_ID,
      authorName: me.name,
      kind: 'image',
      mediaUrl: uploaded.url,
      createdAt: Date.now(),
      reactions: [],
    });
  }
  return kind;
}

export function toggleReaction(chatId: string, messageId: string, emoji: string): void {
  const me = getCurrentUserOrganizer();

  if (chatId.startsWith('event-')) {
    const overlay = loadReactionOverlay();
    const key = chatId;
    const msgReactions = overlay[key]?.[messageId] ?? [];
    const existing = msgReactions.find((r) => r.userId === ME_AUTHOR_ID && r.emoji === emoji);
    if (existing) {
      overlay[key] = {
        ...overlay[key],
        [messageId]: msgReactions.filter((r) => !(r.userId === ME_AUTHOR_ID && r.emoji === emoji)),
      };
    } else {
      const withoutMine = msgReactions.filter((r) => r.userId !== ME_AUTHOR_ID);
      overlay[key] = {
        ...overlay[key],
        [messageId]: [...withoutMine, { emoji, userId: ME_AUTHOR_ID, userName: me.name }],
      };
    }
    saveReactionOverlay(overlay);
    return;
  }

  if (isRemoteChatId(chatId)) {
    void toggleReactionRemote(messageId, emoji)
      .then((reactions) => {
        const messages = remoteMessagesById.get(chatId);
        if (!messages) return;
        remoteMessagesById.set(
          chatId,
          messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
        );
        notifyChatStoreChanged();
      })
      .catch(() => {});
    return;
  }

  updateStoredConversation(chatId, (conv) => ({
    ...conv,
    messages: conv.messages.map((msg) => {
      if (msg.id !== messageId) return msg;
      const existing = msg.reactions.find((r) => r.userId === ME_AUTHOR_ID && r.emoji === emoji);
      if (existing) {
        return {
          ...msg,
          reactions: msg.reactions.filter((r) => !(r.userId === ME_AUTHOR_ID && r.emoji === emoji)),
        };
      }
      const withoutMine = msg.reactions.filter((r) => r.userId !== ME_AUTHOR_ID);
      return {
        ...msg,
        reactions: [...withoutMine, { emoji, userId: ME_AUTHOR_ID, userName: me.name }],
      };
    }),
  }));
}

/** Creates a group chat. Async in both modes (backend mode obviously needs
 * the network round-trip; kept consistent so callers don't need to branch). */
export async function createGroup(name: string, memberIds: string[]): Promise<ChatConversation | null> {
  const trimmed = name.trim();
  if (!trimmed || memberIds.length === 0) return null;

  if (isBackendEnabled()) {
    try {
      const dto = await createConversationRemote({ type: 'group', name: trimmed, memberIds });
      remoteConversations = [dto, ...(remoteConversations ?? [])];
      writeCache('chat:inbox', remoteConversations);
      notifyChatStoreChanged();
      return remoteToChatConversation(dto);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Could not create the group');
    }
  }

  const me = getCurrentUserOrganizer();
  const allIds = [ME_AUTHOR_ID, ...memberIds.filter((id) => id !== ME_AUTHOR_ID)];
  const id = `group-${Date.now()}`;
  const members = membersFromIds(allIds);
  const avatar =
    members.find((m) => m.id !== ME_AUTHOR_ID)?.avatar ??
    'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150';

  const conv: StoredConversation = {
    id,
    type: 'group',
    name: trimmed,
    avatar,
    subtitle: `${members.length} members`,
    adminId: ME_AUTHOR_ID,
    memberIds: allIds,
    createdAt: Date.now(),
    messages: [
      {
        id: `${id}-welcome`,
        authorId: ME_AUTHOR_ID,
        authorName: me.name,
        kind: 'text',
        text: `Created group "${trimmed}". Say hi! 👋`,
        createdAt: Date.now(),
        reactions: [],
      },
    ],
  };

  saveStore([conv, ...loadStore()]);
  return hydrateConversation(conv);
}

export function createCommunityChat(input: {
  communityId: string;
  name: string;
  avatar?: string;
  memberIds?: string[];
}): ChatConversation | null {
  if (isBackendEnabled()) {
    const remote = findRemoteCommunityConversation(input.communityId);
    return remote ? remoteToChatConversation(remote) : null;
  }

  const trimmed = input.name.trim();
  if (!trimmed) return null;

  const me = getCurrentUserOrganizer();
  const id = `community-chat-${input.communityId}`;
  const memberIds = [
    ME_AUTHOR_ID,
    ...(input.memberIds ?? []).filter((memberId) => memberId !== ME_AUTHOR_ID),
  ].filter((memberId, index, all) => all.indexOf(memberId) === index);
  const memberCount = memberIds.length;
  const avatar = input.avatar?.trim() || getDefaultCommunityAvatarForCreator(ME_AUTHOR_ID);
  const memberLabel = memberCount === 1 ? '1 member' : `${memberCount} members`;

  const conv: StoredConversation = {
    id,
    type: 'community',
    name: trimmed,
    avatar,
    subtitle: `Public community · ${memberLabel}`,
    adminId: ME_AUTHOR_ID,
    communityId: input.communityId,
    visibility: 'public',
    memberIds,
    createdAt: Date.now(),
    messages: [
      {
        id: `${id}-welcome`,
        authorId: ME_AUTHOR_ID,
        authorName: me.name,
        kind: 'text',
        text: `Welcome to "${trimmed}" — your community chat is live. Invite members and start the conversation! 👋`,
        createdAt: Date.now(),
        reactions: [],
      },
    ],
  };

  saveStore([conv, ...loadStore()]);
  pinChat(id);
  return hydrateConversation(conv);
}

export function ensureJoinedCommunityChat(input: {
  communityId: string;
  name: string;
  adminId: string;
}): ChatConversation {
  if (isBackendEnabled()) {
    const remote = findRemoteCommunityConversation(input.communityId);
    if (remote) return remoteToChatConversation(remote);
    return {
      id: resolveConversationId(`community-chat-${input.communityId}`),
      type: 'community',
      name: input.name,
      avatar: getDefaultCommunityAvatarForCreator(input.adminId),
      subtitle: 'Community',
      adminId: input.adminId,
      communityId: input.communityId,
      visibility: 'public',
      members: [],
      createdAt: Date.now(),
      messages: [],
    };
  }

  const id = `community-chat-${input.communityId}`;
  const store = loadStore();
  const existingIdx = store.findIndex((c) => c.id === id);
  const me = getCurrentUserOrganizer();

  if (existingIdx !== -1) {
    const existing = store[existingIdx];
    if (!existing.memberIds.includes(ME_AUTHOR_ID)) {
      store[existingIdx] = normalizeCommunityConversation({
        ...existing,
        memberIds: [...existing.memberIds, ME_AUTHOR_ID],
        messages: [
          ...existing.messages,
          {
            id: `${id}-join-${Date.now()}`,
            authorId: ME_AUTHOR_ID,
            authorName: me.name,
            kind: 'text',
            text: `${me.name} joined the community 👋`,
            createdAt: Date.now(),
            reactions: [],
          },
        ],
      });
      saveStore(store);
    }
    return hydrateConversation(store[existingIdx]);
  }

  const admin = EVENT_ORGANIZERS.find((o) => o.id === input.adminId);
  const conv: StoredConversation = normalizeCommunityConversation({
    id,
    type: 'community',
    name: input.name,
    avatar: getDefaultCommunityAvatarForCreator(input.adminId),
    subtitle: 'Public community · 2 members',
    adminId: input.adminId,
    communityId: input.communityId,
    visibility: 'public',
    memberIds: [input.adminId, ME_AUTHOR_ID],
    createdAt: Date.now() - 86_400_000,
    messages: [
      {
        id: `${id}-welcome`,
        authorId: input.adminId,
        authorName: admin?.name ?? 'Host',
        kind: 'text',
        text: `Welcome to "${input.name}" — say hi to the crew! 👋`,
        createdAt: Date.now() - 86_400_000,
        reactions: [],
      },
    ],
  });

  saveStore([conv, ...store]);
  return hydrateConversation(conv);
}

export function addGroupMember(chatId: string, memberId: string): boolean {
  if (isRemoteChatId(chatId)) {
    void addGroupMemberRemote(chatId, memberId)
      .then((dto) => {
        remoteConversations = (remoteConversations ?? []).map((c) => (c.id === chatId ? dto : c));
        writeCache('chat:inbox', remoteConversations);
        notifyChatStoreChanged();
      })
      .catch(() => {});
    return true;
  }

  const conv = loadStore().find((c) => c.id === chatId);
  if (!conv || (conv.type !== 'group' && conv.type !== 'community') || conv.adminId !== ME_AUTHOR_ID) return false;
  if (conv.memberIds.includes(memberId)) return false;

  const member = EVENT_ORGANIZERS.find((o) => o.id === memberId);
  if (!member) return false;

  updateStoredConversation(chatId, (c) => ({
    ...c,
    memberIds: [...c.memberIds, memberId],
    subtitle: `${c.memberIds.length + 1} members`,
    messages: [
      ...c.messages,
      {
        id: `${chatId}-sys-${Date.now()}`,
        authorId: ME_AUTHOR_ID,
        authorName: getCurrentUserOrganizer().name,
        kind: 'text',
        text: `Added ${member.name} to the group`,
        createdAt: Date.now(),
        reactions: [],
      },
    ],
  }));
  return true;
}

export function removeGroupMember(chatId: string, memberId: string): boolean {
  if (isRemoteChatId(chatId)) {
    void removeGroupMemberRemote(chatId, memberId)
      .then(() => refreshRemoteConversations())
      .catch(() => {});
    return true;
  }

  const conv = loadStore().find((c) => c.id === chatId);
  if (!conv || (conv.type !== 'group' && conv.type !== 'community') || conv.adminId !== ME_AUTHOR_ID) return false;
  if (memberId === ME_AUTHOR_ID) return false;
  if (!conv.memberIds.includes(memberId)) return false;

  const member = EVENT_ORGANIZERS.find((o) => o.id === memberId);

  updateStoredConversation(chatId, (c) => ({
    ...c,
    memberIds: c.memberIds.filter((id) => id !== memberId),
    subtitle: `${c.memberIds.length - 1} members`,
    messages: [
      ...c.messages,
      {
        id: `${chatId}-sys-${Date.now()}`,
        authorId: ME_AUTHOR_ID,
        authorName: getCurrentUserOrganizer().name,
        kind: 'text',
        text: `Removed ${member?.name ?? 'member'} from the group`,
        createdAt: Date.now(),
        reactions: [],
      },
    ],
  }));
  return true;
}

export function isGroupAdmin(chat: ChatConversation): boolean {
  // Communities/local groups always run under the mock "me" identity
  // (ME_AUTHOR_ID) even in backend mode — out of scope this phase. Only
  // real remote groups compare against the actual signed-in user.
  if (isRemoteChatId(chat.id)) return chat.adminId === getCurrentViewerId();
  return chat.adminId === ME_AUTHOR_ID;
}

export function subscribeChatStore(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(CHAT_STORE_CHANGED, handler);
  window.addEventListener(EVENT_CHATS_CHANGED_EVENT, handler);
  return () => {
    window.removeEventListener(CHAT_STORE_CHANGED, handler);
    window.removeEventListener(EVENT_CHATS_CHANGED_EVENT, handler);
  };
}

/** Sample videos users can share in chat */
export const SAMPLE_VIDEOS = [
  {
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    label: 'Workout clip',
  },
  {
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    label: 'Event highlight',
  },
];
