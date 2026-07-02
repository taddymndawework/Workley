# Workley - Security Model

This document records the security controls in place and the checklist to keep them intact as the platform grows. Report vulnerabilities to hello@workley.co.za (see /.well-known/security.txt).

## Threat model (summary)

Workley is a static front end (Firebase Hosting) talking directly to Firebase Auth, Firestore and Storage. There is no trusted app server, so **the security boundary is the Firebase security rules plus Auth**. Anything the browser can do, an attacker can script - the client is untrusted by design.

## Controls in place

### 1. Transport & browser hardening (firebase.json headers)
- **Content-Security-Policy** - allowlists only: self, www.gstatic.com / www.google.com / apis.google.com (Firebase SDK + reCAPTCHA), fonts.googleapis.com / fonts.gstatic.com, Google APIs for connect, the Firebase auth iframe domain, and blocks everything else. `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`. Note: `script-src 'unsafe-inline'` is currently required because the UI uses inline event handlers; removing it needs the modularization step in ARCHITECTURE.md.
- **HSTS** (1 year, includeSubDomains), **X-Content-Type-Options: nosniff**, **X-Frame-Options: DENY** (clickjacking), **Referrer-Policy: strict-origin-when-cross-origin**, **Permissions-Policy** (camera/mic/geo/payment/usb denied), **Cross-Origin-Opener-Policy: same-origin-allow-popups** (keeps Google sign-in popups working while isolating the window).

### 2. Authentication
- Email verification gate (`verified()` in rules) on every meaningful read/write.
- Mandatory SMS 2FA (Firebase phone MFA) at signup and login; invisible reCAPTCHA - the token is never hardcoded.
- Google sign-in via the native Firebase popup; no OAuth secrets in the client (client-side web config is public by design; server credentials live only in functions/.env, never in the repo).
- Account deletion requires recent re-authentication; a Cloud Function (`onUserDeleted`) cleans up the user's data.

### 3. Authorization (firestore.rules / storage.rules)
- Default deny; every collection has an explicit rule with schema validation (`hasOnly` key allowlists, string length caps, enum checks, `request.time` timestamps).
- Server-enforced invariants, not just UI:
  - Chat: only participants read/write; message edit window (60s) and soft-delete enforced by rules; attachments capped at 10 MB.
  - Contract signing: the client can never write the talent's signature; the talent can only become `onboarded` by counter-signing after the client has signed; the owner cannot force `onboarded`.
  - Reviews, profile views, proposals, jobs: creator-locked, immutable where appropriate, meeting links must be https (blocks `javascript:` URLs).
- Collection-group reads gate on the queried FIELD (rules-are-not-filters rule of thumb; see the gotcha in the project memory).
- Storage: per-path owner-locked writes, size and content-type caps, custom metadata banned; global deny fallback.

### 4. Content & XSS
- All user data is HTML-escaped via `esc()` / `_esc()` before insertion into templates. Any new template MUST escape interpolated user data.
- Uploaded files get a Content-Disposition header: original filename preserved, but only raster images render inline - SVG and everything else is forced to download (SVG can carry scripts).
- URLs stored in Firestore (meeting links, file URLs) are validated as https by rules.

### 5. Data protection (POPIA)
- See privacy.html. Contact PII is separated from public profiles (owner-only subcollection). No secrets or PII in hosting-deployed files; deploy ignore list blocks .env, service accounts, docs and notes.

## Checklist for every change
1. New collection or field? Write the rule FIRST (key allowlist + validation), then deploy `firebase deploy --only firestore:rules`.
2. New template string with user data? Escape every interpolation.
3. New external domain (script/API/frame)? Add it to the CSP in firebase.json deliberately - if something silently breaks after a deploy, check the browser console for CSP violations first.
4. New file in the project root? Confirm it is either meant to be public or covered by the hosting ignore list.
5. Never commit or deploy: .env, serviceAccount*.json, API server keys. Client web config is fine.
