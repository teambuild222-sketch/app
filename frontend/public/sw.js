/* SIMSOR media cache — keeps photos/videos on the device like Instagram.
   API calls are never cached here; JSON snapshots live in localStorage. */
const MEDIA = 'simsor-media-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== MEDIA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  const isMedia =
    request.destination === 'image' ||
    request.destination === 'video' ||
    /\.(png|jpe?g|webp|gif|svg|mp4|webm|m4v)(\?|$)/i.test(url.pathname);

  if (!isMedia) return;

  event.respondWith(
    caches.open(MEDIA).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: false });
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok || res.type === 'opaque') {
        cache.put(request, res.clone()).catch(() => undefined);
      }
      return res;
    }),
  );
});
