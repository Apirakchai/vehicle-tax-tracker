// ============= SERVICE WORKER =============
// Vehicle Tax Tracker — Black Chicken Farm
// Strategy: Cache-first สำหรับ static assets, Network-first สำหรับ API/data

const CACHE_VERSION = "bcf-vt-v1.1.0";
const STATIC_CACHE = CACHE_VERSION + "-static";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

// Static files ที่จะ pre-cache ตอน install
const STATIC_ASSETS = [
  "./",
  "./login.html",
  "./index.html",
  "./app.js",
  "./data.js",
  "./sarabun-font.js",
  "./logo.png",
  "./favicon.png",
  "./favicon.ico",
  "./manifest.json",
  "./app-icon-192.png",
  "./app-icon-512.png",
  "./app-icon-maskable.png",
  "./apple-touch-icon.png",
  "./og-image.jpg",
];

// CDN libraries — cache แยก
const CDN_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.7.1/jspdf.plugin.autotable.min.js",
];

// ============= INSTALL =============
self.addEventListener("install", event => {
  console.log("[SW] Installing...", CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      // Pre-cache local static assets
      return cache.addAll(STATIC_ASSETS).then(() => {
        // Try to cache CDN assets but don't fail if blocked
        return Promise.allSettled(
          CDN_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn("[SW] CDN cache failed:", url, err))
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ============= ACTIVATE =============
self.addEventListener("activate", event => {
  console.log("[SW] Activating...", CACHE_VERSION);
  event.waitUntil(
    // Delete old version caches
    caches.keys().then(names => {
      return Promise.all(
        names
          .filter(name => name.startsWith("bcf-vt-") && !name.startsWith(CACHE_VERSION))
          .map(name => {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ============= FETCH =============
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== "GET") return;

  // Skip cross-origin requests to Apps Script (always go to network)
  if (url.hostname.includes("script.google.com") ||
      url.hostname.includes("googleusercontent.com") ||
      url.hostname.includes("drive.google.com")) {
    return; // Let browser handle it directly
  }

  // Network-first for HTML (always try latest version)
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets (CSS, JS, images, fonts)
  event.respondWith(cacheFirst(request));
});

// ============= STRATEGIES =============
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    // Background update (stale-while-revalidate)
    fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
    }).catch(() => {});
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const runtimeCache = await caches.open(RUNTIME_CACHE);
      runtimeCache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline fallback for images
    if (request.destination === "image") {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f7f4ec"/><text x="50" y="50" text-anchor="middle" fill="#9ca3af" font-size="12">offline</text></svg>',
        { headers: { "Content-Type": "image/svg+xml" } }
      );
    }
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // If can't reach network and no cache → return offline page
    return new Response(
      `<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8">
      <title>ออฟไลน์ — BCF Tax</title>
      <style>
        body { font-family: sans-serif; padding: 40px; text-align: center; background: #0a1f44; color: white; }
        h1 { color: #c9a961; }
      </style></head><body>
      <h1>ไม่มีอินเทอร์เน็ต</h1>
      <p>กรุณาเชื่อมต่ออินเทอร์เน็ตและลองใหม่อีกครั้ง</p>
      <button onclick="location.reload()" style="padding:12px 24px; background:#c9a961; color:#0a1f44; border:none; border-radius:8px; cursor:pointer; font-weight:600;">
        ลองใหม่
      </button></body></html>`,
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }
}

// ============= MESSAGES =============
// รับคำสั่งจาก app เพื่อ skip waiting / clear cache
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    caches.keys().then(names => names.forEach(n => caches.delete(n)));
  }
});
