import { getAuthToken, isBackendEnabled, warmUpBackend } from '../api/client';
import { listPosts } from '../api/postsApi';
import { listConversationsRemote } from '../api/chatApi';

/** Wake Render and fill the device cache so Home / Chat open from disk. */
export function prefetchAppShell(): void {
  if (!isBackendEnabled()) return;
  warmUpBackend();
  if (!getAuthToken()) return;
  void listPosts().catch(() => undefined);
  void listConversationsRemote().catch(() => undefined);
}
