# Customer home store visibility
The Home screen queried cities with ILIKE exact spelling and hid all closed stores, while Novidades used the approved public directory without those filters.

Production read-only reproduction: accented São Sebastião do Paraíso returned 0 instead of 1; Ribeirão Preto returned 0 instead of 2 because the open shop had a trailing space and the other shop was closed.

The new customer_store_directory RPC normalizes accents, case and whitespace, optionally restricts the state, returns only public listing fields of approved stores and keeps caller RLS (SECURITY INVOKER). Closed stores remain listed with the existing Fechado UI, and open stores sort first.

Home waits for location resolution, ignores stale requests, refreshes on resume/store updates/profile updates and shows a retryable load error. No stores, customer profiles, approval status or opening status were edited to fix visibility.

Validation: actual SQL function tested in PGlite with anon/authenticated roles, city variants, closed shops, pending shops and same-name cities in different states. Production-schema transaction/rollback verified both caller roles and the real city regression. TypeScript/lint and production UI verified during release.
