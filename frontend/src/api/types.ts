/**
 * Shared API / domain types for SIMSOR.
 * Backend should return JSON matching these shapes.
 */

export type MainCategory = 'Sports' | 'Entertainment';

export type UserProfile = {
  id: string;
  username: string;
  fullName: string;
  bio: string;
  location: string;
  avatarUrl: string;
  sports: string[];
  entertainment: string[];
  /** Own account only (never on public profiles). */
  email?: string | null;
  emailVerified?: boolean;
  isAdmin?: boolean;
};

export type AuthSession = {
  token: string;
  user: UserProfile;
};

export type EventDto = {
  id: string;
  title: string;
  category: string;
  mainCategory: MainCategory;
  date: string;
  time: string;
  venue: string;
  location: string;
  description: string;
  coordinates: [number, number];
  attendees: number;
  image: string;
  organizerId: string;
  gameAccess?: 'public' | 'invite';
  /** Frontend-local people-list ids selected for an invite-only event. */
  inviteListIds?: string[];
  /** Resolved snapshot of invited member ids, taken at publish time. */
  invitedMemberIds?: string[];
  /** Real event start time (ISO), added in Phase 3 — see backend/PHASE3.md. */
  startsAt?: string | null;
  communityId?: string | null;
  hasJoinForm?: boolean;
};

export type PostType = 'poster' | 'text' | 'video';
export type PostVisibility = 'public' | 'private';
export type RegistrationType = 'open' | 'limited';

/** Mirrors backend `PostDto` — the real, shared version of HomeFeedPost. */
export type PostDto = {
  id: string;
  type: PostType;
  authorId: string;
  caption: string;
  image?: string | null;
  videoUrl?: string | null;
  visibility: PostVisibility;
  isReshared: boolean;
  originalHostId?: string | null;
  eventId: string;
  eventTitle: string;
  category: string;
  mainCategory: MainCategory;
  eventDateISO?: string | null;
  eventDateLabel: string;
  eventLocation: string;
  coordinates: [number, number];
  createdAt: string;
  likes: number;
  likedByMe: boolean;
  comments: number;
  registrationType?: RegistrationType | null;
  slotsTotal?: number | null;
  slotsFilled?: number | null;
  registrationDeadlineISO?: string | null;
};

export type PostCreatePayload = {
  eventId: string;
  type?: PostType;
  caption?: string;
  image?: string | null;
  videoUrl?: string | null;
  visibility?: PostVisibility;
  isReshared?: boolean;
  originalHostId?: string | null;
  registrationType?: RegistrationType | null;
  slotsTotal?: number | null;
  registrationDeadline?: string | null;
};

export type LikeResponseDto = {
  liked: boolean;
  likes: number;
};

export type FollowingListDto = {
  userIds: string[];
};

/** Reasons the client can report directly — 'like'/'repost' are bumped
 * automatically server-side as a side effect of the real action instead
 * (see backend/app/affinity.py). */
export type AffinityReason =
  | 'dwell'
  | 'join'
  | 'view_location'
  | 'open_profile'
  | 'explore_subfilter'
  | 'explore_pin_open'
  | 'discover_tile_open';

export type AffinityTrackPayload = {
  category: string;
  mainCategory: MainCategory;
  reason: AffinityReason;
  seconds?: number;
  authorId?: string;
};

export type AffinityMineDto = {
  categories: Record<string, number>;
  authors: Record<string, number>;
};

export type UploadResponseDto = {
  url: string;
  type: 'image' | 'video';
};

/** Minimal public profile for rendering an event's host. Not private data. */
export type PublicUserDto = {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  eventsHosted: number;
};

export type DabUpStatus = 'none' | 'pending' | 'incoming' | 'dabbed_up';

export type ConversationPreview = {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  lastMessage: string;
  updatedAt: string;
  unread: number;
};

/** Chat Phase — real, shared DM/group chat backed by Supabase Postgres +
 * Realtime. Mirrors backend `ConversationDto`/`MessageDto` in
 * backend/app/schemas.py. Event group chats and communities are NOT part of
 * this: they stay on `eventChats.ts` / `communitiesStore.ts`. */
export type ChatConversationType = 'dm' | 'group';
export type ChatMessageKind = 'text' | 'image' | 'video' | 'post';

export type ChatMemberDto = {
  id: string;
  name: string;
  avatarUrl: string;
  role: 'admin' | 'member';
};

export type SharedPostPreviewDto = {
  postId: string;
  caption: string;
  eventTitle: string;
  image?: string | null;
  videoUrl?: string | null;
  authorName: string;
  authorAvatar: string;
  postType: PostType;
};

export type ChatReactionDto = {
  emoji: string;
  userId: string;
  userName: string;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  authorId: string;
  kind: ChatMessageKind;
  text?: string | null;
  mediaUrl?: string | null;
  sharedPost?: SharedPostPreviewDto | null;
  reactions: ChatReactionDto[];
  createdAt: string;
};

export type ConversationDto = {
  id: string;
  type: ChatConversationType;
  name: string;
  avatarUrl: string;
  adminId?: string | null;
  communityId?: string | null;
  members: ChatMemberDto[];
  lastMessage?: MessageDto | null;
  unread: number;
  pinned: boolean;
  muted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationCreatePayload = {
  type: ChatConversationType;
  memberIds: string[];
  name?: string;
};

export type MessageCreatePayload = {
  kind: ChatMessageKind;
  text?: string;
  mediaUrl?: string;
  sharedPostId?: string;
};

export type ConversationPrefsPayload = {
  pinned?: boolean;
  muted?: boolean;
  hidden?: boolean;
};

export type PeopleListDto = {
  id: string;
  name: string;
  memberIds: string[];
  updatedAt: number;
};

/** Canonical REST paths the backend should implement. */
export const API_ROUTES = {
  health: '/api/health',
  login: '/api/auth/login',
  signup: '/api/auth/signup',
  logout: '/api/auth/logout',
  logoutAll: '/api/auth/logout-all',
  sendVerification: '/api/auth/send-verification',
  verifyEmail: '/api/auth/verify-email',
  forgotPassword: '/api/auth/forgot-password',
  resetPassword: '/api/auth/reset-password',
  changePassword: '/api/auth/change-password',
  googleAuth: '/api/auth/google',
  appleAuth: '/api/auth/apple',
  me: '/api/me',
  meStats: '/api/me/stats',
  meDeviceToken: '/api/me/device-token',
  updateMe: '/api/me',
  events: '/api/events',
  eventById: (id: string) => `/api/events/${id}`,
  eventsJoinedMine: '/api/events/joined/mine',
  eventJoin: (id: string) => `/api/events/${id}/join`,
  eventJoinForm: (id: string) => `/api/events/${id}/join-form`,
  adminCommunities: '/api/admin/communities',
  adminCommunityVerification: (id: string) => `/api/admin/communities/${id}/verification`,
  communityNotion: (id: string) => `/api/communities/${id}/notion`,
  communityNotionOAuthStart: (id: string) => `/api/communities/${id}/notion/oauth/start`,
  communityNotionDatabase: (id: string) => `/api/communities/${id}/notion/database`,
  communityNotionSync: (id: string) => `/api/communities/${id}/notion/sync`,
  communityJoinForm: (id: string) => `/api/communities/${id}/join-form`,
  peopleLists: '/api/people-lists',
  peopleListById: (id: string) => `/api/people-lists/${id}`,
  communities: '/api/communities',
  communitiesByCreator: (userId: string) => `/api/communities/by-creator/${userId}`,
  communityJoin: (id: string) => `/api/communities/${id}/join`,
  reports: '/api/reports',
  blockUser: (userId: string) => `/api/blocks/${userId}`,
  dabUps: '/api/dab-ups',
  dabUpsMine: '/api/dab-ups/mine',
  dabUpRequest: '/api/dab-ups/request',
  eventConversation: (id: string) => `/api/events/${id}/conversation`,
  userPublic: (userId: string) => `/api/users/${userId}/public`,
  users: '/api/users',
  conversations: '/api/conversations',
  conversationById: (id: string) => `/api/conversations/${id}`,
  conversationRead: (id: string) => `/api/conversations/${id}/read`,
  conversationPrefs: (id: string) => `/api/conversations/${id}/prefs`,
  conversationMembers: (id: string) => `/api/conversations/${id}/members`,
  conversationMemberById: (id: string, userId: string) => `/api/conversations/${id}/members/${userId}`,
  messages: (conversationId: string) => `/api/conversations/${conversationId}/messages`,
  messageReactions: (messageId: string) => `/api/messages/${messageId}/reactions`,
  posts: '/api/posts',
  postById: (id: string) => `/api/posts/${id}`,
  postLike: (id: string) => `/api/posts/${id}/like`,
  postComments: (id: string) => `/api/posts/${id}/comments`,
  postCommentById: (postId: string, commentId: string) => `/api/posts/${postId}/comments/${commentId}`,
  notifications: '/api/notifications',
  notificationsRead: '/api/notifications/read',
  followingMine: '/api/follows/mine',
  followUser: (userId: string) => `/api/follows/${userId}`,
  affinityTrack: '/api/affinity/track',
  affinityMine: '/api/affinity/mine',
  uploads: '/api/uploads',
} as const;

export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  data: Record<string, string>;
  read: boolean;
  createdAt: string;
};

export type NotificationsResponseDto = {
  items: NotificationDto[];
  unread: number;
};

export type CommentDto = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string;
  text: string;
  createdAt: string;
};

export type MeStatsDto = {
  dabUps: number;
  following: number;
  followers: number;
  eventsJoined: number;
  eventsHosted: number;
};
