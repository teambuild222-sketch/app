import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

export const isNativeMobileApp = (): boolean => Capacitor.isNativePlatform();

/** True when opened in a phone/tablet browser (e.g. Cloudflare tunnel on device). */
export const isMobileWebDevice = (): boolean => {
  if (typeof window === 'undefined') return false;

  const coarseTouch = window.matchMedia('(pointer: coarse) and (hover: none)').matches;
  const mobileUa = /Android|iPhone|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

  return coarseTouch || mobileUa;
};

/** Fullscreen shell on Capacitor builds and real mobile browsers — phone frame is desktop preview only. */
export const useNativeMobileShell = (): boolean =>
  isNativeMobileApp() || isMobileWebDevice();

export const getNativePlatform = (): 'ios' | 'android' | 'web' => {
  if (!Capacitor.isNativePlatform()) return 'web';
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android') return p;
  return 'web';
};

/**
 * Boots native shell behavior. Safe to call on web — no-ops plugins there.
 * Keeps the UI mobile-first so Android/iOS builds share the same layout.
 */
export async function initMobileApp(): Promise<void> {
  const root = document.documentElement;
  root.classList.add('simsor-mobile-app', 'simsor-mobile-app');
  root.dataset.platform = getNativePlatform();

  if (isMobileWebDevice()) {
    root.classList.add('simsor-mobile-web');
    root.dataset.shell = 'native';
  } else if (!Capacitor.isNativePlatform()) {
    root.dataset.shell = 'preview';
  }

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0B1020' });
  } catch {
    /* StatusBar unavailable in some previews */
  }

  try {
    await SplashScreen.hide({ fadeOutDuration: 280 });
  } catch {
    /* SplashScreen optional in live reload */
  }

  try {
    const { App: CapApp } = await import('@capacitor/app');
    await CapApp.addListener('backButton', ({ canGoBack }) => {
      const openOverlay = document.querySelector(
        '.ios-drawer-overlay, .edit-profile-overlay, .settings-dropdown, .confirm-dialog-overlay',
      );
      if (openOverlay) {
        (openOverlay as HTMLElement).click();
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.exitApp();
      }
    });
  } catch {
    /* @capacitor/app optional until installed */
  }
}
