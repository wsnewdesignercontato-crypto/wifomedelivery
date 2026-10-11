<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Branding
- Render the supplied brand asset through the shared logo component without profile-specific color filters, so every profile preserves the approved artwork.
- Keep existing installation IDs, storage keys, API identifiers, and deployed URLs stable during visual rebrands to preserve sessions and installed apps.
- Derive public favicon and installation icons from the same supplied artwork; use the CDN asset pointer for in-app logo rendering.
