/**
 * Public API surface for the SIMSOR frontend.
 * Screens should import from here (not raw localStorage) going forward.
 */
export { isBackendEnabled, getApiBaseUrl, getApiClient, getAuthToken, setAuthToken } from './client';
export { API_ROUTES } from './types';
export type {
  AuthSession,
  ConversationPreview,
  DabUpStatus,
  EventDto,
  MainCategory,
  UserProfile,
} from './types';

export {
  AUTH_CHANGED_EVENT,
  getLocalProfile,
  isLoggedIn,
  loginWithPassword,
  logout,
  restoreRealtimeAuthOnBoot,
  signupAccount,
} from './auth';

export { fetchProfile, saveProfile } from './profileApi';
export { createEventRemote, deleteEventRemote, listEvents } from './eventsApi';
export { fetchDabUpStatus, listConversations, requestDabUp, respondDabUp } from './socialApi';
export { hydrateJoinedEvents, isEventJoined, toggleEventJoinRemote } from './joinsApi';
export {
  blockUser,
  changePassword,
  deleteMyAccount,
  forgotPassword,
  logoutEverywhere,
  reportContent,
  resetPassword,
  sendEmailVerification,
  unblockUser,
  verifyEmail,
} from './trustApi';
