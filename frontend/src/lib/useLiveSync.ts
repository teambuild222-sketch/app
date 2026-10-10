import { useEffect, useRef } from 'react';
import { isBackendEnabled } from '../api/client';
import { syncChatsFromServer } from '../components/Chat/chatStore';

/** Fired on every live-sync tick so any mounted screen can silently re-pull its data. */
export const LIVE_SYNC_EVENT = 'simsor-live-sync';

const TICK_MS = 12000;

/**
 * App-wide "real time" heartbeat. While the app is visible it ticks every few
 * seconds (and immediately when the tab/app regains focus or the network comes
 * back). Each tick re-pulls the inbox + open chat, notifies listening screens
 * (Explore, ...) and calls `onTick` so the caller can refresh its own data
 * (the Home feed). Instant delivery for chat still comes from Supabase
 * Realtime; this keeps everything else, and chat after a dropped socket, fresh.
 */
export function useLiveSync(onTick?: () => void): void {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!isBackendEnabled()) return undefined;

    const run = () => {
      if (document.hidden) return;
      syncChatsFromServer();
      window.dispatchEvent(new CustomEvent(LIVE_SYNC_EVENT));
      tickRef.current?.();
    };

    const timer = window.setInterval(run, TICK_MS);
    window.addEventListener('focus', run);
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);
}
