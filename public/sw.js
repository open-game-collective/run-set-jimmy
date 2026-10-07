/*
 * Run Set Jimmy's service worker: makes the game installable and the app shell fast, with an
 * offline page. Game pages (/tv, /join, /host), the room's API and OGS calls always go to the
 * network: they carry live state and seat tokens and are never cached.
 */
const SHELL = "rsj-shell-v2";
// Canonical URLs: the asset server redirects /x.html to /x, and a cached redirect can't be a page.
const PRECACHE = ["/start", "/offline", "/styles.css", "/js/start.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/favicon-64.png"];
const LIVE = /^\/(api|ogs|host|ws-probe)(\/|$)/;
const STATIC = /^\/(js\/|icons\/|styles\.css$|manifest\.webmanifest$)/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || LIVE.test(url.pathname)) return;

  if (req.mode === "navigate") {
    // Pages: always the network; offline, the cached start screen or the offline page.
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(SHELL);
        return (url.pathname === "/start" && (await cache.match("/start"))) || (await cache.match("/offline"));
      }),
    );
    return;
  }
  if (STATIC.test(url.pathname)) {
    // The shell: answer from the cache at once, refresh it in the background.
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(req);
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) void cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      }),
    );
  }
});
