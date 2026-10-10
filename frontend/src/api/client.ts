/**
 * HTTP client ready for a future backend.
 * UI currently uses localStorage mocks; swap call sites to these helpers when APIs land.
 */
import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { Capacitor } from '@capacitor/core';

const AUTH_TOKEN_KEY = 'simsor-auth-token';

/** API base URL. Set VITE_API_URL in .env when the backend is ready. */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl && envUrl.trim()) return envUrl.replace(/\/$/, '');

  if (Capacitor.isNativePlatform()) {
    // Android emulator → host machine localhost
    if (Capacitor.getPlatform() === 'android') {
      return 'http://10.0.2.2:8000';
    }
    // iOS simulator → host localhost
    return 'http://127.0.0.1:8000';
  }

  // Web / Vite proxy (empty = same origin)
  return '';
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (!token) localStorage.removeItem(AUTH_TOKEN_KEY);
    else localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* private mode */
  }
}

let client: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (client) return client;

  client = axios.create({
    baseURL: getApiBaseUrl(),
    timeout: 45000,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  client.interceptors.request.use((config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error?.response?.status === 401) {
        setAuthToken(null);
        window.dispatchEvent(new CustomEvent('simsor-auth-expired'));
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await getApiClient().get<T>(url, config);
  return data;
}

export async function apiPost<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await getApiClient().post<T>(url, body, config);
  return data;
}

export async function apiPut<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await getApiClient().put<T>(url, body, config);
  return data;
}

export async function apiPatch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await getApiClient().patch<T>(url, body, config);
  return data;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await getApiClient().delete<T>(url, config);
  return data;
}

/** Multipart upload (avatars, post/event media) — see api/uploadApi.ts. */
export async function apiUpload<T>(url: string, file: File | Blob, filename?: string): Promise<T> {
  const form = new FormData();
  form.append('file', file, filename ?? (file instanceof File ? file.name : 'upload'));
  const { data } = await getApiClient().post<T>(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // Videos can be tens of MB on a mobile connection, so don't use the 45s default.
    timeout: 300000,
  });
  return data;
}

/** Feature flag: true once VITE_API_URL points at a live backend. */
export function isBackendEnabled(): boolean {
  return Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim());
}
