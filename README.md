# Delulu — Waitlist Website (standalone)

A pre-launch marketing site for Delulu that doubles as an **early registration
portal for the main application**. Anyone who signs up here becomes a real,
fully-functional account in the main app's own user database — when the app
launches they only need to log in with the same email and password.

**This remains a separate project from `dating-app` (the main application).**
It has its own `package.json`, its own server, its own frontend, and its own
deployment. The main app's server/frontend are never imported or required by
this project.

## What's actually shared with the main app

- **The same Firestore database and the same `users` collection.** There is
  no separate `waitlist` user collection. `database.js` in this project is
  the same user-schema/user-creation logic the main app uses (same fields,
  same auto-incrementing id counter, same password hashing via bcrypt), so a
  registration here is indistinguishable from one made in the main app.
- Both processes authenticate to Firebase the same way: `FIREBASE_PROJECT_ID`,
  `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` env vars pointing at the
  same service account. Use the same values in both `.env` files.
- Both send email the same way, via the Brevo HTTP API (`BREVO_API_KEY`).
- The only *waitlist-only* collection is `waitlist_otps` — transient,
  one doc per email, holding the current verification code. No account or
  personal data lives there; it's deleted from relevance once verified.

## Registration flow

1. **College email verification** — only pre-approved university domains are
   accepted (same allow-list rule as the main app's signup), and an email
   that's already a registered user is rejected with a "you already have an
   account" message rather than allowing a duplicate sign-up.
2. **Email verification link** — same pattern as the main app's own signup:
   a one-time link is emailed via Brevo (not a typed code) and must be
   clicked within 15 minutes. Clicking it opens this site again with
   `?token=...&email=...`, which is auto-verified on load.
3. **Account creation form** — name + password. On submit, a real user
   document is created directly in the shared `users` collection (the exact
   same collection/schema/id-counter the main app reads and writes), with
   the password hashed via bcrypt exactly as the main app's own registration
   does. The account is marked `is_onboarded: 0` since gender/avatar/bio/
   username haven't been chosen yet — the main app's *existing*
   `/api/auth/complete-profile` step (unchanged UI) picks up from there the
   first time the person logs in after launch, so they never register twice.

After a successful join, the page stays put and shows:
- "You are officially on the waitlist."
- `<N> Students Registered` — always computed live as `126 + a live Firestore
  count of users whose account originated on this site`, never hardcoded, so
  it starts at 126 with zero waitlist sign-ups and increases by exactly 1 per
  new registration.
- "The app will be launching soon."

## Setup

```bash
cd delulu-waitlist
npm install
cp .env.example .env
# Fill in .env with the SAME Firebase + Brevo values as the main app's .env
npm start
```

The site runs on `PORT` (default `4000`), completely separate from the main
app's port. You can run both apps side by side locally, or deploy this one
on its own domain/host (e.g. Vercel, Render, Netlify functions, etc.) ahead
of the main app's launch.

## API (used only by this site's own frontend)

- `POST /api/waitlist/send-verification-email` `{ email }`
- `POST /api/waitlist/verify-token` `{ token, email }`
- `POST /api/waitlist/register` `{ email, name, password }`
- `GET  /api/waitlist/count` → `{ count }`

## Main application changes required for this to work

Two small, additive changes were made to `dating-app/server.js` and
`dating-app/database.js` so a waitlist account can be *finished* on first
login instead of being rejected as a duplicate or silently logged in with a
half-empty profile:

- `POST /api/auth/verify-token` now treats an existing-but-incomplete
  account (`is_onboarded === 0`) the same as a brand-new user, so the
  existing profile-completion screen in `login.html` is shown.
- `POST /api/auth/complete-profile` now *updates* an existing incomplete
  account in place (same id, same created_at) instead of only ever
  creating a new one, and still rejects true duplicates (an email that is
  already fully onboarded).

No UI, routing, or existing behavior for already-onboarded users changed.

## Security note

Do not commit `.env` or any real service-account key to source control.
Rotate any credentials that may have been exposed outside your own systems.
