# PedeTrem / wifomedelivery

## Platform

- Target hosting: Vercel, using TanStack Start and Nitro.
- Backend: the existing Supabase project. Preserve its data, authentication, storage and realtime configuration.
- Keep credentials in ignored local files and private server environment variables. Never expose administrative keys through VITE-prefixed variables.
- Preserve published Git history. Do not force-push, rebase, amend or squash commits that are already pushed.
- Validate the new production deployment before retiring the old hosting or disconnecting its synchronization.

## Branding

- Render the supplied brand asset through the shared logo component without profile-specific color filters, so every profile preserves the approved artwork.
- Keep existing installation IDs, storage keys, API identifiers, and deployed URLs stable during visual rebrands to preserve sessions and installed apps.
- Derive public favicon and installation icons from the same supplied artwork; use the local asset pointer for in-app logo rendering.
