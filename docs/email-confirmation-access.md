# Email confirmation and protected access

Supabase mailer_autoconfirm remains false and the existing signed Brevo Send Email Hook remains enabled. The reported pending courier signup had no last_sign_in_at and no courier profile. The provider event API reported delivered for the confirmation request; provider acceptance and delivery do not prove placement in the primary inbox or that the recipient opened the message.

AuthScreen verifies the current Auth user before forwarding restored sessions, successful password sign-ins or signup sessions. An unconfirmed account is signed out locally and shown the existing manual resend control for the selected app. The protected route checks the current user's email_confirmed_at before returning authenticated context. Public customer catalog browsing remains guest access. The server middleware independently calls Auth getUser with the JWT and rejects an unconfirmed or mismatched identity before protected function execution; the existing blocked/deleted-account database gate remains in place.

No real account was auto-confirmed, deleted or assigned courier privileges. No extra emails were sent in verification. Existing redirect URLs, templates, sender, transport, hook secrets and Auth settings were preserved.

Verification covers the three profiles, restored and signup sessions, successful password responses for unconfirmed users, direct route access, guest browsing, confirmed users, server functions and the blocked-account gate. Existing resend and signed-hook tests remain included.
