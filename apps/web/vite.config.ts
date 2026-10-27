import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

const proxyTo = (target: string) => ({
  "/api": { target, changeOrigin: true },
  "/content": { target, changeOrigin: true },
});

/**
 * Where the dev server proxies `/api` and `/content`. Required, no default: docker compose sets
 * it (the api service name); on the host, set it in the shell (e.g. `http://localhost:3000`).
 * Builds and tests do not proxy, so they do not need it.
 */
function requireApiUrl(): string {
  const apiUrl = process.env.API_URL?.trim();
  if (!apiUrl) {
    throw new Error("API_URL is not set: the Vite dev server needs it to proxy /api and /content");
  }
  return apiUrl;
}

// Design tokens (src/app/tokens.css): cream page and top bar; the splash shows the cream page.
const THEME_COLOR = "#f3efe5";
const BACKGROUND_COLOR = "#f3efe5";
const SHORTCUT_ICONS = [{ src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }];

export default defineConfig(({ command, mode }) => ({
  plugins: [
    react(),
    VitePWA({
      // The app asks before activating a new service worker (see UpdateToast).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        id: "/",
        name: "English Course",
        short_name: "English",
        description: "Personal English course: grammar, reading, writing.",
        lang: "en",
        dir: "ltr",
        display: "standalone",
        start_url: "/",
        scope: "/",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        categories: ["education"],
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Today", short_name: "Today", url: "/", icons: SHORTCUT_ICONS },
          {
            name: "Vocabulary",
            short_name: "Vocabulary",
            url: "/vocabulary",
            icons: SHORTCUT_ICONS,
          },
          { name: "Reading", short_name: "Reading", url: "/reading", icons: SHORTCUT_ICONS },
        ],
      },
      workbox: {
        // App shell: built js/css/html plus the self-hosted fonts (woff2; the woff fallbacks are
        // only for browsers without woff2 support), includeAssets and manifest icons.
        globPatterns: ["**/*.{js,wasm,css,html,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/content(\/|$)/],
        cleanupOutdatedCaches: true,
        // Only the routes below are cached at runtime. Everything else under /api (auth,
        // settings, tutor, every POST) always goes to the network and is never stored.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/content/images/"),
            method: "GET",
            handler: "CacheFirst",
            options: {
              cacheName: "content-images",
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // A started unit or today's article can be reopened offline, read-only.
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              (/^\/api\/units(\/|$)/.test(url.pathname) ||
                /^\/api\/reading\/(today|articles\/[^/]+)$/.test(url.pathname)),
            method: "GET",
            handler: "NetworkFirst",
            options: {
              cacheName: "api-study",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Only the dev server (and preview) proxies; vitest also runs as "serve", in mode "test".
    ...(command === "serve" && mode !== "test" ? { proxy: proxyTo(requireApiUrl()) } : {}),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
