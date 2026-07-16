/* PushVault service worker — displays pushes delivered by the PushVault
 * backend (payload: {title, body, url, icon}). Deployed at the site root
 * with Service-Worker-Allowed "/" (nginx vhost). */
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'New deal alert', {
      body: data.body || '',
      icon: data.icon || undefined,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(clients.openWindow(url));
});
