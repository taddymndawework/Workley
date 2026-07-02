# Workley - Architecture & Scalability Guide

How the project is organized today, the conventions that keep it maintainable, and the roadmap for scaling the codebase without a rewrite.

## Current structure

```
ispani_site/                  (folder name is historic - do NOT rename; Firebase project id is "ispani-site")
├── index.html                Landing (marketing + auth modals mount here)
├── catalog.html              Talent catalog
├── dashboard.html            Role-aware dashboard (client + talent share one shell)
├── onboarding.html           Post-signup profile setup wizard (self-contained page)
├── profile.html, smart-match.html, how-it-works.html, mission.html
├── terms.html, privacy.html, refund.html, service-agreement.html   Legal (static, indexable)
├── verify-email.html, reset-password.html, oauth-callback.html     Auth utility pages
├── js/
│   ├── app.js                Global site logic: auth flows, modals, catalog, profile (classic script, globals)
│   ├── dashboard.js          Dashboard IIFE: nav/views, projects, chat, meetings, notifications
│   └── firebase-config.js    THE data layer (ES module): exposes window.firebaseAuth / firebaseDB / firebaseStorage
├── css/styles.css            Single stylesheet, section-commented
├── assets/                   Images, logos, favicons
├── functions/                Cloud Functions (Node 22): onUserDeleted cleanup; server secrets live here (.env)
├── firestore.rules           THE security boundary - deploy on every data-model change
├── storage.rules             Storage security (avatars, portfolio, chat files)
├── firestore.indexes.json    Managed indexes (collection-group members.studentUid lives here)
├── firebase.json             Hosting config: ignore list, rewrites, cache + SECURITY HEADERS (CSP etc.)
├── SECURITY.md               Security model + change checklist
└── robots.txt, sitemap.xml, .well-known/security.txt
```

## Design rules that keep this scalable

1. **One data layer.** All Firebase access goes through `js/firebase-config.js` (`window.firebaseDB` / `firebaseStorage` / `firebaseAuth`). UI code never imports Firebase directly. Adding a backend feature = add a function there + a matching security rule.
2. **Rules mirror the data model.** Every collection/field addition ships with a firestore.rules change in the same deploy (`firebase deploy --only hosting,firestore:rules`). Rules validate schema (key allowlists, lengths, enums, server timestamps) - the client is untrusted.
3. **Caches are nullable.** UI state caches (`TALENT`, `CONVOS`, `PROJECTS`, `MY_INVITES`, ...) use `null` = not loaded, `[]` = loaded-empty, and `ensureX(cb)` loaders that only call back on fresh loads (prevents repaint loops).
4. **Escape everything.** `esc()` / `_esc()` around every user-data interpolation in template strings.
5. **Events for cross-file sync.** `document` events (`workley:talentLoaded`, `workley:jobsChanged`, `workley:profileChanged`) decouple app.js and dashboard.js.
6. **Deploy hygiene.** The firebase.json ignore list is a denylist for anything internal (docs, notes, rules files, .env). New internal files must be added there.

## Scaling roadmap (in order, each step is independently shippable)

1. **Version control.** Run `git init` (a .gitignore is already in place), commit, and push to a private GitHub repo. Everything below assumes this.
2. **Staging project.** Create a second Firebase project (workley-staging), add it to .firebaserc as a target, and deploy there first: `firebase use staging && firebase deploy`. Test auth + rules against real infrastructure before production.
3. **Rules tests.** Add `@firebase/rules-unit-testing` + the emulator suite (`firebase emulators:start`) and encode the security invariants (contract signing, chat membership, payment gating) as unit tests. This is the highest-value automation available to this stack.
4. **Modularize js/app.js and js/dashboard.js.** Both are large single files. Split by feature into ES modules (auth/, chat/, projects/, catalog/, legal/) behind a build step (Vite is the natural fit - zero-config, outputs static files Firebase Hosting serves as-is). Replace inline `onclick="..."` handlers with `addEventListener` during the move - that is also what allows dropping `'unsafe-inline'` from the CSP.
5. **Pagination.** Catalog (`listTalent`), conversations and messages currently use capped queries (60/50/500). When usage grows, switch to cursor pagination (`startAfter`) in firebase-config.js - the rules already cap list sizes.
6. **Cloud Functions for privileged logic.** Anything that must not trust the client (payment reconciliation, Home Affairs verification callbacks, contract PDFs, moderation) belongs in `functions/` - never in the browser. Secrets stay in functions/.env / Secret Manager.
7. **Monitoring.** Enable Firebase App Check (blocks non-app traffic to Firestore/Storage), budget alerts, and Crashlytics/Analytics equivalents for web as volume grows.

## Conventions

- Plain hyphens in copy (no em dashes). South African English in user-facing text.
- The Firebase project id (`ispani-site`) and this folder's name stay as-is; the brand is Workley and the domain is workley.co.za.
- No client-side redirect from *.web.app to the custom domain beyond the existing hostname check in each page head.
