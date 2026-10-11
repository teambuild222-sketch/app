// Cloudflare Pages Function: forwards every /api/* request to the FastAPI backend,
// so the web app talks to its own origin (no CORS setup on Render needed).
const DEFAULT_API_ORIGIN = 'https://simsor-api.onrender.com';

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.API_ORIGIN || DEFAULT_API_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete('host');
  // The backend rate-limits per client IP using the first X-Forwarded-For entry.
  const clientIp = request.headers.get('cf-connecting-ip');
  if (clientIp) headers.set('x-forwarded-for', clientIp);
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', 'https');

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });
}
