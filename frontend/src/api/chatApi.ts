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
import {
  API_ROUTES,
  type ChatReactionDto,
  type ConversationCreatePayload,
  type ConversationDto,
  type ConversationPrefsPayload,
  type MessageCreatePayload,
  type MessageDto,
} from './types';

export async function listConversationsRemote(): Promise<ConversationDto[]> {
  return apiGet<ConversationDto[]>(API_ROUTES.conversations);
}

export async function createConversationRemote(payload: ConversationCreatePayload): Promise<ConversationDto> {
  return apiPost<ConversationDto>(API_ROUTES.conversations, payload);
}

export async function getMessagesRemote(conversationId: string, before?: string): Promise<MessageDto[]> {
  return apiGet<MessageDto[]>(API_ROUTES.messages(conversationId), { params: before ? { before } : undefined });
}

export async function sendMessageRemote(conversationId: string, payload: MessageCreatePayload): Promise<MessageDto> {
  return apiPost<MessageDto>(API_ROUTES.messages(conversationId), payload);
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
