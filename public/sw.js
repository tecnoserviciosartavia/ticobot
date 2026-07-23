const CACHE_NAME = 'ticobot-pwa-v3';
const STATIC_CACHE = `${CACHE_NAME}-static`;
const RUNTIME_CACHE = `${CACHE_NAME}-runtime`;
const PRECACHE_URLS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/pwa-icon.svg',
  '/pwa-maskable.svg',
];

function resolveNotificationUrl(data) {
  if (!data || typeof data !== "object") return "/dashboard";

  const phone = typeof data.phone === "string" ? data.phone.trim() : "";
  const fallbackUrls = {
    whatsapp_inbound_message: phone ? `/chats/${encodeURIComponent(phone)}` : "/chats",
    whatsapp_help_request: phone ? `/chats/${encodeURIComponent(phone)}` : "/chats",
    payment_email_received: "/sinpe-emails?read=unread",
    platform_cost_due: "/settings/services",
    daily_expected_payments: "/collections",
    reminder_failed: "/reminders?status=failed",
  };
  const fallback = fallbackUrls[data.type] || "/dashboard";
  const rawUrl = typeof data.url === "string" ? data.url.trim() : "";
  if (!rawUrl) return fallback;

  try {
    const parsed = new URL(rawUrl, self.location.origin);
    if (parsed.origin !== self.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

async function focusOrOpenWindow(url) {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if ('focus' in client) {
      await client.focus();
      if ('navigate' in client && typeof client.navigate === 'function') {
        try {
          await client.navigate(url);
        } catch {
          // Ignore navigation failures and fall back to opening a new window.
        }
      }
      return;
    }
  }

  await self.clients.openWindow(url);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('ticobot-pwa-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function shouldBypassCache(request) {
  const url = new URL(request.url);
  return request.method !== 'GET'
    || request.headers.has('X-Inertia')
    || url.pathname.startsWith('/api/')
    || url.pathname.startsWith('/web-api/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (shouldBypassCache(request) || !isSameOrigin(request)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/offline.html');
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('/offline.html'));
    }),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }

  const title = typeof payload.title === 'string' && payload.title.trim().length > 0
    ? payload.title
    : 'TicoBOT';
  const body = typeof payload.body === 'string' ? payload.body : 'Tienes una nueva notificación.';
  const url = resolveNotificationUrl(payload.data);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-icon.svg',
      badge: '/pwa-maskable.svg',
      tag: typeof payload.tag === 'string' && payload.tag.trim().length > 0 ? payload.tag : 'ticobot-push',
      renotify: true,
      data: { ...payload.data, url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = resolveNotificationUrl(event.notification?.data);

  event.waitUntil(focusOrOpenWindow(url));
});
