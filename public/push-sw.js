/* PedeTrem — service worker de mensagens (push).
   Não faz cache de app shell: serve apenas para notificações em segundo plano. */

const ICONS = {
  cliente: "/pedetrem-icon-192.png",
  estabelecimento: "/pedetrem-estabelecimento.png",
  entregador: "/pedetrem-entregador.png",
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
      for (const client of all) {
        if (client.url.includes(self.location.origin)) {
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
