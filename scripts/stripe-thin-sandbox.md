# Real thin meter-error diagnostic

Run `node scripts/stripe-thin-sandbox.mjs` only after securely supplying explicit
`VOSIFT_TEST_STRIPE_SECRET_KEY=sk_test_…` and `VOSIFT_TEST_MONGODB_URI` process
values. `VOSIFT_TEST_STRIPE_SETUP_PATH` defaults to the private approved setup
manifest at `/tmp/vosift-stripe-sandbox-setup.json`. The script never loads or
edits deployment environment files.

It verifies the sandbox account and existing thin destination, then creates one
new owned meter/customer. Unique error-sample identifiers are checked absent
from application usage rows. The public Stripe CLI fixture strategy—creating a
v2 meter session and streaming malformed events—generates actual Stripe
`v1.billing.meter.error_report_triggered` and `v1.billing.meter.no_meter_found`
events in the tested sandbox. The script never changes to live credentials if
another sandbox rejects this API. Synchronous v1 errors alone are not thin-event
proof.

The diagnostic fetches authoritative events, checks the public handler's
`stripe_meter_notifications` records and reports automatic delivery separately
from an explicitly signed retry. Unmatched samples must reject/quarantine zero
application usage rows. A separately labeled ping verifies only routing and
signature handling. Both real recognized branches are required for
`recognizedBranchesVerified: true`; the entire result remains partial launch
acceptance.

Private JSON evidence is written with mode `0600` under `/tmp`. To retry only the
exact real reports identified by an existing owned evidence file:

```bash
node scripts/stripe-thin-sandbox.mjs replay /tmp/vosift-thin-sandbox-RUN-ID.json
```

This reuses the existing authoritative reports and checks successful processing,
duplicate idempotency and unsigned rejection. It does not fabricate events,
usage receipts, settlement evidence or processed markers.

The initial run deactivates only its own newly created meter and deletes only
its own newly created customer. It never changes app-owned customer fixtures,
published prices, application usage rows, existing users or broad cron state.
Stripe CLI installation is unnecessary.
