/**
 * In-app notification feed (backend: GET /api/notifications). Rows are created
 * server-side whenever someone follows / likes / comments / joins / dabs you.
 */
import { apiGet, apiPost, isBackendEnabled } from './client';
import { API_ROUTES, type NotificationsResponseDto } from './types';

export async function fetchNotifications(): Promise<NotificationsResponseDto> {
  if (!isBackendEnabled()) return { items: [], unread: 0 };
  try {
    return await apiGet<NotificationsResponseDto>(API_ROUTES.notifications);
  } catch {
    return { items: [], unread: 0 };
  }
}

export async function markNotificationsRead(): Promise<void> {
  if (!isBackendEnabled()) return;
  try {
    await apiPost(API_ROUTES.notificationsRead);
  } catch {
    /* non-critical */
  }
}
