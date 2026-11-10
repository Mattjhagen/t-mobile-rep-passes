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

Upload the contents of `dist/` to a static HTTPS host. The build uses relative asset paths and can be hosted at a separate domain or a subdirectory. No application server or database is required. Generated builds are excluded from Git; run `npm run build` to produce `dist/`.

## Privacy

Contact details, optional compressed photo, and progress stay in sessionStorage in the current browser tab. No forms submit to a backend or to Popl. Refreshing resumes progress. Browser session restoration can preserve tab storage, so use Clear session data on a shared device. External fonts are loaded from Google Fonts. App store/help links open official external services only when selected. Contact details are not included in those URLs. Setup-note downloads contain personal contact information and should be kept private. A shared team progress dashboard would require a separate authenticated backend.

## Verified

- Production build and JavaScript syntax checks pass.
- Browser walkthrough reaches completion with sample rep details.
- Required confirmations prevent skipping setup.
- Invalid short phone number is rejected.
- Refresh preserves details and step.
- Android selection points to Popl's official download page.
- Phone layout inspected at 390px width.
- No real Popl account, app installation, or Wallet pass was created during testing.

## Official references

- https://apps.apple.com/us/app/popl-ai-lead-capture/id1503939262
- https://support.popl.co/en/articles/9289575-edit-your-digital-card
- https://support.popl.co/en/articles/8887265-add-your-qr-code-to-your-apple-or-google-wallet
- https://support.popl.co/en/articles/8737311-share-your-digital-business-card

Popl can change its app interface; the guide links to its live help articles. This is an independent setup guide, not an official T-Mobile or Popl product.
