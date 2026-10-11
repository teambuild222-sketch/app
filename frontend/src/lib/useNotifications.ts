import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications, getCachedNotifications, markNotificationsRead } from '../api/notificationsApi';
import { isBackendEnabled } from '../api/client';
import type { NotificationDto } from '../api/types';
import { requestPeople } from '../components/ExplorePage/exploreEvents';

const POLL_MS = 8000;

/**
 * Live notification feed. Shows the last snapshot instantly, then polls
 * while the tab is visible. Network is skipped when the snapshot is fresh.
 */
export function useNotifications() {
  const live = isBackendEnabled();
  const cached = getCachedNotifications();
  const [items, setItems] = useState<NotificationDto[]>(cached.items);
  const [unread, setUnread] = useState(cached.unread);
  const lastTopId = useRef<string | null>(cached.items[0]?.id ?? null);
  const [freshId, setFreshId] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!live) return;
    const res = await fetchNotifications({ force });
    setItems(res.items);
    setUnread(res.unread);
    requestPeople(res.items.map((n) => n.data?.userId));
    const top = res.items[0]?.id ?? null;
    if (lastTopId.current && top && top !== lastTopId.current) setFreshId(top);
    lastTopId.current = top;
  }, [live]);

  useEffect(() => {
    if (!live) return;
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [live, refresh]);

  const markAllRead = useCallback(async () => {
    if (!live) return;
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await markNotificationsRead();
  }, [live]);

  return { items, unread, markAllRead, refresh, freshId };
}
