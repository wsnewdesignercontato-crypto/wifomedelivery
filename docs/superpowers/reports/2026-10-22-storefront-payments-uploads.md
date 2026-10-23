# Storefront, payment choices and image guidance

## Implemented

- Cart addition checks reads/writes, retains the open product on error and blocks repeated taps while saving. A confirmed write shows a rounded success notice with the product, quantity and an OK action. Items with different instructions remain separate.
- Checkout labels distinguish online Pix/card from payment on pickup or delivery (Pix/card/cash), with icons. Known payer and billing details prefill editable fields, isolated by account; saved-card payments omit PAN, expiry, CVV and billing-address inputs.
- Category artwork resolves accents, plurals and business aliases. Food categories reuse existing photos; other categories have relevant vector illustrations and image failures retain an illustration.
- Store cards and combinable scrollable filters distinguish product promotions, valid shop coupons, verified online availability, delivery-zone conditions and genuine review counts. Missing or failed benefit reads do not advertise unsupported benefits. No-review stores show Novo.
- Upload controls display recommended dimensions, supported formats and the existing 5 MB limit. Documents and delivery photos prioritize legibility instead of arbitrary artwork dimensions. Dimensions remain recommendations.

## Validation

- Full suite: 610 tests passed, zero failures.
- TypeScript: passed.
- ESLint on all changed/new production files: zero errors; one pre-existing Fast Refresh warning in product-photo-field.tsx.
- Production build with NITRO_PRESET=vercel: passed.
- git diff --check: passed.
- Independent initial review of cart/checkout/upload changes: no important findings; 34 targeted tests passed. The final catalog review agent could not run because of model capacity; catalog was reviewed locally and covered by data, UI, policy and pagination tests.

## Boundaries

No schema migration, account change, live cart/order mutation, upload or actual payment was performed for this change. Existing Supabase RLS and Asaas charging/confirmation/idempotency remain in place. Provider card processing is not proven by UI/unit tests and was not exercised with a real charge.

Production browser verification is recorded after deployment.
