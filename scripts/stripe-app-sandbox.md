# Real application payment diagnostic

This opt-in script exercises the deployed application and the real Stripe
sandbox. It does not load deployment environment files and never creates
launch-acceptance evidence. Ordinary test runs must not invoke it.

Before running, configure the authorized public app for managed sandbox billing,
publish its reviewed sandbox catalog, and securely supply these process-only
values:

- `VOSIFT_TEST_APP_URL=https://vosift.coarde.com`
- `VOSIFT_TEST_MONGODB_URI`: the explicit app database connection, including its database name
- `VOSIFT_TEST_STRIPE_SECRET_KEY`: the matching sandbox `sk_test_` key
- `VOSIFT_TEST_STRIPE_ACCOUNT_ID`: the expected `acct_` account
- `VOSIFT_TEST_BILLING_CATALOG_ID`: the exact published sandbox bundle
- `VOSIFT_TEST_STRIPE_WEBHOOK_SECRET`: the payment endpoint's sandbox signing
  secret, needed for duplicate-event tests and optional scoped recovery

Use host Node 24.22.0 and the installed repository dependencies:

```bash
node scripts/stripe-app-sandbox.mjs run --state /tmp/vosift-owned-payment-run.json
# Create only a paid Standard checkpoint for a separately controlled test:
node scripts/stripe-app-sandbox.mjs run --state /tmp/vosift-owned-standard-run.json --stop-after-standard
# Opt in to Stripe's documented 3220 card and normal test-issuer approval:
node scripts/stripe-app-sandbox.mjs run --state /tmp/vosift-owned-payment-run.json --lifetime-3ds
# Resume the same owned run after a transient failure or manual payment:
node scripts/stripe-app-sandbox.mjs run --state /tmp/vosift-owned-payment-run.json
```

The state file contains disposable account credentials and payment URLs and is
written with mode `0600`. Do not paste or commit it. The adjacent
`.evidence.json` omits those credentials and URLs and records only completed
checks and object IDs. Never relabel that partial diagnostic as complete live
acceptance.

The harness creates one owned verified authentication fixture directly in
MongoDB, then signs in through the real public API. It sends no signup emails;
email verification is outside this diagnostic. It exercises authentication and
origin rejection, invalid webhook signatures, hosted Standard Checkout, a USD 5
top-up, duplicate signed real events, a declined upgrade payment while Standard
stays usable, and immediate paid Pro and Lifetime conversion. It validates real
Stripe invoices, subscription items, app entitlements, prepaid grant and wallet
funding. Only this run's actual Stripe events can be signed and replayed, and
the evidence distinguishes automatic Stripe delivery from scoped replay.
`--stop-after-standard` stops before top-up and upgrades, records a partial
checkpoint, and does not mark the run finished.

Stripe-hosted pages can reject automated browsers. The script uses ordinary
Playwright fields and documented test cards, never a challenge bypass. If a
page needs human completion, inspect the private state locally, complete only
that owned sandbox payment, and resume. `--headed` is available on a host with
a graphical display. `--lifetime-3ds` records bank verification separately from
paid conversion: it requires both an observed ordinary Stripe test-issuer
challenge and an authoritative authenticated challenge result on the charge.
Unobserved or frictionless authentication does not count as that proof.
Renewal/usage invoice settlement, meter errors, refunds, erasure, price rollovers
and measured cost/funding controls still require their separate acceptance
cases. Profitability reports support operator pricing decisions; no profit
percentage is required for publication or live-launch acceptance.

After reviewing the results, explicitly clean up this run:

```bash
node scripts/stripe-app-sandbox.mjs cleanup --state /tmp/vosift-owned-payment-run.json
```

Cleanup verifies exact run/customer/profile ownership, disables that profile,
cancels only its subscriptions, removes or voids its unpaid invoices, expires its
grants, and removes its customer and owned authentication credentials. It keeps
the disabled app profile and financial journals for reconciliation. It never
runs broad cron, resets a database, edits environment files or restarts a server.
