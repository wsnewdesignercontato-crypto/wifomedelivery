# Push notifications — 2026-10-18
The admin campaign goes from Admin → authenticated Data API → notifications → database webhook → protected Vercel dispatcher → browser push service → service worker → OS notification.

## Fixes
- Restore INSERT grant on notifications for authenticated. Existing admin-only RLS still restricts campaign creation; anon and non-admin writes are denied.
- Preserve PostgREST plain-object error messages and fail recipient lookup explicitly.
- Compare-and-set claim pending notifications to prevent concurrent webhook/cron calls sending the same batch.
- Release failed claims for retry if no device accepted the notification; remove 404/410 expired subscriptions. A successful device is not re-alerted when a second device fails.
- Private cron fallback checks for recent pending notifications every 10 seconds; signed webhook authentication stays required. Subscription secrets never reach browser roles.
- Bound push-provider requests to 10 seconds; background notifications request audible defaults and interaction persistence where supported.
- Add a per-account test button in the shared alerts card and an authenticated HEAD health check that validates VAPID credentials without sending a notification.

- Customer device settings now use the same real opt-in/subscription card; previously that screen granted browser permission without registering a push subscription.
- Test push waits 5 seconds server-side so the user can minimize the app before receipt.

## Evidence
- Production-schema SQL contract (transaction + rollback): admin can insert info/promo campaigns for all three audiences; ordinary users and anonymous users cannot; private retry function is inaccessible.
- Unit/controller checks cover concurrent claims, transient failure/retry, dead subscriptions, lookup failures, background notification display with no open windows, role-specific icons/navigation and signing key consistency.
- Live empty dispatcher returned HTTP 200, ok:true,sent:0 before changes. No mass campaign was sent for testing.

## Practical limits and phone check
Minimizing a PWA does not guarantee its page or Web Audio keeps running; the OS may suspend it. Web Push can display a notification without the page running. Sound is controlled by OS notification permissions, volume, silent/Focus modes, battery restrictions and browser policy. The continuous foreground melody is not guaranteed in background or on a locked phone.
After updating, each installed app should enable alerts separately, tap Send test notification and minimize the app during the 5-second server-side delay. A physical Android/iPhone receipt and sound check must be completed on that device; mocked worker tests do not prove OS delivery.
