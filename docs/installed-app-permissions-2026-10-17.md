# Optional permissions in installed apps

The customer, establishment and courier apps offer notification and location setup when opened in standalone mode. Ordinary browser visitors keep their existing flow. Each setup uses the corresponding profile artwork and explains the purpose of each permission.

The owner selected **request permissions and allow continuing**. The user can always choose **Continuar por enquanto**, close the dialog or dismiss it with Escape. Dismissal lasts for that app's session and does not claim that any permission was granted. Native requests happen only after an explicit activation button; denied or unsupported permissions offer help rather than repeated native requests.

Permission state is read again on focus, visibility changes and supported permission-change events. Existing settings remain authoritative. A pending GPS request is invalidated on dismissal, cleanup or later location opt-out; a delayed callback cannot turn tracking back on. Setup does not persist coordinates. Notification permission granted in phone settings still leaves an explicit activation action until app opt-in is recorded.

Push subscription registration waits for a validated authenticated route and native notification consent. Existing subscriptions remain compatible; creating a new subscription requires explicit app opt-in. Disabling alerts prevents automatic reactivation, including while subscription lookup is pending. The existing authenticated save function and database access controls are reused; this release requires no database or environment changes.

## Validation

- 157 automated tests passed, including native API boundaries, delayed GPS cancellation, late push opt-out, actual React panel rendering, three independent installation identities and existing checkout/access/accounting regressions.
- TypeScript and ESLint with zero warnings passed.
- Node and Vercel production builds passed. Local HTTP checks verified all three role manifests, login entries and icons. The deploy-input check excluded private files; scanning 311 public output files found no actual server credential values.
- Independent code review found no remaining critical or important issues after the cancellation and OS-settings-return fixes.
- Real Android/iPhone permission dialogs and physical push delivery still need a device check. Automated tests do not authorize or collect the owner's real GPS location and do not send real push notifications.

After publication, close and reopen the installed app to load the new version. Activate each permission independently or continue and use the existing settings later. On iPhone, web push requires a supported iOS version and a Home Screen installation; the native request must follow the user's button press.
