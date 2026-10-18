/* PedeTrem — service worker de mensagens (push).
   Não faz cache de app shell: serve apenas para notificações em segundo plano. */

const ICONS = {
  cliente: "/icons/cliente-any-192-v2.png",
  estabelecimento: "/icons/estabelecimento-any-192-v2.png",
  entregador: "/icons/entregador-any-192-v2.png",
};

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "PedeTrem", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "PedeTrem";
  let profile = "cliente";
  try {
    const path = new URL(data.url || "/", self.location.origin).pathname;
    if (path.startsWith("/estabelecimento")) profile = "estabelecimento";
    else if (path.startsWith("/entregador")) profile = "entregador";
  } catch {
    /* Keep the default icon. */
  }
  const ICON = ICONS[profile];
  const options = {
    body: data.body || "",
    icon: ICON,
    badge: ICON,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    silent: false,
    requireInteraction:
      profile !== "cliente" &&
      (String(data.url || "").includes("/pedidos") || String(data.url || "").includes("/corridas")),
    data: { url: data.url || "/" },
    vibrate: [90, 40, 90],
    timestamp: Date.now(),
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (typeof data.unread === "number" && "setAppBadge" in self.navigator) {
        try {
          if (data.unread > 0) await self.navigator.setAppBadge(data.unread);
          else await self.navigator.clearAppBadge();
        } catch {
          /* badge não suportado */
        }
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const target = new URL(url, self.location.origin);
      const role = target.pathname.split("/")[1];
      for (const client of all) {
        const current = new URL(client.url);
        // Three installed apps may be open; do not navigate another profile's window.
        if (current.origin === target.origin && current.pathname.split("/")[1] === role) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
