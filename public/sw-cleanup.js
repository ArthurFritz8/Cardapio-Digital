/* ADR 0006: apaga respostas privadas salvas pelas regras genéricas antigas. */
self.addEventListener("activate", (event) => {
  const legacyCaches = new Set([
    "apis",
    "pages",
    "pages-rsc",
    "pages-rsc-prefetch",
    "cross-origin",
    "next-data",
    "static-data-assets",
    "start-url",
  ]);
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => legacyCaches.has(name)).map((name) => caches.delete(name))),
    ),
  );
});
