/**
 * Chat Phase API facade — real, shared DM/group chat backed by Supabase
 * Postgres, replacing the localStorage `simsor-chat-store-v2` slice for those
 * two conversation types (event chats + communities are unaffected). No mock
 * fallback here: callers should branch on `isBackendEnabled()` themselves,
 * same pattern as postsApi.ts/followApi.ts.
 *
 * Live delivery of new messages/prefs happens separately over Supabase
 * Realtime — see frontend/src/lib/chatRealtime.ts. This file is REST only.
 */
import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import { CACHE_TTL, cachedGet, invalidateCache } from '../lib/deviceCache';
import {
  API_ROUTES,
  type ChatReactionDto,
  type ConversationCreatePayload,
  type ConversationDto,
  type ConversationPrefsPayload,
  type MessageCreatePayload,
  type MessageDto,
} from './types';

export async function listConversationsRemote(opts?: { force?: boolean }): Promise<ConversationDto[]> {
  return cachedGet('chat:inbox', () => apiGet<ConversationDto[]>(API_ROUTES.conversations), {
    maxAgeMs: CACHE_TTL.chatInbox,
    force: opts?.force,
  });
}

export async function createConversationRemote(payload: ConversationCreatePayload): Promise<ConversationDto> {
  return apiPost<ConversationDto>(API_ROUTES.conversations, payload);
}

export async function getMessagesRemote(
  conversationId: string,
  before?: string,
  opts?: { force?: boolean },
): Promise<MessageDto[]> {
  if (before) {
    return apiGet<MessageDto[]>(API_ROUTES.messages(conversationId), { params: { before } });
  }
  return cachedGet(
    `chat:msgs:${conversationId}`,
    () => apiGet<MessageDto[]>(API_ROUTES.messages(conversationId)),
    { maxAgeMs: CACHE_TTL.chatMessages, force: opts?.force },
  );
}

export async function sendMessageRemote(conversationId: string, payload: MessageCreatePayload): Promise<MessageDto> {
  const message = await apiPost<MessageDto>(API_ROUTES.messages(conversationId), payload);
  invalidateCache('chat:inbox');
  return message;
}

export async function markConversationReadRemote(conversationId: string): Promise<void> {
  await apiPatch(API_ROUTES.conversationRead(conversationId));
}

export async function setConversationPrefsRemote(
  conversationId: string,
  prefs: ConversationPrefsPayload,
): Promise<void> {
  await apiPatch(API_ROUTES.conversationPrefs(conversationId), prefs);
}

/** Soft-delete: hides the conversation for the caller only. */
export async function deleteConversationRemote(conversationId: string): Promise<void> {
  await apiDelete(API_ROUTES.conversationById(conversationId));
}

export async function toggleReactionRemote(messageId: string, emoji: string): Promise<ChatReactionDto[]> {
  return apiPost<ChatReactionDto[]>(API_ROUTES.messageReactions(messageId), { emoji });
}

export async function addGroupMemberRemote(conversationId: string, userId: string): Promise<ConversationDto> {
  return apiPost<ConversationDto>(API_ROUTES.conversationMembers(conversationId), { userId });
}

export async function removeGroupMemberRemote(conversationId: string, userId: string): Promise<void> {
  await apiDelete(API_ROUTES.conversationMemberById(conversationId, userId));
}
