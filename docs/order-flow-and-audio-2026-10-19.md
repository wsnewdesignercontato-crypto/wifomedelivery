# Operational order and audio verification

Flow: checkout persists order and items → merchant notification/60-second foreground acceptance alert → acceptance/preparation → Pronto e chamar entregador dispatches the ride → eligible couriers receive notification → atomic first acceptance assigns courier → pickup/travel/proof completion updates the customer. Pickup orders do not request couriers.

Fixes:
- Ready delivery orders now retain a Chamar entregador action, so a failed dispatch after marking ready can be retried safely. Dispatch is idempotent; the action is disabled while sending and reloads server state afterwards.
- Audio unlock no longer marks itself permanently unlocked after a rejected attempt. Further gestures can retry, closed contexts are recreated and interrupted contexts are resumed.
- Suspended audio contexts do not accumulate oscillator notes; cleanup releases ended nodes. Preview never cancels a real alert loop.
- Merchant/courier settings include explicit foreground sound control and Testar toque. The existing melody is retained until a replacement audio asset is supplied.
- Courier push city matching treats accented/unaccented city names as equivalent, retaining approval, online, availability and targeted-dispatch rules.

- Address-only pickup offers are no longer silently discarded when the store lacks GPS coordinates; maps/distances remain optional, and GPS navigation falls back to the full street/city/state address. The offer dialog scrolls and keeps accept/decline actions available.

Evidence:
- Installed production functions passed the full checkout/delivery/deadline contract with rollback; no real order was modified.
- Targeted tests cover failed-dispatch retry, pickup exclusion, delayed autoplay unlock, interrupted contexts, loop idempotency, preview isolation, matching city variants and excluded recipients.
- Push and order-expiry cron jobs were active with successful latest runs. Push queue had no recent pending messages at inspection.

Limits:
The current apps are PWAs. The in-page melody depends on browser autoplay permission and a running page. A minimized page may be suspended. Web Push can notify without the page running, with OS-controlled sound. Custom continuous ringing on a locked/background phone requires native platform support and real device validation. This release does not claim physical Android/iOS audio delivery or Uber-equivalent background behavior.
