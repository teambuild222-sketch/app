/**
 * Native push (FCM on Android, FCM-through-APNs on iOS).
 *
 * - `registerForPush()` after login / app boot: asks permission, gets the FCM
 *   token and registers it with `POST /api/me/device-token`.
 * - `unregisterPush()` BEFORE the auth token is cleared on logout, so a signed-out
 *   device stops receiving that user's notifications.
 * - Tapping a notification routes using the `data.type` values documented in
 *   backend/API_CONTRACT.md.
 *
 * No-ops on web, and when the backend isn't enabled.
 */
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiDelete, apiPost, getAuthToken, isBackendEnabled } from '../api/client';
import { API_ROUTES } from '../api/types';

const TOKEN_KEY = 'simsor-push-token';

let listenersAttached = false;
let registering = false;

type PushPlatform = 'ios' | 'android';

function nativePlatform(): PushPlatform | null {
  if (!Capacitor.isNativePlatform()) return null;
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : null;
}

async function sendTokenToServer(token: string, platform: PushPlatform) {
  if (!getAuthToken()) return;
  try {
    await apiPost(API_ROUTES.meDeviceToken, { platform, token });
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* retried on next boot/login */
  }
}

/** Where a tapped notification should take the user. */
export function pushRouteFor(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  // The app is tab-based (no per-user / per-event URLs yet), so only chat has a
  // meaningful deep link; everything else just opens the app.
  return data.type === 'message' || data.type === 'club_update' ? '/chat' : null;
}

async function attachListeners(platform: PushPlatform) {
  if (listenersAttached) return;
  listenersAttached = true;

  await PushNotifications.addListener('registration', (t) => {
    void sendTokenToServer(t.value, platform);
  });
  await PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration failed', err);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const route = pushRouteFor(action.notification.data as Record<string, unknown> | undefined);
    if (route) window.dispatchEvent(new CustomEvent('simsor-push-navigate', { detail: route }));
  });
}

export async function registerForPush(): Promise<void> {
  const platform = nativePlatform();
  if (!platform || !isBackendEnabled() || !getAuthToken() || registering) return;

  registering = true;
  try {
    await attachListeners(platform);
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') return;
    await PushNotifications.register();
  } catch (err) {
    console.warn('[push] setup failed', err);
  } finally {
    registering = false;
  }
}

/** Call while the auth token is still valid. Never throws. */
export async function unregisterPush(): Promise<void> {
  const platform = nativePlatform();
  if (!platform || !isBackendEnabled()) return;
  try {
    if (getAuthToken()) {
      await apiDelete(API_ROUTES.meDeviceToken, { params: { platform } });
    }
    localStorage.removeItem(TOKEN_KEY);
    await PushNotifications.unregister();
  } catch {
    /* best effort */
  }
}
