/* Organizê · service worker (app instalável, offline e notificações) */
const CACHE = "organize-v2026110236";
const LIBS = "organize-libs-v1";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./badge-96.png", "./notif-192.png", "./apple-touch-icon.png", "./firebase-config.js", "./favicon-64.png"];
const CDN = [
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js",
];
const LIB_HOSTS = ["www.gstatic.com", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (ev) => {
  ev.waitUntil(
    Promise.all([
      caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}),
      caches.open(LIBS).then((c) =>
        Promise.all(
          CDN.map((u) =>
            c.match(u).then(
              (hit) =>
                hit ||
                fetch(u, { mode: "cors" })
                  .catch(() => fetch(u, { mode: "no-cors" }))
                  .then((res) => (res.ok || res.type === "opaque") && c.put(u, res))
                  .catch(() => {}),
            ),
          ),
        ),
      ),
    ]),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== LIBS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // bibliotecas e fontes: guardadas no aparelho (o app abre sem internet)
  if (LIB_HOSTS.includes(url.hostname)) {
    if (url.hostname === "www.gstatic.com" && !url.pathname.startsWith("/firebasejs/")) return;
    ev.respondWith(
      caches.open(LIBS).then((c) =>
        c.match(req, { ignoreVary: true }).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok || res.type === "opaque") c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  if (url.origin !== location.origin || url.pathname.endsWith("version.json")) return;
  // páginas do app: internet primeiro (versão mais nova); sem internet, a cópia guardada
  ev.respondWith(
    timeout(fetch(req), req.mode === "navigate" ? 6000 : 15000)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((r) => r || caches.match("./index.html"))),
  );
});

/* notificações enviadas pelo servidor (app fechado) */
self.addEventListener("push", (ev) => {
  let p = {};
  try {
    p = ev.data ? ev.data.json() : {};
  } catch {
    try {
      p = { data: { body: ev.data.text() } };
    } catch {}
  }
  const n = p.notification || {};
  const d = p.data || p;
  const title = d.title || n.title || "Organizê";
  ev.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || n.body || "",
      icon: "./notif-192.png",
      badge: "./badge-96.png",
      tag: d.tag || undefined,
      renotify: false,
      vibrate: [120, 60, 120],
      data: { url: d.url || "./", taskId: d.taskId || "" },
    }),
  );
});
self.addEventListener("pushsubscriptionchange", (ev) => {
  ev.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => l.forEach((c) => c.postMessage({ type: "push-renew" }))));
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
