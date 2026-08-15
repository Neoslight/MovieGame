/**
 * Service worker, written by hand rather than pulled from a PWA plugin: the
 * app needs two narrow behaviours, and hand-rolling them avoids betting the
 * build on a library's Next 16 App Router support.
 *
 * What it fixes: the deck lives in IndexedDB and works offline already, but
 * without a worker a fresh navigation with no network fails outright — the data
 * is there and the app cannot start to read it. The poster cache matters just
 * as much: TMDB images are hotlinked, so an offline session would otherwise be
 * a wall of broken frames.
 */

const SHELL = "contretype-shell-v1";
const IMAGES = "contretype-images-v1";

/** Posters and faces already seen. Bounded so a big deck cannot fill the disk. */
const MAX_IMAGES = 600;

self.addEventListener("install", (event) => {
  // Only the offline entry point is precached. Next's own assets are
  // content-hashed and get picked up at runtime, so listing them here would
  // just go stale on every deploy.
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(["/", "/play"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL && key !== IMAGES).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Drops the oldest entries once a cache outgrows its budget. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache the import routes: they stream live scrapes, and a stale reply
  // would silently rebuild the deck from yesterday's data.
  if (url.pathname.startsWith("/api/")) return;

  // TMDB images: cache first. They are immutable — a poster path never changes
  // content — so a hit is always correct and saves the round trip.
  if (url.hostname === "image.tmdb.org") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches
                .open(IMAGES)
                .then((cache) => cache.put(request, copy))
                .then(() => trim(IMAGES, MAX_IMAGES));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Everything else: network first, falling back to the cache. The app is
  // updated often enough that serving a stale shell by default would be worse
  // than a slightly slower load.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // A navigation to a page never visited offline still lands somewhere
        // usable rather than on the browser's error page.
        if (request.mode === "navigate") {
          const home = await caches.match("/");
          if (home) return home;
        }
        return Response.error();
      }),
  );
});
