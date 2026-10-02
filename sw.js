/* =========================================================
   SERVICE WORKER — Đảo Mèo / S Rank
   - Precache app shell (HTML, CSS, JS, icon, manifest)
   - Network-first cho API Google Script (không cache để tránh stale data)
   - Cache-first cho static assets
   - Stale-while-revalidate cho CSS/JS để update mượt
   - Auto skipWaiting + clients.claim để update tức thì
   ========================================================= */
"use strict";

const SW_VERSION = "v1.1.0";
const CACHE_NAME = `srank-cache-${SW_VERSION}`;
const RUNTIME_CACHE = `srank-runtime-${SW_VERSION}`;

// Danh sách asset cần precache khi cài SW lần đầu
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",

  "/css/main.css",

  "/js/main.js",
  "/js/attendance.js",
  "/js/bxh-top.js",
  "/js/lunch.js",
  "/js/kdv-rules.js",
  "/js/secret-mail.js"
];

// Host của Google Apps Script — không cache, luôn fetch mới
const API_HOSTS = [
  "script.google.com",
  "script.googleusercontent.com"
];

// CDN ngoài — có thể cache runtime (không bắt buộc precache)
const CDN_HOSTS = [
  "cdn.jsdelivr.net"
];

// =========================================================
// INSTALL — precache app shell
// =========================================================
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll fail nếu 1 URL 404 → dùng add riêng từng cái để không fail toàn bộ
      const results = await Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" }))
        )
      );
      const failed = results
        .map((r, i) => (r.status === "rejected" ? PRECACHE_URLS[i] : null))
        .filter(Boolean);
      if (failed.length) {
        console.warn("[SW] Precache thất bại một số URL:", failed);
      }
      await self.skipWaiting();
    })()
  );
});

// =========================================================
// ACTIVATE — dọn cache cũ + nhận diện client
// =========================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );

      // Bật điều hướng preload nếu browser hỗ trợ
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (_) {}
      }

      await self.clients.claim();
    })()
  );
});

// =========================================================
// HELPERS
// =========================================================
function isApiRequest(url) {
  return API_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
}

function isCdnRequest(url) {
  return CDN_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h));
}

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  if (url.pathname === "/" || url.pathname.endsWith(".html")) return true;
  return false;
}

function isStaticAsset(request) {
  const d = request.destination;
  return d === "style" || d === "script" || d === "image" ||
         d === "font" || d === "manifest" || d === "worker";
}

// Giới hạn số entry runtime cache để tránh phình bộ nhớ
async function trimRuntimeCache(maxEntries = 60) {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    // Xoá các entry cũ nhất (theo thứ tự insertion)
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch (_) {}
}

// =========================================================
// FETCH — chiến lược theo loại request
// =========================================================
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Chỉ xử lý GET
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // Bỏ qua scheme không mong muốn
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 1) API Google Script → network-only, không cache
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ ok: false, error: "offline" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      ))
    );
    return;
  }

  // 2) HTML navigation → network-first, fallback cache, fallback offline
  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirstHtml(request));
    return;
  }

  // 3) CDN (html2canvas...) → stale-while-revalidate
  if (isCdnRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    return;
  }

  // 4) Static assets cùng origin (CSS, JS, ảnh, font) → stale-while-revalidate
  if (isSameOrigin(url) && isStaticAsset(request)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }

  // 5) Mặc định: network-first, fallback cache
  event.respondWith(networkFirstGeneric(request));
});

// =========================================================
// STRATEGIES
// =========================================================

// HTML: ưu tiên mạng, fallback cache, cuối cùng là offline page
async function networkFirstHtml(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    // Chỉ cache nếu response ok và không phải redirect cross-origin
    if (fresh && fresh.ok && fresh.type !== "opaqueredirect") {
      try {
        cache.put(request, fresh.clone());
        // Cũng cache "/" và "/index.html" để fallback chuẩn
        const url = new URL(request.url);
        if (url.pathname === "/" || url.pathname === "/index.html") {
          cache.put("/index.html", fresh.clone());
        }
      } catch (_) {}
    }
    return fresh;
  } catch (_) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match("/index.html")) ||
      (await cache.match("/"));
    if (cached) return cached;
    return new Response(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{font-family:system-ui,sans-serif;background:#f3f7f1;color:#284b3a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}div{max-width:320px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#6f8579;font-size:14px;line-height:1.5}</style></head><body><div><h1>📡 Không có kết nối</h1><p>Vui lòng kiểm tra mạng và thử lại.</p></div></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// Generic: network-first, fallback cache
async function networkFirstGeneric(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      try { cache.put(request, fresh.clone()); } catch (_) {}
    }
    return fresh;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const runtime = await caches.open(RUNTIME_CACHE);
    const cachedRuntime = await runtime.match(request);
    if (cachedRuntime) return cachedRuntime;
    return new Response("", { status: 504, statusText: "Offline" });
  }
}

// Stale-while-revalidate: trả cache ngay, cập nhật nền
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        try { cache.put(request, response.clone()); } catch (_) {}
        if (cacheName === RUNTIME_CACHE) trimRuntimeCache();
      }
      return response;
    })
    .catch(() => null);

  return cached || (await fetchPromise) || new Response("", { status: 504 });
}

// =========================================================
// MESSAGE — cho phép client force update / skip waiting
// =========================================================
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (data.type === "CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        // Báo lại cho client
        event.source?.postMessage?.({ type: "CACHES_CLEARED" });
      })()
    );
  }
  if (data.type === "GET_VERSION") {
    event.source?.postMessage?.({ type: "VERSION", version: SW_VERSION });
  }
});

// =========================================================
// NOTIFICATION CLICK — focus vào app
// =========================================================
self.addEventListener("notificationclick", (event) => {
  event.notification?.close?.();
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });
      for (const client of allClients) {
        if ("focus" in client) {
          try { await client.focus(); return; } catch (_) {}
        }
      }
      if (self.clients.openWindow) {
        try { await self.clients.openWindow("/"); } catch (_) {}
      }
    })()
  );
});
