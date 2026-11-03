# Release verification and deployment boundaries

The first supported distribution is a versioned source release, built with native Node or Docker Compose. Self-hosting is free under AGPL-3.0. Paid managed plans serve individual accounts and include hosting/setup; company archives remain self-host features. Lifetime access remains available on the managed service with explicit processing and overage terms in [billing](billing.md).

There is no generic pull-only app image. Next.js inlines `NEXT_PUBLIC_*` values, and serializes build configuration into standalone output. Set the public origin, billing flag and optional public integration settings before building. A build for one origin/profile must not be advertised as runtime-reconfigurable for every deployment. The installed Next.js output/environment guides are the implementation reference.

## Automated acceptance

`.github/workflows/validate.yml` runs on PRs, main, version tags and manual dispatch. Actions are pinned to verified commit IDs. Node is selected from `.nvmrc` and pnpm from `packageManager`; dependencies use the frozen lockfile. There are no provider credentials or deployment secrets in workflow inputs.

Repository rules must require the secret-scan and both acceptance matrix checks before merging. Adding a workflow does not itself enable branch protection. Enable GitHub private vulnerability reporting before directing security reports there.

1. Pinned Gitleaks scans tracked files, untracked nonignored files, and complete reachable history. Ignored deployment configuration is excluded from the current-tree scan. Only reviewed, operator-confirmed revoked historical fingerprints may be acknowledged; current source has no such exception. Unknown findings fail the gate. See [SECURITY.md](../SECURITY.md).
2. A billing-off/on matrix runs `scripts/ci-acceptance.mjs`. It snapshots source without deployment environment files, generates fixture-only configuration in a new temporary directory, and assigns a unique Compose project, volumes and available loopback ports. It builds the real production Dockerfile and optional storage source images, initializes MongoDB and storage, starts Mailpit, waits for health, and sets all network-suite variables.
3. `pnpm check`, peer validation, production audit and release-tooling tests run against disposable services. Unit tests default to self-host policy; HTTP/browser tests target the actual matrix profile. S3 checks use real MinIO without the reduced S3rver compatibility flag. Browser action mocks use the manifest copied from that exact app image.
4. Real SMTP acceptance verifies email delivery, check-email signup, verification, admin promotion only after verification, recovery/session revocation and browser login. Real API upload retries must produce one recording and one storage charge. Signed playback must match the uploaded bytes; unsigned storage reads must fail. Existing fixture browser suites run in both profiles; two older email-disabled/live-billing journeys are replaced by these isolated network checks.
5. The runner stops only its own app/scheduler before an actual `mongodump`/`mongorestore` into a second database. It copies the complete private bucket into another bucket, checks every object's bytes/hash plus durable collection counts and all indexes, retains the matching encryption key, clears restored sessions, and starts the restored application to verify fresh login, account isolation, playback and an export containing the original audio/metadata. MongoDB TTL records can expire during a dump, so transient TTL collections are excluded from count equality. Production backups are never touched.
6. Cleanup targets only the generated Compose project, including its disposable volumes. Do not run broad container or port cleanup against a shared development machine. If a run is forcibly killed, inspect its logged `callery-ci-*` project and remove only that project after confirming ownership.

The script requires Docker Engine, installed project dependencies, host Node/pnpm matching the manifests, and Playwright Chromium. `pnpm exec playwright install --with-deps chromium` provisions the disposable CI runner; it is not performed automatically on a developer's host. The Mongo image must include working Database Tools; missing tools make the rehearsal fail. Local runs preserve all deployment configuration and user-started processes.

## Storage and image provenance

Image references were checked against the publisher registry metadata on 2026-10-20. The complete content digests are recorded directly in Dockerfiles, Compose and the acceptance script:

| Component | Pinned reference | Publisher source |
| --- | --- | --- |
| App Node runtime | `node:24.22.0-alpine` + manifest digest | [Official Node image metadata](https://hub.docker.com/v2/repositories/library/node/tags/24.22.0-alpine) |
| MongoDB | `mongo:8.0.34` + manifest digest | [Official Mongo image metadata](https://hub.docker.com/v2/repositories/library/mongo/tags/8.0.34) |
| Scheduler/storage runtime | `alpine:3.23.6` + manifest digest | [Official Alpine metadata](https://hub.docker.com/v2/repositories/library/alpine/tags/3.23.6) |
| Optional storage builder | `golang:1.26.10-alpine3.23` + manifest digest | [Official Go metadata](https://hub.docker.com/v2/repositories/library/golang/tags/1.26.10-alpine3.23) |
| CI SMTP capture | `axllent/mailpit:v1.31.6` + manifest digest | [Publisher Mailpit metadata](https://hub.docker.com/v2/repositories/axllent/mailpit/tags/v1.31.6) |
| Optional MinIO | commit `9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a` | [Security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) |
| Optional MinIO client | commit `7394ce0dd2a80935aded936b09fa12cbb3cb8096` | [Client release](https://github.com/minio/mc/releases/tag/RELEASE.2025-08-13T08-35-41Z) |

MinIO's [community repository](https://github.com/minio/minio) is archived and describes source-only distribution. The latest community security release instructs container users to build from source. Official Docker Hub and Quay references could not be authenticated for the checked releases. `docker/minio.Dockerfile` therefore builds exact upstream source commits inside Docker, preserving license notices/source references, rather than using an unverified mirror or inventing a digest.

Bundled MinIO is optional compatibility storage and an acceptance fixture, with an upstream maintenance limitation. Prefer supported external S3-compatible storage for production. Pinning and building an archived version does not provide future security fixes. Existing external storage endpoints, bucket contents and credentials remain operator-owned. Review these pins during security maintenance; registry existence and a successful build do not establish ongoing support.

## Versioned source release

On a `v<package.json version>` tag, the workflow creates a **draft** GitHub release with a source archive and SHA-256 checksum only after secret review, both acceptance matrix profiles and the Workers compatibility job succeed. That compatibility job runs the lifecycle tests and vinext build; it does not deploy or certify a Worker. An operator reviews and publishes the draft. The workflow does not deploy the managed service or change a self-host installation.

Before publishing, run the real provider acceptance separately: selected email provider to an operator-controlled mailbox; Google OAuth callbacks if offered; Stripe test-mode subscription/Lifetime, payment failures, webhook retries and metering as documented in [billing](billing.md). Fixtures prove application contracts but cannot prove a real account/domain/product was configured correctly. Do not enable live money collection until that Stripe checklist passes.

Before upgrading a self-host deployment, record its version and back up MongoDB, every bucket object and encrypted deployment configuration as described in [backup and recovery](small-team-setup.md#back-up-the-complete-deployment). Preserve `.env`, public URLs, keys, named volumes and custom providers. Build the tagged source with the saved public settings, run additive `db:init`, test health/login/upload/playback/export, and resume scheduler work after checking retention. Keep the old source/image and matching backup. If data or schema changed incompatibly, rollback requires the matching database/object/config backup rather than merely running older code.

## Verification status

The 2026-11-03 review passed typechecking, lint, unit/tooling checks, eight export retry browser checks, peer validation and isolated builds for both Next.js profiles and vinext. Optional service-dependent tests were skipped. The full dependency audit reports 19 unresolved findings and the production audit reports eleven, so `pnpm check` and the release gates remain failing. See [current verification results](dependency-review.md#verification--2026-11-03) for counts and boundaries.

Historical repository verification on 2026-10-20 used host Node 24.22.0 and pnpm 12.14.0 in an isolated source copy with its own frozen-lockfile dependency installation and no deployment environment files:

- `pnpm check` passed type generation, TypeScript, full ESLint, 236 application tests, four dependency tests, three release-tooling tests, and the then-current dependency audit. Fourteen service-dependent application checks and the Windows-only dependency test were skipped.
- `pnpm peers check` passed. Production builds with billing disabled and enabled both passed, including standalone preparation and all PWA checks.
- Two browser tests passed at 390px and 1280px, exercising lifetime ownership, continuing-charge disclosure, failed recovery feedback, payment-method action, and the recovered billing state with isolated API fixtures.
- The then-current production dependency audit passed under the local braces patch. That advisory was later withdrawn and its patch exception has been removed; current audits fail on every reported advisory.
- The migration `--help` path passed without database or Stripe mutations. No deployment environment files or running deployment processes were changed.

Convenience commands are `pnpm audit:secrets`, `pnpm billing:migrate` (dry run by default), `pnpm acceptance:selfhost`, and `pnpm acceptance:managed`. Acceptance requires Docker Engine; the secret audit requires the pinned existing scanner. Their prerequisite checks fail clearly without installing tools or altering the shared deployment.

Infrastructure acceptance remains pending until a successful run on Docker Engine is recorded. Docker Engine and Database Tools were unavailable on the shared development host during this work. Pinned metadata and static/script checks do not substitute for container startup, SMTP delivery or a restore rehearsal. The full retained-history Gitleaks review also remains pending when no existing host scanner is available. Previous dependency checks and their boundaries remain in [dependency review](dependency-review.md). Cloudflare Workers deployment remains experimental and optional; its compatibility CI job is a prerequisite for creating a draft source release.
