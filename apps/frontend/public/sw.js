// Cleanup service worker - unregisters itself
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", () => {
  self.registration.unregister()
    .then(() => self.clients.matchAll())
    .then(clients => clients.forEach(client => client.navigate(client.url)))
    .then(() => console.log("[PWA] Old service worker unregistered"));
});
