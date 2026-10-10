import { ME_AUTHOR_ID, getCurrentUserOrganizer } from '../ExplorePage/exploreEvents';

export type EventChatMessage = {
  id: string;
  sender: 'me' | 'other';
  authorName?: string;
  text: string;
  time: string;
};

export type EventGroupChat = {
  eventId: string;
  title: string;
  category: string;
  avatar: string;
  hostName: string;
  joinedAt: number;
  messages: EventChatMessage[];
};

type TranscriptMessage = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
};

type StoredChatSession = Omit<EventGroupChat, 'messages'>;

const EVENT_CHATS_KEY = 'simsor-event-chats-v1';
const EVENT_TRANSCRIPT_KEY = 'simsor-event-chat-transcript-v1';
export const EVENT_CHATS_CHANGED_EVENT = 'simsor-event-chats-changed';

const DEMO_MEMBERS = [
  { id: 'org-priya', name: 'Priya Reddy' },
  { id: 'org-arjun', name: 'Arjun Mehta' },
  { id: 'org-sneha', name: 'Sneha Kapoor' },
  { id: 'org-vikram', name: 'Vikram Das' },
];

function formatMessageTime(createdAt: number): string {
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

function loadTranscriptStore(): Record<string, TranscriptMessage[]> {
  try {
    const raw = localStorage.getItem(EVENT_TRANSCRIPT_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveTranscriptStore(store: Record<string, TranscriptMessage[]>): void {
  localStorage.setItem(EVENT_TRANSCRIPT_KEY, JSON.stringify(store));
}

function loadChatSessions(): StoredChatSession[] {
  try {
    const raw = localStorage.getItem(EVENT_CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry) => {
      const { messages: _messages, ...session } = entry as EventGroupChat;
      return session;
    });
  } catch {
    return [];
  }
}

function saveChatSessions(sessions: StoredChatSession[]): void {
  localStorage.setItem(EVENT_CHATS_KEY, JSON.stringify(sessions));
  window.dispatchEvent(new CustomEvent(EVENT_CHATS_CHANGED_EVENT));
}

function transcriptToDisplay(messages: TranscriptMessage[]): EventChatMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    sender: msg.authorId === ME_AUTHOR_ID ? 'me' : 'other',
    authorName: msg.authorId === ME_AUTHOR_ID ? undefined : msg.authorName,
    text: msg.text,
    time: formatMessageTime(msg.createdAt),
  }));
}

function isDemoEvent(eventId: string): boolean {
  return eventId.startsWith('evt-');
}

function buildDemoTranscript(
  eventId: string,
  title: string,
  hostName: string,
  hostId?: string,
): TranscriptMessage[] {
  const host = hostId ?? 'org-host';
  const base = Date.now() - 1000 * 60 * 60 * 28;
  const [m1, m2, m3] = DEMO_MEMBERS;

  return [
    {
      id: `${eventId}-seed-1`,
      authorId: host,
      authorName: hostName,
      text: `Welcome to ${title}! Use this chat for questions, ride shares, and event updates.`,
      createdAt: base,
    },
    {
      id: `${eventId}-seed-2`,
      authorId: m1.id,
      authorName: m1.name,
      text: 'Just joined — looking forward to this! 🙌',
      createdAt: base + 1000 * 60 * 45,
    },
    {
      id: `${eventId}-seed-3`,
      authorId: host,
      authorName: hostName,
      text: '📍 Update: Meetup point is pinned on the map. Head to the main entrance.',
      createdAt: base + 1000 * 60 * 90,
    },
    {
      id: `${eventId}-seed-4`,
      authorId: m2.id,
      authorName: m2.name,
      text: 'Is there parking nearby?',
      createdAt: base + 1000 * 60 * 140,
    },
    {
      id: `${eventId}-seed-5`,
      authorId: host,
      authorName: hostName,
      text: 'Yes — free parking on the east side. See you all there!',
      createdAt: base + 1000 * 60 * 175,
    },
    {
      id: `${eventId}-seed-6`,
      authorId: m3.id,
      authorName: m3.name,
      text: 'Bringing an extra racket if anyone needs one 🎾',
      createdAt: base + 1000 * 60 * 220,
    },
  ];
}

function buildHostTranscript(eventId: string, title: string, hostName: string): TranscriptMessage[] {
  return [
    {
      id: `${eventId}-seed-1`,
      authorId: ME_AUTHOR_ID,
      authorName: hostName,
      text: `Group chat for ${title} is live. Post updates here so everyone stays in sync.`,
      createdAt: Date.now() - 1000 * 60 * 5,
    },
  ];
}

function migrateLegacyMessages(
  eventId: string,
  legacyMessages: EventChatMessage[] | undefined,
  store: Record<string, TranscriptMessage[]>,
): void {
  if (store[eventId]?.length || !legacyMessages?.length) return;
  // Demo events get a shared seed history instead of the old single welcome line.
  if (isDemoEvent(eventId)) return;
  // Ignore legacy auto-welcome-only chats so we can seed fresh host history.
  if (legacyMessages.length === 1 && legacyMessages[0]?.sender === 'other') return;

  const me = getCurrentUserOrganizer();
  store[eventId] = legacyMessages.map((msg, index) => ({
    id: String(msg.id),
    authorId: msg.sender === 'me' ? ME_AUTHOR_ID : 'legacy-member',
    authorName: msg.sender === 'me' ? me.name : 'Member',
    text: msg.text,
    createdAt: Date.now() - 1000 * 60 * (legacyMessages.length - index),
  }));
}

function ensureTranscript(
  eventId: string,
  input: { title: string; hostName: string; hostId?: string },
  legacyMessages?: EventChatMessage[],
): TranscriptMessage[] {
  const store = loadTranscriptStore();
  migrateLegacyMessages(eventId, legacyMessages, store);

  if (!store[eventId]?.length) {
    store[eventId] = isDemoEvent(eventId)
      ? buildDemoTranscript(eventId, input.title, input.hostName, input.hostId)
      : buildHostTranscript(eventId, input.title, input.hostName);
    saveTranscriptStore(store);
  }

  return store[eventId] ?? [];
}

function hydrateChat(session: StoredChatSession, legacyMessages?: EventChatMessage[]): EventGroupChat {
  const transcript = ensureTranscript(session.eventId, {
    title: session.title,
    hostName: session.hostName,
  }, legacyMessages);

  return {
    ...session,
    messages: transcriptToDisplay(transcript),
  };
}

export function getEventChats(): EventGroupChat[] {
  try {
    const raw = localStorage.getItem(EVENT_CHATS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry) => {
      const chat = entry as EventGroupChat;
      const { messages, ...session } = chat;
      return hydrateChat(session, messages);
    });
  } catch {
    return [];
  }
}

export function hasEventChat(eventId: string): boolean {
  return loadChatSessions().some((c) => c.eventId === eventId);
}

type EnsureInput = {
  eventId: string;
  title: string;
  category: string;
  avatar: string;
  hostName: string;
  hostId?: string;
};

/**
 * Add this event to the user's chat list and load the full shared transcript
 * (including messages posted before they joined).
 */
export function ensureEventChat(input: EnsureInput): void {
  const sessions = loadChatSessions();
  ensureTranscript(input.eventId, {
    title: input.title,
    hostName: input.hostName,
    hostId: input.hostId,
  });

  if (sessions.some((c) => c.eventId === input.eventId)) {
    window.dispatchEvent(new CustomEvent(EVENT_CHATS_CHANGED_EVENT));
    return;
  }

  const session: StoredChatSession = {
    eventId: input.eventId,
    title: input.title,
    category: input.category,
    avatar: input.avatar,
    hostName: input.hostName,
    joinedAt: Date.now(),
  };

  saveChatSessions([session, ...sessions]);
}

/** Remove the user's chat session when they leave. Shared transcript is kept. */
export function removeEventChat(eventId: string): void {
  const sessions = loadChatSessions();
  const next = sessions.filter((c) => c.eventId !== eventId);
  if (next.length !== sessions.length) saveChatSessions(next);
}

/** Delete the shared transcript when an event is permanently removed. */
export function deleteEventTranscript(eventId: string): void {
  const store = loadTranscriptStore();
  if (!(eventId in store)) return;
  delete store[eventId];
  saveTranscriptStore(store);
  window.dispatchEvent(new CustomEvent(EVENT_CHATS_CHANGED_EVENT));
}

export function appendEventChatMessage(eventId: string, text: string): void {
  const sessions = loadChatSessions();
  const session = sessions.find((c) => c.eventId === eventId);
  if (!session) return;

  const me = getCurrentUserOrganizer();
  const store = loadTranscriptStore();
  const transcript = ensureTranscript(eventId, {
    title: session.title,
    hostName: session.hostName,
  });

  transcript.push({
    id: `${eventId}-${Date.now()}`,
    authorId: ME_AUTHOR_ID,
    authorName: me.name,
    text,
    createdAt: Date.now(),
  });

  store[eventId] = transcript;
  saveTranscriptStore(store);
  window.dispatchEvent(new CustomEvent(EVENT_CHATS_CHANGED_EVENT));
}
