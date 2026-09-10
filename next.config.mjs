import withPWAInit from "@ducanh2912/next-pwa";

export const pwaOptions = {
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // O cache genérico inclui páginas/RSC autenticados e respostas da API.
  // Só o shell público e os assets explicitamente permitidos ficam offline.
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  reloadOnOnline: true,
  extendDefaultRuntimeCaching: false,
  workboxOptions: {
    disableDevLogs: true,
    importScripts: ["/sw-cleanup.js"],
    runtimeCaching: [
      {
        urlPattern: ({ sameOrigin, url, request }) =>
          sameOrigin &&
          /^\/m\/[0-9a-f-]{36}\/?$/i.test(url.pathname) &&
          request.mode === "navigate",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "public-menu-pages-v1",
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        // Preaquece somente o HTML público após o primeiro scan. RSC fica fora
        // para não confundir HTML e payload de navegação do App Router.
        urlPattern: ({ sameOrigin, url, request }) =>
          sameOrigin &&
          /^\/m\/[0-9a-f-]{36}\/?$/i.test(url.pathname) &&
          request.headers.get("X-Public-Menu-Shell") === "1" &&
          !request.headers.has("RSC"),
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "public-menu-pages-v1",
          expiration: { maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        // Fotos do cardápio (Supabase Storage público): cache-first —
        // imagem de prato quase nunca muda e o menu precisa abrir offline
        urlPattern:
          /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "supabase-images",
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 dias
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: ({ sameOrigin, url }) =>
          sameOrigin &&
          (url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/icons/")),
        handler: "CacheFirst",
        options: {
          cacheName: "public-static-v1",
          expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [200] },
        },
      },
      { urlPattern: () => true, handler: "NetworkOnly" },
    ],
  },
};

const withPWA = withPWAInit(pwaOptions);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withPWA(nextConfig);
