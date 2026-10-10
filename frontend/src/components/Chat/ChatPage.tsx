import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronRight,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pin,
  Search,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import type { HomeFeedPost } from '../HomeFeed/homeFeed';
import { ME_AUTHOR_ID } from '../ExplorePage/exploreEvents';
import toast from 'react-hot-toast';
import { isBackendEnabled } from '../../api/client';
import { listUsers } from '../../api/usersApi';
import {
  addGroupMember,
  closeRemoteConversationRealtime,
  createDirectMessage,
  createGroup,
  deleteConversation,
  ensureRemoteMessagesLoaded,
  getAllConversations,
  getAvailableContacts,
  isChatMuted,
  isChatPinned,
  isGroupAdmin,
  isJoinedCommunityChat,
  isOwnCreatedCommunityChat,
  isSomeoneTyping,
  markConversationReadIfRemote,
  messagePreview,
  notifyTyping,
  openRemoteConversationRealtime,
  removeGroupMember,
  REACTION_EMOJIS,
  sendSharedPost,
  sendTextMessage,
  sendMediaMessage,
  subscribeChatStore,
  toggleChatMute,
  toggleChatPin,
  toggleReaction,
  type ChatConversation,
  type ChatMember,
  type ChatMessage,
} from './chatStore';
import {
  deleteOwnedCommunityByChatId,
  getAllCommunities,
  leaveCommunityByChatId,
  subscribeCommunities,
} from '../profile/communitiesStore';
import './ChatPage.css';

type ChatPageProps = {
  feedPosts: HomeFeedPost[];
  createGroupOpen?: boolean;
  onCreateGroupOpenChange?: (open: boolean) => void;
  initialChatId?: string | null;
  onInitialChatConsumed?: () => void;
};

type InboxFilter = 'chats' | 'communities';

function matchesInboxFilter(chat: ChatConversation, filter: InboxFilter): boolean {
  if (chat.type === 'community') {
    if (isOwnCreatedCommunityChat(chat)) return filter === 'chats';
    if (isJoinedCommunityChat(chat)) return filter === 'communities';
    return false;
  }
  return filter === 'chats';
}

function groupReactions(reactions: ChatMessage['reactions']): { emoji: string; count: number; mine: boolean }[] {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const prev = map.get(r.emoji) ?? { count: 0, mine: false };
    map.set(r.emoji, { count: prev.count + 1, mine: prev.mine || r.userId === ME_AUTHOR_ID });
  }
  return [...map.entries()].map(([emoji, data]) => ({ emoji, ...data }));
}

export default function ChatPage({
  feedPosts,
  createGroupOpen = false,
  onCreateGroupOpenChange,
  initialChatId = null,
  onInitialChatConsumed,
}: ChatPageProps) {
  const [conversations, setConversations] = useState<ChatConversation[]>(() => getAllConversations());
  const [activeChatId, setActiveChatId] = useState<string>(() => getAllConversations()[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('chats');
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(createGroupOpen);

  useEffect(() => {
    if (createGroupOpen) setShowCreateGroup(true);
  }, [createGroupOpen]);

  useEffect(() => {
    if (!initialChatId) return;
    const target = getAllConversations().find((c) => c.id === initialChatId);
    if (target && isJoinedCommunityChat(target)) setInboxFilter('communities');
    else setInboxFilter('chats');
    setActiveChatId(initialChatId);
    setMobileShowConversation(true);
    onInitialChatConsumed?.();
  }, [initialChatId, onInitialChatConsumed]);

  const closeCreateGroup = () => {
    setShowCreateGroup(false);
    onCreateGroupOpenChange?.(false);
  };
  const [showMembers, setShowMembers] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showPostPicker, setShowPostPicker] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const handleMediaPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChat) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Please choose a photo or a video');
      return;
    }
    const limit = file.type.startsWith('video/') ? 50 : 15;
    if (file.size > limit * 1024 * 1024) {
      toast.error(`File is too large (max ${limit} MB)`);
      return;
    }
    setIsSendingMedia(true);
    const toastId = toast.loading(file.type.startsWith('video/') ? 'Sending video...' : 'Sending photo...');
    try {
      await sendMediaMessage(activeChat.id, file);
      toast.success('Sent', { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the file', { id: toastId });
    } finally {
      setIsSendingMedia(false);
    }
  };
  const [reactionTarget, setReactionTarget] = useState<{ chatId: string; messageId: string } | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [sessionActionTarget, setSessionActionTarget] = useState<ChatConversation | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const [contacts, setContacts] = useState<ChatMember[]>(() => getAvailableContacts());
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState<ChatMember[] | null>(null);
  const [peopleSearching, setPeopleSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const sessionLongPressTimer = useRef<number | null>(null);
  const sessionLongPressTriggered = useRef(false);
  const lastTypingBroadcastRef = useRef(0);

  const refresh = useCallback(() => {
    getAllCommunities();
    setConversations(getAllConversations());
    setContacts(getAvailableContacts());
  }, []);

  useEffect(() => subscribeChatStore(refresh), [refresh]);

  // Server-side people search (username / full name) for the New message and
  // New group pickers. Debounced so we don't hit the API on every keystroke.
  useEffect(() => {
    const term = peopleQuery.trim().replace(/^@/, '');
    if (!term || !isBackendEnabled()) {
      setPeopleResults(null);
      setPeopleSearching(false);
      return;
    }
    let cancelled = false;
    setPeopleSearching(true);
    const timer = window.setTimeout(async () => {
      const users = await listUsers(term);
      if (cancelled) return;
      setPeopleResults(
        users.map((u) => ({
          id: u.id,
          name: u.fullName || u.username,
          avatar: u.avatarUrl,
          role: 'Member',
          username: u.username,
        })),
      );
      setPeopleSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [peopleQuery]);

  useEffect(() => {
    if (!showNewChat && !showCreateGroup) setPeopleQuery('');
  }, [showNewChat, showCreateGroup]);

  // Hide stale rows while a new query is in flight so results never belong to
  // the previous search term.
  const pickerPeople = peopleSearching
    ? []
    : (peopleResults ?? contacts).filter((c) => c.id !== ME_AUTHOR_ID);
  useEffect(() => subscribeCommunities(refresh), [refresh]);

  const activeChat = useMemo(
    () => conversations.find((c) => c.id === activeChatId) ?? conversations[0],
    [conversations, activeChatId],
  );

  // Opens the realtime channel (new messages + presence/typing) for whichever
  // conversation is active, loads its full history on first open, and marks
  // it read. All four helpers are no-ops for local (event/community/mock)
  // chat ids, so it's safe to call unconditionally on every switch.
  useEffect(() => {
    if (!activeChatId) return;
    ensureRemoteMessagesLoaded(activeChatId);
    markConversationReadIfRemote(activeChatId);
    openRemoteConversationRealtime(activeChatId);
    return () => closeRemoteConversationRealtime(activeChatId);
  }, [activeChatId]);

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!matchesInboxFilter(c, inboxFilter)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        messagePreview(c.messages[c.messages.length - 1] ?? ({} as ChatMessage))
          .toLowerCase()
          .includes(q)
      );
    });
  }, [conversations, searchQuery, inboxFilter]);

  const handleTogglePin = (chatId: string) => {
    toggleChatPin(chatId);
    refresh();
  };

  const clearSessionLongPress = () => {
    if (sessionLongPressTimer.current) {
      clearTimeout(sessionLongPressTimer.current);
      sessionLongPressTimer.current = null;
    }
  };

  const handleSessionPointerDown = (session: ChatConversation) => {
    sessionLongPressTriggered.current = false;
    clearSessionLongPress();
    sessionLongPressTimer.current = window.setTimeout(() => {
      sessionLongPressTriggered.current = true;
      setSessionActionTarget(session);
    }, 480);
  };

  const handleSessionPointerUp = () => {
    clearSessionLongPress();
  };

  const handleSessionClick = (id: string) => {
    if (sessionLongPressTriggered.current) {
      sessionLongPressTriggered.current = false;
      return;
    }
    openConversation(id);
  };

  const closeSessionActions = () => setSessionActionTarget(null);

  const handleSessionPinAction = () => {
    if (!sessionActionTarget) return;
    handleTogglePin(sessionActionTarget.id);
    closeSessionActions();
  };

  const handleSessionMuteAction = () => {
    if (!sessionActionTarget) return;
    toggleChatMute(sessionActionTarget.id);
    refresh();
    closeSessionActions();
  };

  const handleSessionDeleteAction = () => {
    if (!sessionActionTarget) return;
    const { id, type } = sessionActionTarget;
    if (type === 'community') {
      if (isOwnCreatedCommunityChat(sessionActionTarget)) {
        deleteOwnedCommunityByChatId(id);
      } else {
        leaveCommunityByChatId(id);
      }
    }
    deleteConversation(id);
    if (activeChatId === id) {
      setMobileShowConversation(false);
    }
    closeSessionActions();
    refresh();
  };

  useEffect(() => {
    if (filteredConversations.length === 0) {
      setMobileShowConversation(false);
      return;
    }
    if (!filteredConversations.some((c) => c.id === activeChatId)) {
      setActiveChatId(filteredConversations[0].id);
    }
  }, [filteredConversations, activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages.length, activeChatId]);

  const openConversation = (id: string) => {
    setActiveChatId(id);
    setMobileShowConversation(true);
    setReactionTarget(null);
    setShowShareMenu(false);
  };

  const handleSend = () => {
    if (!activeChat || !draft.trim()) return;
    sendTextMessage(activeChat.id, draft);
    setDraft('');
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!activeChat) return;
    // Throttled — a typing broadcast per keystroke is unnecessary chatter.
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 2000) {
      lastTypingBroadcastRef.current = now;
      notifyTyping(activeChat.id);
    }
  };

  const handleCreateGroup = async () => {
    const created = await createGroup(groupName, selectedMembers);
    if (created) {
      closeCreateGroup();
      setGroupName('');
      setSelectedMembers([]);
      openConversation(created.id);
    }
  };

  const handleStartDirectMessage = async (userId: string) => {
    setStartingChatWith(userId);
    const created = await createDirectMessage(userId);
    setStartingChatWith(null);
    if (created) {
      setShowNewChat(false);
      openConversation(created.id);
    }
  };

  const toggleMemberPick = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const startLongPress = (chatId: string, messageId: string) => {
    longPressTimer.current = window.setTimeout(() => {
      setReactionTarget({ chatId, messageId });
    }, 450);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleReaction = (emoji: string) => {
    if (!reactionTarget) return;
    toggleReaction(reactionTarget.chatId, reactionTarget.messageId, emoji);
    setReactionTarget(null);
  };

  const renderMessage = (msg: ChatMessage, chat: ChatConversation) => {
    const reactions = groupReactions(msg.reactions);
    const isReactionOpen =
      reactionTarget?.chatId === chat.id && reactionTarget?.messageId === msg.id;

    return (
      <div
        key={msg.id}
        className={`chat-msg-row ${msg.sender}`}
        onTouchStart={() => startLongPress(chat.id, msg.id)}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onMouseDown={() => startLongPress(chat.id, msg.id)}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          setReactionTarget({ chatId: chat.id, messageId: msg.id });
        }}
      >
        {chat.type !== 'dm' && msg.sender === 'other' && (
          <img src={findAvatar(chat, msg.authorId)} alt="" className="chat-msg-avatar" />
        )}

        <div className="chat-msg-stack">
          {chat.type !== 'dm' && msg.sender === 'other' && (
            <span className="chat-msg-author">{msg.authorName}</span>
          )}

          <div className={`chat-bubble ${msg.sender} ${msg.kind !== 'text' ? 'rich' : ''}`}>
            {msg.kind === 'text' && <p className="chat-bubble-text">{msg.text}</p>}

            {msg.kind === 'post' && msg.sharedPost && (
              <div className="chat-shared-post">
                <div className="chat-shared-post-head">
                  <img src={msg.sharedPost.authorAvatar} alt="" />
                  <div>
                    <span className="chat-shared-author">{msg.sharedPost.authorName}</span>
                    <span className="chat-shared-event">{msg.sharedPost.eventTitle}</span>
                  </div>
                </div>
                {msg.sharedPost.image && (
                  <img src={msg.sharedPost.image} alt="" className="chat-shared-media" />
                )}
                {msg.sharedPost.videoUrl && !msg.sharedPost.image && (
                  <video src={msg.sharedPost.videoUrl} className="chat-shared-media" controls />
                )}
                <p className="chat-shared-caption">{msg.sharedPost.caption}</p>
              </div>
            )}

            {msg.kind === 'video' && msg.mediaUrl && (
              <div className="chat-video-wrap">
                <video src={msg.mediaUrl} controls className="chat-video-player" />
                {msg.text && <p className="chat-bubble-text">{msg.text}</p>}
              </div>
            )}

            {msg.kind === 'image' && msg.mediaUrl && (
              <img src={msg.mediaUrl} alt="" className="chat-shared-media" />
            )}

            <span className="chat-bubble-time">{msg.time}</span>
          </div>

          {reactions.length > 0 && (
            <div className={`chat-reactions-pill ${msg.sender}`}>
              {reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  className={`chat-reaction-chip ${r.mine ? 'mine' : ''}`}
                  onClick={() => toggleReaction(chat.id, msg.id, r.emoji)}
                >
                  {r.emoji}
                  {r.count > 1 && <span>{r.count}</span>}
                </button>
              ))}
            </div>
          )}

          {isReactionOpen && (
            <div className="chat-reaction-picker">
              {REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => handleReaction(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-page">
      <div className={`chat-shell ${mobileShowConversation ? 'show-thread' : ''}`}>
        {/* Conversation list */}
        <aside className="chat-list-panel">
          <div className="chat-list-toolbar">
            <div className="chat-search-wrap">
              <Search size={16} />
              <input
                type="search"
                placeholder="Search conversations"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {isBackendEnabled() && (
              <button
                type="button"
                className="chat-icon-btn"
                aria-label="New chat"
                onClick={() => setShowNewChat(true)}
              >
                <UserPlus size={18} />
              </button>
            )}

            <div className="chat-inbox-filters" role="tablist" aria-label="Inbox filters">
              <button
                type="button"
                role="tab"
                aria-selected={inboxFilter === 'chats'}
                className={`chat-inbox-filter${inboxFilter === 'chats' ? ' active' : ''}`}
                onClick={() => setInboxFilter('chats')}
              >
                Chats
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inboxFilter === 'communities'}
                className={`chat-inbox-filter${inboxFilter === 'communities' ? ' active' : ''}`}
                onClick={() => setInboxFilter('communities')}
              >
                Communities
              </button>
            </div>
          </div>

          <div className="chat-session-list">
            {filteredConversations.length === 0 ? (
              <div className="chat-inbox-empty">
                <p>
                  {inboxFilter === 'communities'
                    ? 'No joined communities yet. Join a public community from someone\'s profile.'
                    : 'No chats yet. Start a conversation or create a group.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((session) => {
              const last = session.messages[session.messages.length - 1];
              const pinned = isChatPinned(session.id);
              const muted = isChatMuted(session.id);
              return (
                <div
                  key={session.id}
                  className={`chat-session-row-wrap${pinned ? ' is-pinned' : ''}${muted ? ' is-muted' : ''}`}
                >
                  <button
                    type="button"
                    className="chat-session-row"
                    onClick={() => handleSessionClick(session.id)}
                    onPointerDown={() => handleSessionPointerDown(session)}
                    onPointerUp={handleSessionPointerUp}
                    onPointerLeave={handleSessionPointerUp}
                    onPointerCancel={handleSessionPointerUp}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSessionActionTarget(session);
                    }}
                  >
                    <div className="chat-session-avatar-wrap">
                      <img src={session.avatar} alt="" className="chat-session-avatar" />
                      {session.online && <span className="chat-online-dot" />}
                      {session.type !== 'dm' && (
                        <span className="chat-group-badge">
                          {session.type === 'event' ? 'EV' : session.type === 'community' ? 'CM' : 'GC'}
                        </span>
                      )}
                    </div>
                    <div className="chat-session-body">
                      <span className="chat-session-name">
                        {pinned && <Pin size={11} className="chat-session-status-icon" aria-hidden="true" />}
                        {muted && <BellOff size={11} className="chat-session-status-icon" aria-hidden="true" />}
                        {session.name}
                      </span>
                      <span className="chat-session-preview">
                        {last ? messagePreview(last) : 'No messages yet'}
                      </span>
                    </div>
                    <span className="chat-session-time">{last?.time ?? ''}</span>
                  </button>
                </div>
              );
            })
            )}
          </div>
        </aside>

        {/* Active thread */}
        {activeChat && (
          <section className="chat-thread-panel">
            <header className="chat-thread-header">
              <button
                type="button"
                className="chat-back-btn"
                aria-label="Back to list"
                onClick={() => setMobileShowConversation(false)}
              >
                <ArrowLeft size={20} />
              </button>

              <button
                type="button"
                className="chat-thread-user"
                onClick={() => activeChat.type !== 'dm' && setShowMembers(true)}
              >
                <img src={activeChat.avatar} alt="" />
                <div className="chat-thread-user-text">
                  <span className="chat-thread-name">{activeChat.name}</span>
                  <span className="chat-thread-status">
                    {isSomeoneTyping(activeChat.id)
                      ? 'Typing…'
                      : activeChat.type === 'dm'
                        ? activeChat.online
                          ? 'Active now'
                          : 'Offline'
                        : activeChat.subtitle}
                  </span>
                </div>
                {activeChat.type !== 'dm' && <ChevronRight size={16} className="chat-thread-chevron" />}
              </button>

              {(activeChat.type === 'group' || activeChat.type === 'community') && isGroupAdmin(activeChat) && (
                <button
                  type="button"
                  className="chat-icon-btn"
                  aria-label="Manage members"
                  onClick={() => setShowMembers(true)}
                >
                  <Users size={18} />
                </button>
              )}
            </header>

            <div className="chat-messages-scroll">
              {activeChat.messages.map((msg) => renderMessage(msg, activeChat))}
              <div ref={messagesEndRef} />
            </div>

            <footer className="chat-composer">
              <div className="chat-composer-tools">
                <button
                  type="button"
                  className="chat-icon-btn"
                  aria-label="Attach"
                  onClick={() => setShowShareMenu((v) => !v)}
                >
                  <Paperclip size={18} />
                </button>
                {showShareMenu && (
                  <div className="chat-share-menu">
                    <button type="button" onClick={() => { setShowPostPicker(true); setShowShareMenu(false); }}>
                      <ImageIcon size={16} /> Share post
                    </button>
                    <button type="button" onClick={() => { mediaInputRef.current?.click(); setShowShareMenu(false); }}>
                      <Video size={16} /> Photo or video
                    </button>
                  </div>
                )}
              </div>

              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={handleMediaPicked}
                disabled={isSendingMedia}
              />
              <input
                type="text"
                className="chat-composer-input"
                placeholder="Message..."
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              />

              <button
                type="button"
                className="chat-send-btn"
                aria-label="Send"
                disabled={!draft.trim()}
                onClick={handleSend}
              >
                <Send size={16} />
              </button>
            </footer>
          </section>
        )}
      </div>

      {/* Create group modal */}
      {showCreateGroup && (
        <div className="chat-modal-overlay" onClick={closeCreateGroup}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <header className="chat-modal-header">
              <h3>New group</h3>
              <button type="button" className="chat-icon-btn" onClick={closeCreateGroup}>
                <X size={18} />
              </button>
            </header>

            <label className="chat-field">
              <span>Group name</span>
              <input
                type="text"
                placeholder="Weekend crew, Gym buddies..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>

            <p className="chat-modal-label">Add members</p>
            <PeopleSearchInput value={peopleQuery} onChange={setPeopleQuery} />
            <div className="chat-member-pick-list">
              {peopleSearching && <p className="chat-modal-label">Searching…</p>}
              {!peopleSearching && pickerPeople.length === 0 && (
                <p className="chat-modal-label">
                  {peopleQuery.trim() ? 'No one found with that name or username.' : 'No one to add yet.'}
                </p>
              )}
              {pickerPeople.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className={`chat-member-pick ${selectedMembers.includes(contact.id) ? 'selected' : ''}`}
                  onClick={() => toggleMemberPick(contact.id)}
                >
                  <img src={personAvatar(contact)} alt="" />
                  <span>
                    {contact.name}
                    {contact.username && <small className="chat-member-handle">@{contact.username}</small>}
                  </span>
                  {selectedMembers.includes(contact.id) && <Check size={16} />}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="chat-primary-btn"
              disabled={!groupName.trim() || selectedMembers.length === 0}
              onClick={handleCreateGroup}
            >
              Create group
            </button>
          </div>
        </div>
      )}

      {/* New direct message picker */}
      {showNewChat && (
        <div className="chat-modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <header className="chat-modal-header">
              <h3>New message</h3>
              <button type="button" className="chat-icon-btn" onClick={() => setShowNewChat(false)}>
                <X size={18} />
              </button>
            </header>

            <p className="chat-modal-label">Find people</p>
            <PeopleSearchInput value={peopleQuery} onChange={setPeopleQuery} autoFocus />
            <div className="chat-member-pick-list">
              {peopleSearching && <p className="chat-modal-label">Searching…</p>}
              {!peopleSearching && pickerPeople.length === 0 && (
                <p className="chat-modal-label">
                  {peopleQuery.trim() ? 'No one found with that name or username.' : 'No one to message yet.'}
                </p>
              )}
              {pickerPeople.map((contact) => (
                <button
                  key={contact.id}
                  type="button"
                  className="chat-member-pick"
                  disabled={startingChatWith === contact.id}
                  onClick={() => handleStartDirectMessage(contact.id)}
                >
                  <img src={personAvatar(contact)} alt="" />
                  <span>
                    {contact.name}
                    {contact.username && <small className="chat-member-handle">@{contact.username}</small>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Members panel */}
      {showMembers && activeChat && activeChat.type !== 'dm' && (
        <div className="chat-modal-overlay" onClick={() => setShowMembers(false)}>
          <div className="chat-modal chat-members-modal" onClick={(e) => e.stopPropagation()}>
            <header className="chat-modal-header">
              <h3>{activeChat.name}</h3>
              <button type="button" className="chat-icon-btn" onClick={() => setShowMembers(false)}>
                <X size={18} />
              </button>
            </header>
            <p className="chat-members-count">{activeChat.members.length} members</p>

            <div className="chat-members-list">
              {activeChat.members.map((member) => (
                <div key={member.id} className="chat-member-row">
                  <img src={member.avatar} alt="" />
                  <div>
                    <span className="chat-member-name">{member.name}</span>
                    <span className="chat-member-role">
                      {member.id === activeChat.adminId ? 'Admin' : member.role ?? 'Member'}
                    </span>
                  </div>
                  {(activeChat.type === 'group' || activeChat.type === 'community') &&
                    isGroupAdmin(activeChat) &&
                    member.id !== ME_AUTHOR_ID && (
                      <button
                        type="button"
                        className="chat-icon-btn danger"
                        aria-label={`Remove ${member.name}`}
                        onClick={() => removeGroupMember(activeChat.id, member.id)}
                      >
                        <UserMinus size={16} />
                      </button>
                    )}
                </div>
              ))}
            </div>

            {(activeChat.type === 'group' || activeChat.type === 'community') && isGroupAdmin(activeChat) && (
              <AddMemberSection
                chatId={activeChat.id}
                existingIds={activeChat.members.map((m) => m.id)}
                contacts={contacts}
              />
            )}
          </div>
        </div>
      )}

      {/* Share post picker */}
      {showPostPicker && activeChat && (
        <div className="chat-modal-overlay" onClick={() => setShowPostPicker(false)}>
          <div className="chat-modal chat-picker-modal" onClick={(e) => e.stopPropagation()}>
            <header className="chat-modal-header">
              <h3>Share a post</h3>
              <button type="button" className="chat-icon-btn" onClick={() => setShowPostPicker(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="chat-post-pick-list">
              {feedPosts.slice(0, 12).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  className="chat-post-pick"
                  onClick={() => {
                    sendSharedPost(activeChat.id, post);
                    setShowPostPicker(false);
                  }}
                >
                  {post.image && <img src={post.image} alt="" />}
                  <div>
                    <span>{post.eventTitle}</span>
                    <p>{post.caption.slice(0, 60)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sessionActionTarget && (
        <div className="chat-modal-overlay chat-session-action-overlay" onClick={closeSessionActions}>
          <div className="chat-session-action-sheet animate-slideUp" onClick={(e) => e.stopPropagation()}>
            <p className="chat-session-action-title">{sessionActionTarget.name}</p>
            <button type="button" className="chat-session-action-option" onClick={handleSessionPinAction}>
              <Pin size={18} />
              {isChatPinned(sessionActionTarget.id) ? 'Unpin' : 'Pin'}
            </button>
            <button type="button" className="chat-session-action-option" onClick={handleSessionMuteAction}>
              {isChatMuted(sessionActionTarget.id) ? <BellOff size={18} /> : <Bell size={18} />}
              {isChatMuted(sessionActionTarget.id) ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              className="chat-session-action-option chat-session-action-option--danger"
              onClick={handleSessionDeleteAction}
            >
              <Trash2 size={18} />
              Delete
            </button>
            <button type="button" className="chat-session-action-cancel" onClick={closeSessionActions}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function findAvatar(chat: ChatConversation, authorId: string): string {
  return chat.members.find((m) => m.id === authorId)?.avatar ?? chat.avatar;
}

/** Initial-letter avatar for accounts that haven't uploaded a photo yet. */
function personAvatar(contact: ChatMember): string {
  if (contact.avatar) return contact.avatar;
  const letter = (contact.name || contact.username || '?').trim().charAt(0).toUpperCase() || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">` +
    `<rect width="72" height="72" rx="36" fill="#2b2b2b"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="32" font-weight="600" fill="#ffffff">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function PeopleSearchInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="chat-search-wrap chat-people-search">
      <Search size={16} />
      <input
        type="search"
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="Search by name or @username"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search people"
      />
    </div>
  );
}

function AddMemberSection({
  chatId,
  existingIds,
  contacts,
}: {
  chatId: string;
  existingIds: string[];
  contacts: ChatMember[];
}) {
  const [open, setOpen] = useState(false);
  const available = contacts.filter((c) => c.id !== ME_AUTHOR_ID && !existingIds.includes(c.id));

  if (available.length === 0) return null;

  return (
    <div className="chat-add-member">
      <button type="button" className="chat-add-member-toggle" onClick={() => setOpen((v) => !v)}>
        <UserPlus size={16} />
        Add people
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="chat-add-member-list">
          {available.map((contact) => (
            <button
              key={contact.id}
              type="button"
              className="chat-member-pick"
              onClick={() => addGroupMember(chatId, contact.id)}
            >
              <img src={personAvatar(contact)} alt="" />
              <span>{contact.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
