self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('Charge utile push invalide :', error);
  }

  const title = typeof payload.title === 'string' ? payload.title : 'CongésZen';
  const options = {
    body: typeof payload.body === 'string' ? payload.body : 'Une nouvelle information est disponible.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
    tag: typeof payload.tag === 'string' ? payload.tag : 'congeszen-notification',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url ?? '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
