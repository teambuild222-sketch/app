import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNotifications, markNotificationsRead } from '../api/notificationsApi';
import { isBackendEnabled } from '../api/client';
import type { NotificationDto } from '../api/types';
import { requestPeople } from '../components/ExplorePage/exploreEvents';

const POLL_MS = 8000;

/**
 * Live notification feed. Polls while the tab is visible and refreshes the
 * moment the app regains focus, so a like / follow / comment shows up on the
 * bell within seconds without a reload.
 */
export function useNotifications() {
  const live = isBackendEnabled();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const lastTopId = useRef<string | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!live) return;
    const res = await fetchNotifications();
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
      if (!document.hidden) void refresh();
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
