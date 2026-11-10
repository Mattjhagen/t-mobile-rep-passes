# Rep Launch — Popl onboarding

Live app: [rep.mattjhagen.xyz](https://rep.mattjhagen.xyz)

Separate mobile-friendly onboarding app for reps. The original tmobile-pass repository and Pitch Coach deployment are unchanged.

## Flow

1. Enter name, title, company, work phone/email, optional personal contact-page URL and photo.
2. Choose iPhone or Android, install Popl using its official link, and sign in.
3. Copy individual fields or a prepared summary into Popl and customize the digital card.
4. Follow Popl's Wallet instructions and confirm the card appears in Wallet.
5. Test the QR code with another person, optionally save a Popl profile link, and download setup notes.

The guide does not create Popl accounts, populate Popl fields automatically, issue signed Wallet passes, or detect app installation or Wallet contents. Those actions take place in Popl; completion reflects the rep's explicit confirmations. No Popl API credentials are required. The optional website field should be each rep's own contact page, not Matthew's page.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Upload the contents of `dist/` to a static HTTPS host. The build uses relative asset paths and can be hosted at a separate domain or a subdirectory. Guest mode needs only static hosting. Google sign-in requires the separate account server described below. Generated builds are excluded from Git; run `npm run build` to produce `dist/`.

## Privacy

Guests keep details and progress in sessionStorage in their current tab. Signed-in reps save their profile, optional compressed preview photo, and progress to a private server-side SQLite record keyed to their verified Google identity. Drafts are cached per account on the device for retries. Signing in never automatically imports guest details. Import guest setup is an explicit action. Popl credentials are never requested or stored, and the profile is not automatically submitted to Popl. External fonts load from Google Fonts. Downloaded setup notes contain contact information and should be kept private.

## Google sign-in

Use Node.js 22.13+ for the account server (`node:sqlite` is required).

```sh
npm ci --prefix server
npm test --prefix server
GOOGLE_CREDENTIALS=/secure/path/google-oauth.json npm start --prefix server
```

Configure a Google OAuth **Web application** client with origin `https://rep.mattjhagen.xyz` and redirect URI `https://rep.mattjhagen.xyz/auth/google/callback`. Rep Launch uses a separate Google client; PitchPilot credentials are not modified. Google client JSON belongs outside the repository, readable only by the service user. In Google's Testing mode, add the intended reps as test users.

The server defaults to `127.0.0.1:3023`, with a distinct Rep Launch database. Proxy `/auth/` and `/api/` to that loopback address; disable access logging for OAuth callback routes. All other paths serve `dist/`. Auth uses the authorization-code flow with PKCE, one-use state, nonce verification, validated Google ID tokens, host-only Secure/HttpOnly cookies, and CSRF protection. Every profile read/write is scoped by the server to the signed-in account, and version checks reject stale cross-device writes. Profile and auth responses use `Cache-Control: no-store`.

`deploy/rep-launch-accounts.service` documents the R510 service layout. `deploy/activate-accounts.sh` is specific to the inspected existing R510 deployment and stops if its expected release/configuration has changed. It installs the already-validated staging build, enables the new service, and reloads Nginx without restarting the tunnel or Pitch Coach. It retains a rollback copy of the existing configuration and release pointer.


## Verified

- Production build and JavaScript syntax checks pass.
- Browser walkthrough reaches completion with sample rep details.
- Required confirmations prevent skipping setup.
- Invalid short phone number is rejected.
- Refresh preserves details and step.
- Android selection points to Popl's official download page.
- Phone layout inspected at 390px width.
- Google-flow, account isolation, stale-version conflicts, CSRF rejection, and logout tests pass.
- No real Popl account, app installation, or Wallet pass was created during testing.

## Official references

- https://apps.apple.com/us/app/popl-ai-lead-capture/id1503939262
- https://support.popl.co/en/articles/9289575-edit-your-digital-card
- https://support.popl.co/en/articles/8887265-add-your-qr-code-to-your-apple-or-google-wallet
- https://support.popl.co/en/articles/8737311-share-your-digital-business-card

Popl can change its app interface; the guide links to its live help articles. This is an independent setup guide, not an official T-Mobile or Popl product.
