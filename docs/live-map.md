# Live map

Admin /admin/mapa reads approved establishments and the admin-only, SECURITY INVOKER admin_live_couriers RPC. Each available or busy approved driver gets the latest indexed tracking point independently; another driver's history cannot hide them behind a global row limit. Existing RLS and the active-account gate remain enforced. No GPS timestamp is fabricated from status changes or last_seen.

Realtime invalidation listens to tracking_points, courier_profiles and establishments. Polling (8 seconds for drivers, 30 for stores), focus, reconnect and visibility resume recover missed events. A coordinate older than 60 seconds appears gray, never as a fresh driver. Missing GPS remains explicit in the list. Query errors retain data with a warning.

The courier layout publishes checked GPS writes across all courier screens, updating tracking_points and profile coordinates. A visible-app heartbeat obtains a new fix every 15 seconds even while stationary; cached fixes older than 30 seconds are rejected. Failures show an actionable banner and retry. Device location opt-out remains respected. Browsers and operating systems may suspend background GPS; this PWA does not claim continuous native background tracking.

Map markers update in place, preserving popups and viewport. ResizeObserver invalidates the map after layout/sidebar/dialog changes. Tile errors show a retry action. Centralizar fits the visible markers.

Stores can save the collection point through Ajustar localização, from the admin map or establishment settings. Checked owner/admin writes persist the selected point. Address edits clear the previous coordinates, requiring confirmation at the new address. Geocoding accepts only rooftop/interpolated, non-partial results; city centroids are never stored as storefronts. If the provider is unavailable or imprecise, the map picker and coordinates work independently.

Verification: tests/live-map.test.mjs, tests/map-utils.test.mjs, tests/geocoding.test.mjs and supabase/tests/live-map.sql (fixture prefix from order-acceptance-flow.sql; all rolled back). The SQL contract covers 510 competing tracking points, fresh authenticated GPS write/read, offline exclusion, non-admin denial and owner coordinate persistence.
