self.addEventListener('sync', (event) => {
  if (event.tag !== 'finance-os-sync') return
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clients) {
        client.postMessage({
          type: 'PWA_BG_SYNC_FLUSH',
          tag: event.tag,
          source: 'service_worker_sync',
        })
      }
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type !== 'PWA_SHOW_NOTIFICATION') return
  const payload = data.payload || {}
  const title = String(payload.title || 'Finance OS')
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: {
      route: typeof payload.route === 'string' ? payload.route : '/?view=automation',
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
    },
    badge: '/pwa-192x192.png',
    icon: '/pwa-192x192.png',
    renotify: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {
      title: 'Finance OS reminder',
      body: event.data ? event.data.text() : 'Open the dashboard for recent alerts.',
    }
  }

  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title
      : 'Finance OS reminder'
  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body
      : 'A due item or cycle alert is ready for review.'
  const route =
    typeof payload.route === 'string' && payload.route.trim()
      ? payload.route
      : '/?view=automation'
  const tag =
    typeof payload.tag === 'string' && payload.tag.trim()
      ? payload.tag
      : 'finance-os-push'

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      data: {
        route,
        source: 'push',
        ...(payload && typeof payload === 'object' ? payload : {}),
      },
      badge: '/pwa-192x192.png',
      icon: '/pwa-192x192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const route =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.route === 'string'
      ? event.notification.data.route
      : '/?view=dashboard'
  const targetUrl = new URL(route, self.location.origin).href

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of clients) {
        if ('focus' in client) {
          try {
            if (client.url && client.url.startsWith(self.location.origin)) {
              client.postMessage({
                type: 'PWA_NOTIFICATION_CLICK',
                route,
              })
              await client.focus()
              if ('navigate' in client && typeof client.navigate === 'function') {
                await client.navigate(targetUrl)
              }
              return
            }
          } catch {
            // Try the next client or open a new window.
          }
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })(),
  )
})
