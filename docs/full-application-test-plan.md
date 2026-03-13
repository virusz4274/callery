# Full Application Test Plan

This document is the manual QA handoff for testing the full Call Memo application end to end.

It is written for a tester who did not build the app and needs a clear, repeatable process.

## Recommended Test Environment

Use a production-like staging deployment for external testers.

Preferred:

- Docker image or deployment that runs the production app
- `npm run build` followed by `npm start`
- Test-only infrastructure and secrets
- Public staging URL on a separate server

Do not use `npm run dev` for external tester handoff unless a developer is actively debugging with them.

Why production/staging is better than `npm run dev`:

- `npm run dev` includes hot reload, development overlays, slower behavior, and dev-only logging
- development mode can hide or create issues that do not match production behavior
- a tester should validate the app as close to the real deployed runtime as possible
- Stripe, uploads, cookies, redirects, and cross-origin behavior are more trustworthy in a production-like environment

## Environment Recommendation

For tester handoff, use:

1. A staging URL hosted on your other server
2. The same runtime shape as production
3. Non-production credentials and integrations
4. Test Stripe keys and test webhooks
5. A real R2 bucket with the correct staging CORS policy
6. A real MongoDB database dedicated to staging/testing
7. A real Firebase project for staging/testing

## Before Testing Starts

Confirm all of the following before handing the environment to a tester:

- the app loads without build errors
- `npm run build` succeeds
- the staging environment is reachable over HTTPS if possible
- Firebase auth is connected to the staging app
- MongoDB points to staging, not production
- Stripe is in test mode
- R2 uploads work from the staging origin
- webhook endpoints are reachable if webhook-driven behavior is being tested
- no production secrets are exposed in client code or checked into git

## Quick Technical Readiness Checklist

- `NEXT_PUBLIC_ENABLE_BILLING` is set correctly
- Firebase web config points to staging project
- server Firebase admin credentials point to staging
- `STRIPE_SECRET_KEY` is a Stripe test key
- `STRIPE_WEBHOOK_SECRET` matches the active staging/test webhook listener
- `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` are valid
- R2 CORS allows the staging origin and at minimum `PUT`, `GET`, and `HEAD`
- SMTP settings are valid if support email delivery is expected
- Soniox, ElevenLabs, and Gemini keys are valid if those flows are enabled
- system settings allow signups if new-account testing is required

## Test Accounts To Prepare

Prepare these before handoff:

- one brand-new test user account
- one returning non-admin user account
- one admin account
- one billing-enabled user with an existing Stripe customer
- one user with no Stripe customer yet
- one user near usage limits if limit enforcement is being tested

### Dedicated Staging Tester Account

Use this account for general staged QA unless a scenario requires a brand-new user:

- email: `qa.tester.20260313@example.com`
- password: `TestPass123!`
- role: non-admin
- intended use: general authenticated testing on staging/test environments only

Do not reuse this account for production.

If possible, keep a simple credential sheet for the tester with:

- account label
- email
- password
- role
- notes on current billing state

Do not use production accounts.

## Test Data To Prepare

Prepare these files:

- one valid small audio file under 1 minute
- one valid medium audio file with speech
- one duplicate copy of an existing audio file
- one unsupported or invalid file for negative-path testing
- one file large enough to meaningfully exercise upload progress if desired

Prepare these data situations:

- at least one contact-rich recording
- at least one recording without transcript
- at least one completed transcription
- at least one shared recording or share token if sharing is enabled

## Test Scope

This plan covers:

- public pages
- account creation and login
- authenticated navigation
- recordings
- contacts
- file browser
- uploads
- settings
- support
- billing and Stripe flows
- admin features
- webhook-dependent outcomes where observable
- negative-path and regression checks

## Out Of Scope Unless Explicitly Requested

- load testing
- security penetration testing
- accessibility audit beyond basic keyboard/screen checks
- native Android packaging validation beyond the hosted web app unless a device build is provided

## Severity Definitions

- `P0`: data loss, security issue, auth bypass, billing corruption, or complete outage
- `P1`: major feature broken, uploads fail, checkout broken, login broken, or admin controls unusable
- `P2`: partial feature break, incorrect UI state, bad validation, misleading messaging
- `P3`: cosmetic, content, layout, copy, or low-impact annoyance

## How To Report Bugs

Each bug report should include:

- title
- environment URL
- account used
- exact page/route
- exact steps to reproduce
- expected result
- actual result
- screenshot or screen recording
- browser and device
- timestamp with timezone
- severity guess

Suggested bug title format:

`[Area] Short description`

Example:

`[Upload] Presigned R2 upload fails with CORS error on staging`

## Test Session Order

Run the test pass in this order:

1. Public pages and general health
2. Signup and login flows
3. Core authenticated navigation
4. Upload and recording creation
5. Search, filtering, and details
6. Contacts and file browser
7. Settings and support
8. Billing and Stripe
9. Admin
10. Regression pass across the most critical flows

## 1. Public Pages And Health

Verify these routes load and look correct:

- `/`
- `/pricing`
- `/support`
- `/privacy-policy`
- `/terms-of-service`
- `/changelog`
- `/login`
- `/signup`
- `/forgot-password`
- `/reset-password`

Checks:

- page loads without visible error boundary
- no blank screen
- no broken layout on desktop
- no obvious broken layout on mobile width
- navigation links work
- primary CTA buttons work
- no development overlay or stack trace is visible
- browser console has no obvious runtime errors

## 2. Signup Flow

Use a brand-new email.

Steps:

1. Open `/signup`
2. Create a new account with email/password
3. Verify redirect to the authenticated area
4. Confirm the user lands in recordings or the expected first authenticated page
5. Confirm no infinite spinner
6. Confirm the user profile is created in the backend

Checks:

- password mismatch validation works
- duplicate email is handled gracefully
- successful signup creates usable session
- logout and login with the same account works afterward

## 3. Login And Logout

Use an existing non-admin account.

Steps:

1. Open `/login`
2. Sign in with email/password
3. Verify redirect to authenticated app
4. Navigate away and refresh
5. Confirm session remains valid
6. Log out
7. Confirm protected pages redirect or block access appropriately

Checks:

- incorrect password shows error
- valid login creates server-backed session
- logout clears session

## 4. Authenticated Navigation

Verify these routes as a signed-in user:

- `/recordings`
- `/contacts`
- `/files`
- `/upload`
- `/settings`
- `/settings?tab=billing`
- `/android-sync`

Checks:

- each page loads without runtime error
- top-level navigation works
- no dead links
- protected routes are not accessible while signed out

## 5. Recordings Workspace

Checks:

- recordings list loads
- count metrics look sane
- sorting works
- text search works
- date filters work
- contact filter works if contacts exist
- saved views behave correctly if enabled
- opening a recording details dialog works
- playback loads if the file is valid
- transcript state is shown correctly
- actions menu works
- delete confirmation is correct and safe

Negative-path checks:

- empty state is clear
- deleted recording disappears from list
- invalid share or missing recording does not crash the UI

## 6. Upload Flow

This is one of the highest-priority flows.

Use both a valid audio file and a duplicate file.

Steps:

1. Open `/upload`
2. Add one valid file
3. Confirm it appears in the queue
4. Upload it
5. Confirm it becomes `Uploaded`
6. Go to `/recordings`
7. Confirm the new recording appears
8. Add the same file again
9. Confirm duplicate handling is clear

Checks:

- upload queue renders correctly
- upload button state is correct
- failed uploads show useful message
- duplicate detection works
- uploaded file appears in recordings
- no CORS or storage errors appear in the browser console

Negative-path checks:

- invalid/unsupported file is handled gracefully
- retry flow works for failed upload
- clearing queue works

## 7. Recording Detail And Transcription

Use a valid speech recording.

Steps:

1. Open a recording detail view
2. Confirm metadata looks correct
3. Start transcription if available
4. Wait for completion or use webhook-driven completion path
5. Refresh or revisit the recording
6. Confirm transcription status updates correctly

Checks:

- transcription can be started
- status transitions are sensible
- transcript appears when complete
- no duplicate transcription starts
- failure state is visible and understandable

If AI summaries, semantic search, or analysis features are enabled:

- verify they run on a completed transcript
- verify loading and error states

## 8. Contacts

Checks:

- contacts page loads
- contact list renders correctly
- empty state is clear
- clicking a contact opens detail page
- recordings linked to contact are visible
- contact actions work
- any contact sync flow is tested if enabled

Negative-path checks:

- missing contact ID shows a safe fallback
- deleting or editing a contact updates the UI correctly

## 9. File Browser

Checks:

- file browser loads
- breadcrumbs work
- folder navigation works
- empty folder state is clean
- file actions work
- deleting from file browser behaves correctly
- no console warnings or runtime issues appear

## 10. Settings

Test all visible tabs:

- overview
- profile
- general
- data
- notifications
- billing

Checks:

- each tab loads without crashing
- tab navigation works
- values shown match current user state
- save actions persist correctly
- toggles produce correct success/error feedback

## 11. Support

Steps:

1. Open `/support`
2. Fill out the form
3. Submit it
4. Confirm success message
5. Confirm support message is stored or delivered as expected

Checks:

- validation works
- success message appears
- no duplicate submit on rapid clicking
- SMTP-backed delivery works if configured

## 12. Billing And Stripe

Use Stripe test mode only.

### Billing UI

Checks:

- billing tab loads
- current plan is correct
- invoices list loads
- billing portal button works
- upgrade plan button works

### Checkout

Steps:

1. Start from pricing page or billing settings
2. Begin checkout for a paid plan
3. Confirm redirect to Stripe Checkout
4. Complete payment with a Stripe test card
5. Confirm redirect back to app
6. Confirm user billing state updates
7. Confirm invoice history reflects the payment

Checks:

- checkout starts successfully
- no duplicate subscription creation
- one-time and subscription flows behave as intended
- success and cancel URLs behave correctly

### Customer Portal

Checks:

- portal session opens
- tester can view payment methods, invoices, and subscription controls
- return URL brings them back to app safely

### Webhooks

Observe or verify:

- checkout completion updates the app user
- failed payment states surface correctly
- canceled subscription sync behaves correctly
- customer deletion removes billing linkage

## 13. Admin

Use an admin account.

Verify:

- `/admin`
- `/admin/users`
- `/admin/users/[id]`
- `/admin/plans`
- `/admin/settings`
- `/admin/audit`
- `/admin/announcements`

Checks:

- non-admin cannot access admin pages
- admin dashboard loads
- users list loads
- plan configuration pages work
- announcements work if enabled
- audit data is visible
- billing-related admin pages do not break

## 14. Access Limits And Billing Rules

If available, test a user near or beyond limits.

Checks:

- storage limits are enforced correctly
- transcription limits are enforced correctly
- overage opt-in toggle behaves correctly
- blocked actions show correct messaging

## 15. Error Handling And Regression Checks

Try these sanity checks:

- refresh the page mid-flow
- use browser back/forward after login and after checkout return
- attempt protected routes while signed out
- attempt invalid URLs
- open app in mobile-width viewport
- repeat the same action twice quickly where safe

Confirm:

- no duplicate records are created
- no obvious race-condition errors
- no broken loading spinners
- no stuck modal state

## 16. Basic Browser Coverage

If time permits, at least test:

- latest Chrome
- latest Safari

Optional:

- Firefox
- mobile browser on iPhone or Android

## 17. Production-Like Validation Notes

If the tester is using the staging server:

- test with the exact staging domain that is whitelisted for R2 CORS
- test billing only with Stripe test mode
- test webhooks against staging endpoints
- do not use `localhost` assumptions when validating cross-origin behavior

## 18. Known High-Risk Areas

Pay special attention to:

- Firebase auth and session persistence
- direct R2 upload flow
- Stripe checkout and webhook sync
- transcription provider integration
- admin plan/billing management
- cross-origin behavior in hosted environments

## 19. Suggested Exit Criteria

The app is ready for final release consideration when:

- no `P0` or `P1` issues remain
- signup, login, upload, recordings, support, and billing core flows all pass
- Stripe test purchase succeeds end to end
- valid audio transcription succeeds end to end
- admin pages are usable
- staging environment behaves like expected production runtime

## 20. Useful Commands For Internal Team

Developer-side checks before or during QA:

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Local webhook forwarding if needed:

```bash
stripe listen --forward-to localhost:9000/api/stripe/webhook
```

## Final Recommendation

For handing the app to a tester:

- use a hosted staging environment
- use the production runtime shape
- use `npm start` or your Docker production setup
- do not use `npm run dev` unless the goal is active developer debugging

That is the correct choice for meaningful external QA.
