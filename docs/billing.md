# Managed billing

Managed billing serves individual accounts. Organizations remain self-hosted. Billing-disabled self-hosted deployments require no Stripe credentials. Preserve saved deployment configuration and running services; use disposable databases/storage and process-only overrides for acceptance tests.

## Customer prices and usage

The app measures usage, allocates included allowances, reserves prepaid retail credit and reports chargeable quantities. Stripe aggregates those quantities and applies its published Prices. Standard, Pro and Lifetime share the same accounting pipeline; Lifetime has a separate usage-price pair and permanent purchase proof.

The amounts and allowances below are [installation defaults](../src/lib/installation-defaults.ts), not proof of a deployed offer. Imported, published catalog snapshots determine the prices and allowances offered by an installation; initialization does not overwrite an existing catalog.

| Plan | Base purchase | Monthly included resources |
| --- | --- | --- |
| Standard | USD 10/month, collected in advance | 60 weighted minutes and 2 GiB |
| Pro | USD 20/month, collected in advance | 120 weighted minutes and 5 GiB |
| Lifetime | USD 250 once | None |

Lifetime has no monthly hosting minimum. All Lifetime usage and recurring overage require prepaid credit. Fully included processing requires entitlement, verified paid service and allowance, not a usage wallet or provider-expense reserve. An active subscription or draft renewal invoice alone cannot open a new included allowance. Annual paid service covers its monthly usage windows; if its base renewal falls inside a monthly usage window, new work pauses at the unpaid base expiry without resetting that usage window. Awaiting payment confirmation returns `billing_sync_pending`; accepted work can still finish and the pending state alone never starts media deletion. Published retail prices are business decisions: the application has no profit targets, provider-cost publication gates or monetary operator budgets.

Round verified audio duration up to 15 seconds, then apply the provider weight:

| Provider/model | Weight | Initial recurring price per actual minute | Maximum recording duration |
| --- | --- | --- | --- |
| Soniox `stt-async-v5` | 1× | USD 0.01 | 300 minutes |
| Gemini `gemini-3.5-transcribe` | 3× | USD 0.03 | 30 minutes |
| ElevenLabs `scribe_v2` | 5× | USD 0.05 | 600 minutes |

These are the approved managed models and weights in the [application catalog](../src/lib/stripe/catalog.ts); other models and OpenAI-compatible transcription are unavailable under managed billing. Every managed provider has a 2 GiB file limit. Self-hosted provider and multiplier settings follow their separate installation policy.

A minute of ElevenLabs audio consumes five weighted minutes, or 20 weighted 15-second blocks. Included units produce no chargeable meter event. Summary, transliteration and embedding are bundled; enrichment retries reuse the saved transcript and receipt. Only a separately requested new transcription creates new audio usage.

Recurring plans retain the positive-overage recording minimum, derived from the published Price in integer blocks. Initially it is four blocks, exactly one cent. Minimum blocks never consume additional allowance. Lifetime has no recording minimum.

Storage is the monthly peak above allowance, measured in milliGiB (GiB = 2^30 bytes). Deletion does not reduce the period's chargeable peak. Renewal charges retained excess storage again. Initial recurring storage is USD 0.20/GiB. Conversion assigns only additional chargeable peak units to the new Price; it does not replay an already billed peak.

Free Trial is one-time: 10 weighted minutes, 100 MiB and one fixed 30-day expiry. Login, calendar boundaries, reassignment, cancellation and upgrades do not replenish it. There is no hidden per-user dollar cap or shared subsidy budget. Internal may be assigned by an administrator to any user, without granting administrative permissions: it is free and Stripe-independent, with unlimited cumulative transcription/AI and 1 TiB storage. Custom retains its assigned quotas, features and expiry. Actual debt, disputes, account restrictions and an already-owned purge remain separate from plan assignment.

## Set up and publish Stripe billing

1. Run `pnpm db:init --dry-run`, inspect structural conflicts, then run `pnpm db:init` to add missing templates and indexes. Initialization preserves existing settings, custom plans, Stripe mappings, users and financial history. It creates no paid ownership, wallet funds, grants or published catalog.
2. Configure the server-only Stripe secret key, separate payment/meter webhook signing secrets, a restricted portal configuration, working email, private storage, verified upload-size enforcement/lifecycle rules and authenticated reconciliation cron. Hosted Checkout/invoice/portal flows do not need a browser publishable key.
3. Create Standard/Pro licensed monthly base Prices, a one-time Lifetime base Price and the four usage meters/Prices below. Initial recurring Checkout uses explicit flexible billing, collects the base price, then adds monthly meters through durable post-payment setup. Processing requires confirmed payment and verified meters.
4. Import a complete catalog in the admin Plans area. Review authoritative amounts, units, provider weights, allowances and minimums. Structural validation checks Stripe account/mode, currency, intervals, raw ingestion, aggregation and exact immutable mappings. It does not require provider-cost policy, external cost contracts, profitability figures or expiring cost attestations.
5. Publish through the atomic active-version pointer. Draft edits and webhooks never publish automatically. Live mode additionally requires reviewed payment, metering, accounting, upload/storage, processing-limit and recovery acceptance for the exact account/catalog/Prices.

| Family | Event name | Aggregation | Unit |
| --- | --- | --- | --- |
| Recurring audio | `transcription_weighted_blocks_v2` | SUM | Integer weighted 15-second blocks |
| Recurring storage | `storage_peak_milligib_v2` | LAST | Integer cumulative chargeable milliGiB |
| Lifetime audio | `transcription_weighted_blocks_lifetime_v2` | SUM | Integer weighted 15-second blocks |
| Lifetime storage | `storage_peak_milligib_lifetime_v2` | LAST | Integer cumulative chargeable milliGiB |

Use customer key `stripe_customer_id`, value key `value`, no `event_time_window`, positive USD monthly per-unit Prices, and no free tiers or quantity transforms. Initial recurring rates are `0.25` cents/block and `0.02` cents/milliGiB. Choose Lifetime rates explicitly in Stripe; the app does not derive them from provider costs. Annual base offers retain twelve monthly allowance windows; publishing an annual offer remains an explicit business pricing decision.

Pricing pages, estimates, settings and quotes read the same published snapshots. Accepted work pins its original tariff. Historical snapshots remain resolvable after a Stripe Price is archived. Changing a Product's default Price does not update existing subscriptions.

## Prepaid credit and processing limits

Top-ups accept USD 5–1,000 per payment. Only authoritative payment confirmation creates a paid Stripe Billing Credit Grant and local wallet credit, exactly once. New grants use `scope.price_type = 'metered'` on dedicated app-owned customers. They cover recurring usage, Lifetime usage and replacement usage Prices, while excluding licensed base purchases and the Lifetime purchase. The app validates that those customers contain only approved application subscriptions. Taxes can still require separate payment. [Stripe credit grants](https://docs.stripe.com/api/billing/credit-grant/create)

Recurring customers must also enable **Pay per usage** in **Settings → Billing & Plans** before exceeding included allowances; adding wallet credit alone does not enable it. Free Trial cannot enable overage. Lifetime enables separately billed usage as part of setup and conversion; its usage billing is managed or canceled through the restricted portal rather than the recurring-plan overage switch.

Auto-top-up is off until the customer explicitly enables an amount, threshold and daily/monthly limits. Cancellation preserves unused credit for a future return and stops further automatic top-ups. Plan-change credits never create usage-wallet credit. Unspent prepaid deposits remain customer liabilities, not new usage revenue.

The atomic retail ledger subtracts reservations and earned, uninvoiced usage immediately. Concurrent recordings reserve included allowance in acceptance order and retain those assigned quantities on completion. A failed recording releases its reserved allowance for future jobs; it does not retroactively reprice another accepted recording. The allowance-consumed counter is separate from total processed weighted audio. Exact Stripe prices use BigInt decimal strings at 10^-12 cents; settled cash uses integer USD microdollars. Fractions accumulate per period and Price before invoice-line cent rounding. Temporary rounding holds are released idempotently; uploads and recordings are not individually rounded into extra charges.

New processing records an immutable execution policy: approved models, prompt versions, transcript revision, input/output envelopes and permitted attempts. It does not reserve provider expenses or processor fees from the customer's account. The app preserves full-transcript summaries with a 512-token final output, indexed transliteration with source timing/speaker metadata retained locally, and bounded embedding text.

Request size, duration, token, output, rate and concurrency limits still apply. Hidden SDK retries are disabled; each planned call permits one normal attempt and at most one additional attempt. Completed responses and checkpoints are saved together and reused after a crash. An uncertain submitted call requires reconciliation before another attempt. New enrichment-only continuation does not retranscribe audio or require historical cost-funding proof.

Search and exports have no expense-budget admission. Exports reuse immutable content revisions, permit at most one fresh full archive per account per 24 hours, expire seven days after completion and use 15-minute download URLs. An eligible failed archive can be resumed once through **Retry export**, preserving its original fresh-export window; see [exports](user-guide.md#exports). Uploads retain quota, staging-byte, session, rate and actual-size checks. Direct uploads require verified signed-length enforcement; other paths use bounded streaming. Sessions last 24 hours and signed upload links 15 minutes; ingestion cron expires and cleans abandoned sessions. Separately configure bucket lifecycle rules to expire `_staging/` objects and abort incomplete multipart uploads after 48 hours. The application and bundled bucket initializer do not install those provider-side rules.

The optional audited `processingPaused` setting defaults to false and pauses provider work manually. It is not a monetary limit. Provider configuration, provider quota, manual pause and insufficient customer credit have distinct remedies. Missing cost tables or expired legacy expense reviews do not block new processing, publication or checkout. No operational pause/configuration failure starts customer nonpayment recovery or media deletion.

Operational records retain provider/model, duration, tokens, attempts, failures, latency and storage bytes. Unknown provider charges remain unknown. Review costs and available alerts in provider dashboards; there is no in-app profitability report or replacement spending-cap engine. Prepayment prevents unpaid retail consumption; it does not establish profitable prices.

## Plan changes and scheduled price updates

Upgrades and recurring-to-Lifetime conversion take effect immediately after authoritative payment. The hosted adjustment invoice uses normal Stripe unused-time proration, discounts and taxes. There is no new provider-expense credit cap or retention adjustment; new quotes use `stripe-proration-v1` and `retainedCreditMinor: 0`. A paid hosted service line replaces, rather than duplicates, the obsolete native unused-service credit on a later switch.

The old paid plan remains usable during failed payment, abandoned Checkout or bank verification. After confirmed payment, fulfillment drains accepted accounting, verifies meter delivery and changes the target without a second proration. Preserve consumed allowance and the usage window. Payment races, duplicate-credit attempts, source-contract changes and erased accounts still require authoritative reconciliation. Older already-accepted operations retain their quoted terms; unaccepted stale quotes need refreshing.

Downgrades take effect at renewal without an immediate refund. Customers may cancel a scheduled downgrade. A successful upgrade cancels its pending downgrade while preserving applicable notified usage-price changes; failed upgrades leave the existing schedule intact.

For a routine price change:

1. Create replacement immutable Stripe Prices and import a complete draft; keep physical units and provider weights unchanged for ordinary repricing.
2. Review and publish. New customers use the published terms. Existing customers receive successful email and in-app notice before activation at the first monthly usage boundary at least 30 days later. Existing base contracts remain unchanged unless the customer requests a plan change.
3. The app's single owned Stripe Subscription Schedule combines renewal downgrades and noticed usage-price changes at each boundary. Stripe executes the phase; signed webhooks and reconciliation verify the authoritative items, prices, dates and customer identity.
4. Before opening a new usage period, adopt its plan, allowance and tariffs, then persist exactly one retained-storage baseline. Simultaneous downgrade/repricing uses the new allowance and rate together. Accepted callbacks retain their original period/tariff. [Stripe schedules](https://docs.stripe.com/billing/subscriptions/subscription-schedules)

New broad metered grants need no routine expiry/reissue or scope rollover for replacement Prices. Legacy exact-price grants and interrupted old transfers retain narrow recovery only. An unproved transition returns retryable `billing_sync_pending`; never discard, duplicate or silently re-create credit.

Existing public payment routes remain:

- `POST /api/stripe/checkout`
- `POST /api/stripe/plan-change/preview`, `POST /api/stripe/plan-change`, `GET /api/stripe/plan-change/:id` and `DELETE /api/stripe/plan-change`
- `POST`, `PATCH` and `GET /api/stripe/usage-topup`
- `GET /api/stripe/billing/status`
- `GET /api/stripe/invoices` and `POST /api/stripe/portal`
- `POST /api/stripe/lifetime/resume` to restore a Lifetime owner's usage billing

Plan-change responses expose `timing: immediate | period_end`, scheduled status and authoritative effective dates. Processing availability is separate from billing eligibility. The dedicated portal allows payment methods, invoices and period-end cancellation with `proration_behavior=none`; disable portal subscription/customer-detail updates so it cannot bypass app plan-change coordination.

## Recovery, webhooks and launch acceptance

Authoritative payment failure, terminal cancellation or verified insufficient retained-storage credit stops new chargeable work and starts the existing 30-day recovery window. An expired Free Trial also enters recovery, with the deadline measured from its fixed trial expiry. Warn on days 0, 23 and 29; permit reads and one cached recovery export. Recovery archives still follow export expiry and availability rules; if that archive becomes unavailable, individual recording downloads remain available until purge. Login/export never extend retention. Authoritative funding may restore service before purge. Lifetime ownership survives media deletion. Provider expenses, manual pauses and configuration failures never authorize deletion.

Account erasure removes personal content without waiting indefinitely for payment. Minimal financial tombstones retain late callbacks, usage, debt, disputes and idempotency. Settled financial records may be pruned after 90 days; unresolved operations remain retained. Preserve immutable old receipts and genuinely uncertain settlement. Known expense-only reviews are historical evidence, not new retail admission restrictions.

Register HTTPS `/api/stripe/webhook` with `STRIPE_WEBHOOK_SECRET`, and `/api/stripe/meter-webhook` with its separate `STRIPE_METER_WEBHOOK_SECRET` for signed asynchronous meter errors. Reconciliation checks prior/current subscription debt, missed payments, refunds/disputes, invoice voids and credit notes. An optional unpaid upgrade invoice is not debt for previously delivered service.

The payment endpoint accepts snapshot events; the separate meter endpoint accepts thin notifications for `v1.billing.meter.error_report_triggered` and `v1.billing.meter.no_meter_found`, then fetches their full events. Configure both destinations for the same Stripe account and mode. The payment handler's event families cover Checkout completion/failure/expiry, subscription lifecycle, invoice payment/finalization/voids, automatic top-up payment success, credit-grant updates, refunds/disputes, credit notes, customer deletion and catalog changes; use the event cases in the [handler](../src/app/api/stripe/webhook/route.ts) when configuring the destination. Unhandled event types have no event-specific fulfillment handler, so HTTP 200 alone does not prove that the required events are subscribed.

Configure 72-hour cycle-invoice finalization grace in Stripe; the application does not set this account policy automatically. Verify meter processing, raw quantities, frozen rates, invoice rounding and per-line grant debits; HTTP acceptance alone is insufficient. Retry identical immutable meter events only within their safe retry window. Older ambiguous or finalized-period events require review, never retimestamping or synthetic catch-up charges.

Schedule authenticated cron with `Authorization: Bearer <CRON_SECRET>`:

- `/api/cron/process-usage`: payments, schedules/rollouts, receipt repair, meter/invoice reconciliation, recovery and financial erasure settlement.
- `/api/cron/process-ingestion`: finalization recovery, staging expiry and multipart cleanup.
- `/api/cron/process-exports`: archive generation, recovery and expiry.
- `/api/cron/cleanup-recordings`: retention and requested erasure.

Alert on failed webhooks, delayed boundaries, rejected/ambiguous meters, unpaid debt, provider quota/errors, orphan objects and pending financial recovery. Do not configure cost-attestation renewal or operator dollar caps.

Live money collection requires reviewed schema-v2 acceptance covering the exact catalog, Stripe account/mode and Prices: invoices, grants, ordinary proration, signed meter errors, rounding, upload lengths, storage lifecycle, processing limits, concurrent accounting, plan switching, retention, scheduled price replacements and hosted plan payments. It has no provider-cost fingerprint or recurring cost-attestation expiry requirement. Never fabricate acceptance from unit mocks or illustrative provider rates.

Run unit checks, types, lint, isolated production builds and disposable Mongo/storage integration tests. `pnpm acceptance:managed` verifies fresh seed safety with isolated services and blank external keys; it is not real Stripe payment certification. `pnpm acceptance:selfhost` verifies billing-disabled behavior. Real sandbox invoices must separately prove broad metered grants across both usage families/replacement Prices, base exclusion, partial/sub-cent rounding, SCA/failed upgrades, Lifetime conversion, renewal downgrade/repricing and exactly one storage baseline.

The opt-in `src/lib/stripe/stripe-sandbox.integration.test.ts` uses process-only test credentials and isolated Stripe fixtures. The [application diagnostic](../scripts/stripe-app-sandbox.md) and [thin meter diagnostic](../scripts/stripe-thin-sandbox.md) verify deployed handlers. Keep private diagnostic state outside the checkout. Stripe CLI is optional. Distinguish automatic webhook delivery from a scoped signed replay of a real event; replay verifies recovery, not automatic delivery.

## Simplified billing verification on 2026-10-23

The shared-flow cleanup passed 840 default checks with 31 opt-in integrations skipped.
TypeScript, lint, and isolated managed/self-hosted production builds with PWA
verification also passed.
The cleanup also verifies vinext/Workers bundling and three narrow runtime checks;
full Workers deployment readiness remains tracked in [the Workers guide](cloudflare-workers.md).
All 44 browser regressions passed, including contact loading and sync, independent
settings saves, dirty-draft preservation and account/cache isolation.
Separate disposable MongoDB runs passed 105 checks for initialization, indexes, concurrent
retail/allowance reservations, unpaid-renewal admission, receipt repair and
durable execution checkpoints. No shared application database was initialized.
This run used disposable databases on a replica set; standalone Mongo acceptance
remains covered by the isolated Docker workflow rather than a local mongod run.
Real storage transport checks used temporary owned object keys and removed them
after verifying signed upload lengths, multipart completion, validation and copy
protection.

The earlier Stripe sandbox fixtures separately verified the following; the
shared-flow cleanup did not rerun real Stripe money movements:

- One USD 5 broad metered grant paid 2 cents of recurring usage, 2 cents of
  Lifetime usage and 3 cents under replacement Prices. The USD 10 base invoice
  and USD 250 Lifetime purchase remained outside that grant.
- Ordinary unused-time proration credited USD 10 of unused Standard service and
  collected USD 10 for Pro, with zero retention adjustment.
- A Stripe test clock executed a simultaneous Pro-to-Standard renewal downgrade
  and replacement usage Prices. The application refused the unpaid renewal and
  adopted the new allowance/tariffs after an actual USD 10 sandbox payment.

The real-provider enrichment fixture completed summary, multilingual
transliteration and embedding for a non-admin Internal user without a cost
policy, wallet or historical audio receipt. Repeating completion issued no new
provider calls, audio quantities or financial entries. Its disposable databases
and the owned Stripe fixtures were cleaned up.

These checks do not publish launch acceptance or certify the deployed webhook
journey. The public test origin returned HTTP 502 during this verification;
deployment configuration and shared services were preserved. Complete deployed
signed-webhook and customer-flow acceptance before enabling live billing.

Opt-in fixtures are `plan-credit-sandbox.integration.test.ts`,
`simplified-billing-sandbox.integration.test.ts` and
`enrichment-provider.integration.test.ts`. Supply test credentials only to their
processes; never store fixture keys or acceptance evidence in deployment files.

## Historical verification records

The following dated results describe earlier policies and are retained as audit history. They do not certify this simplified implementation or reinstate old cost budgets, credit caps or grant-rollover requirements.

### Sandbox verification on 2026-10-21

The public managed test deployment completed real Standard Checkout (USD 10),
a prepaid top-up (USD 5), duplicate signed payment delivery, a declined upgrade
that retained Standard access, and a paid immediate Pro conversion (USD 11.66
after the capped USD 8.34 credit) on the valid v3 fixture. Initial Checkout saved
the billing address needed by this Stripe account's later USD invoices. These
were sandbox payments.
The quantity suite separately finalized 14 invoices across seven rounding
boundaries and both tariff families:

| Case | Recurring storage: milliGiB → cents | Lifetime storage: milliGiB → cents | Lifetime audio: weighted blocks → cents |
| --- | --- | --- | --- |
| 0 | 1 → 0 | 1 → 0 | 1 → 0 |
| 1 | 24 → 0 | 114 → 0 | 2 → 0 |
| 2 | 25 → 1 | 115 → 0 | 3 → 0 |
| 3 | 26 → 1 | 116 → 1 | 4 → 1 |
| 4 | 49 → 1 | 230 → 1 | 6 → 1 |
| 5 | 50 → 1 | 231 → 1 | 7 → 1 |
| 6 | 51 → 1 | 232 → 1 | 8 → 1 |

Every recurring audio case used the four-block, one-cent recording minimum.
Each usage line's grant debit matched the rounded amount; a USD 1 one-off
control remained outside the usage grant. The primitive grant expiry/reissue
test carried exactly USD 9.99 or USD 9.98 from its synthetic USD 10 grant into
the four-price scope without creating new cash. This is distinct from testing
the application's complete scheduled price rollout. All of those quantity
fixtures were cleaned up and their unpaid control invoices voided.

Both recognized thin meter-error types arrived automatically with Stripe
signatures. Their intentionally unmatched samples changed no customer usage
rows. Separate regression tests cover matched rejection/quarantine and a
delayed sender acknowledgment. One app top-up run required a scoped signed
retry after authoritative payment confirmation lagged the Checkout callback;
another completed through automatic delivery. Neither produced duplicate
funding.

Two real unpaid upgrade invoices also verified source-plan budget recovery:
each was voided, its PaymentIntent canceled with zero received, and USD 8.34 of
held base credit released. The source Standard entitlement, allowance window,
paid principal, revenue and wallet were preserved. The newly admitted test cost
reservation was released before any provider call. Both uninterrupted
cancellation and interrupted cleanup through the existing confirmation API
passed without repairing financial records manually. Stripe kept the void
invoice's default InvoicePayment link open; its canceled PaymentIntent supplied
the terminal payment proof.

The test uncovered and fixed a fresh-installation interaction: blank template
Price IDs could match an unpriced retention line and classify Pro funding as
Lifetime. Funding now requires valid nonempty original Price IDs and the frozen
hosted line role, with each principal line counted once. The affected sandbox
account and its USD 11.67/USD 8.33 result were retired rather than editing its
funding history.

Sequential hosted changes also exposed Stripe's native credit basis: the
subscription still referenced the original Standard debit after the separately
paid Pro invoice. Later quotes now use the verified paid service line, original
dates and funding provenance, replacing that obsolete native credit rather
than adding another credit. A real v3 Pro → Standard → Pro sequence verified a
negative USD 8.14 downgrade invoice and the same USD 8.14 carried customer
credit. The next upgrade totaled USD 9.99 and collected USD 1.85 after that
credit. Only the USD 1.85 new cash created new paid principal; the prepaid usage
wallet was unchanged throughout both switches.

A subsequent Lifetime conversion paid USD 230.66, with a capped USD 19.34
credit and USD 0.64 retention adjustment. After an initial browser timeout, the
ordinary hosted payment resumed through Confirm Payment and Stripe's normal
test-issuer approval. The documented 3220 card produced an authoritative
authenticated 3DS challenge. While the PaymentIntent required action, Pro
remained active and usable and Lifetime ownership was still ungranted. Confirmed
payment then granted immediate Lifetime ownership through the invoice proof.
The same usage subscription retained only the two Lifetime meters, removed the
licensed base item and provided no recurring allowances. The application
diagnostic completed successfully; abandoned verification remains a separate
untested case.

The conversion preserved the monthly period identity, dates, consumed quantity
and storage peaks; this fixture had zero consumption and retained storage.
Local prepaid funding and spending were unchanged. Stripe balance transactions
confirmed the original USD 5 remained available in an active grant scoped to
all four usage prices, including both Lifetime prices. The Lifetime
`invoice.paid` handler required a scoped signed retry of the real event after
another webhook had already activated the profile. This proves retry recovery
and idempotent fulfillment; it does not establish successful automatic processing
of that particular event.

Four payment receipts that had failed during account-lease contention were
retried sequentially using signed copies of this fixture's actual Stripe
`invoice.paid` and `invoice.payment_succeeded` events. All returned HTTP 200 and
reached processed state. Total cash principal, recognized revenue and cost,
prepaid balance, Lifetime entitlement, usage period and meter IDs were unchanged;
only the ordinary verification timestamp refreshed. The owned fixture cleanup
then removed its Stripe customer and authentication credentials, canceled its
subscriptions and expired its grants. Its disabled application profile and
financial journals remain available for reconciliation.

The latest local check completed with 578 tests passed and 24 skipped, followed
by four dependency checks and twelve release checks passed. The isolated
production build also passed. These results do not replace the outstanding
external acceptance cases below.

The published test cost policy and Lifetime rates were explicitly marked as
unmeasured sandbox fixtures, with an expiring policy. They are not measured
cost evidence or approved live offers. This record does not certify abandoned
bank verification, full app renewals, taxes/discounts, refund/dispute and
erasure settlement, price-rollout crash recovery, bucket enforcement or actual
provider/enrichment costs. Complete those acceptance cases before enabling live
billing; never copy this partial record into an all-passed launch declaration.

Read-only lifecycle inspection of the configured bucket returned HTTP 403, so
its cleanup rules were not verified. `BILLING_STORAGE_LENGTH_VERIFIED` remains
unset and managed uploads use the bounded streaming fallback. No bucket rules
were changed during this test.

### Actual-cost credit verification on 2026-10-22

The isolated real Stripe credit diagnostic paid a USD 10 source subscription,
then received USD 10 of native unused-base proration. With exactly USD 2 of
test-fixture incurred/committed costs, the production credit cap allowed USD 8
and Stripe reproduced the USD 2 retention adjustment. The frozen hosted change
invoice collected USD 12 against the USD 20 target charge. Owned sandbox
resources were cleaned up. This proves the revised credit and invoice
arithmetic, including normal hosted card verification; it does not establish
measured provider costs, application fulfillment, webhook delivery or full live
acceptance. The cost fixture is not financial evidence for a published offer.
