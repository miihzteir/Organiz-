/* Organizê · service worker (app instalável, offline e notificações) */
const CACHE = "organize-v2026110214";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./badge-96.png", "./apple-touch-icon.png", "./firebase-config.js"];

try {
  importScripts("./firebase-config.js");
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js", "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");
  const cfg = self.ORGANIZE_FIREBASE;
  if (cfg && cfg.apiKey && !/COLE/.test(cfg.apiKey)) {
    const { vapidKey, ...conf } = cfg;
    firebase.initializeApp(conf);
    firebase.messaging().onBackgroundMessage((p) => {
      const d = (p && p.data) || {};
      return self.registration.showNotification(d.title || "Organizê", {
        body: d.body || "",
        icon: "./icon-192.png",
        badge: "./badge-96.png",
        tag: d.tag || undefined,
        renotify: false,
        vibrate: [120, 60, 120],
        data: { url: d.url || "./", taskId: d.taskId || "" },
      });
    });
  }
} catch (e) {}

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.endsWith("version.json")) return;
  // rede primeiro (sempre a versão mais nova), cache se estiver sem internet
  ev.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))),
  );
});
self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  const d = ev.notification.data || {};
  const target = new URL(d.url || "./", self.registration.scope).href;
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          if (d.taskId) c.postMessage({ type: "open-task", taskId: d.taskId });
          else c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
