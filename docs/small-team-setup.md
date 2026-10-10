# Small team setup and recovery

Vosift can serve a small company of roughly 2–15 people. Each deployment is one company. Employees manually upload recordings from their phones, use their own archive, and understand that company administrators can retrieve their uploads. Personal deployments stay personal until an administrator explicitly enables the company archive.

## Enable the company archive

1. Back up the deployment before adopting existing recordings as company records.
2. Use an existing verified administrator. Keep the current bootstrap administrator configuration.
3. Keep billing disabled and configure SMTP or Resend. The setup action sends a real test notification to the administrator; delivery failure leaves setup disabled.
4. Run the normal additive `pnpm db:init` on the deployment after upgrading. It adds invitation and company recording indexes and preserves saved settings. Do not copy `.env.example` over the deployment configuration.
5. Open **Administration → Settings → Set up a small team**. Enter the company name. Start with retention **Until the administrator deletes them** and transcription **Off**.
6. Confirm adoption. Existing recordings become company records, signup requires invitations, and public share links stop working. There is no switch back to personal mode in this version.
7. Open **Administration → Employees** to invite employees. Invitations last seven days; resend renews validity. Employees register with the invited email address and verify it, or use Google with that verified address. Invitations create members; promote an employee using the existing administrator role control when needed.

Restore accounts already scheduled for destructive deletion before enabling company mode. If a restore window has expired, resolve its pending cleanup first. Company setup never silently adopts an account already being deleted.

## Everyday operation

Members upload, search, play, download, export and organise their own recordings. They cannot permanently delete company recordings. Contacts stay private to each uploader. **Company recordings** lets administrators filter by employee, recording date and ordinary text, see the uploader, play/download recordings, and export an employee’s entire archive.

**Remove access** retains the employee profile, contacts, recordings and usage. It revokes login sessions and denies old sync and upload tokens, including completion of an upload started earlier. **Restore access** permits a fresh login without reviving those old tokens. The last active administrator cannot be removed or demoted.

Delete recordings separately, with the recording deletion confirmation. The administration log records explicit company recording deletions. A company retention policy applies to active and former employees. The existing scheduler uses 90, 180 or 365 days for three months, six months or one year, based on the recording date; changing policy can delete old uploads at the next cleanup. Keep the cleanup and export scheduler configured as described in the deployment setup guide.

Transcription is off, manual on request, or automatic after upload, using one company provider/model. Leaving the model blank uses the provider’s deployment configuration. Members cannot override retention or processing through their settings or direct requests. Transcription failures do not prevent the original audio backup. Provider processing already underway may finish after a policy change.

Storage usage includes former employees and has no team quotas. Administrators exporting a former employee receive the export notification themselves. Export links last seven days; playback links last five minutes. A storage URL already issued remains valid until its expiry even after access is removed. Keep the audio bucket private; a publicly readable bucket would bypass application permissions.

## Back up the complete deployment

An employee export contains their library and viewer. It cannot restore deployment identities, invitations, configuration or encrypted integrations.

Keep three matching backups: the MongoDB application database, every object in the private audio bucket, and an encrypted copy of deployment configuration/secrets. Use a second location with restricted access. Record the app revision, MongoDB version, database/bucket names, snapshot time and checksums in a backup manifest. A daily backup is a practical starting point; keep earlier snapshots so an accidental retention change does not erase the only recoverable copy.

Pause the app and its cron/scheduler workers while taking the snapshot, so uploads, exports and retention cannot change the database or object store between copies. Restart them after both copies finish. Include Better Auth collections (`user`, `account`, `session`, `verification`), application profiles, recordings, contacts, team invitations, settings, export jobs, usage and administration logs.

MongoDB Database Tools preserve BSON data and index metadata. Supply the database URI securely from your deployment’s secret store. The following example backs up the named application database; `$backupUri` and `$backupDatabase` are operator-supplied values, not changes to the app’s `.env`. See the [MongoDB backup tool](https://www.mongodb.com/docs/database-tools/mongodump/) and [restore tool](https://www.mongodb.com/docs/database-tools/mongorestore/).

```powershell
mongodump --uri="$backupUri" --db="$backupDatabase" --archive="vosift-mongo.archive.gz" --gzip
```

Copy the full bucket, retaining its exact object keys. With an AWS CLI profile configured securely for the selected S3-compatible storage provider, an example is below. Replace the endpoint, bucket and backup directory with operator-supplied values. Verify copied object counts, sizes and SHA-256 hashes; do not assume an ETag is a file hash. See the [AWS CLI sync reference](https://docs.aws.amazon.com/cli/latest/reference/s3/sync.html).

```powershell
aws --profile vosift-backup --endpoint-url "$storageEndpoint" s3 sync "s3://$backupBucket" "./vosift-audio-backup"
```

The encrypted configuration backup must include the authentication secret, Google token encryption key and its version, signing keys for upload/share/sync tokens, database and storage credentials, bucket/endpoint settings, email credentials/sender, OAuth client credentials and callbacks, push keys, cron secret, selected transcription credentials/models, and the saved public HTTPS origin. Preserve any additional filled deployment fields. Never commit credentials or put their values in the manifest. Losing the Google encryption key makes stored Contacts tokens unreadable.

## Restore and verify

1. Create an isolated deployment with a fresh database, a separate private bucket and a separate process/port. Keep production uploads and scheduler workers stopped during an actual recovery. For a rehearsal, keep production running and use only backup copies in the isolated deployment.
2. Restore configuration securely in that separate environment. Keep the original encryption key/version so existing encrypted data remains readable. Disable real outbound email, provider processing and scheduler jobs during the rehearsal. Use that environment’s own origin and OAuth callback registrations; never edit the shared deployment’s saved URLs to run a test.
3. Restore the MongoDB archive into the new database. The example explicitly restricts and renames the source namespace; `$restoreUri` must point to the separate environment. Use an empty destination, without `--drop` against a live database.

```powershell
mongorestore --uri="$restoreUri" --archive="vosift-mongo.archive.gz" --gzip --nsInclude="$backupDatabase.*" --nsFrom="$backupDatabase.*" --nsTo="$restoreDatabase.*" --stopOnError
```

4. Upload the copied audio tree to the recovery bucket with the exact original object keys.

```powershell
aws --profile vosift-restore --endpoint-url "$restoreStorageEndpoint" s3 sync "./vosift-audio-backup" "s3://$restoreBucket"
```

5. Compare collection counts/indexes, audio counts/sizes/hashes, company policy and per-employee usage with the manifest. Check retained former employees and their contacts. Clear restored login sessions before exposing a recovered deployment; employees should sign in again. Expired invitations need resending.
6. Start the matching app revision. Verify administrator and member login, member isolation, playback of several samples, an employee export, and retained access removal. Confirm that a stored Google token can be decrypted before reconnecting Contacts. Existing export download URLs may point to the old bucket; regenerate exports in the recovered deployment.
7. For actual recovery, route the saved public origin to the recovered deployment only after these checks pass. Restore email/integration settings and resume cron jobs after reviewing retention dates. Keep the previous deployment and backup available until recovery has been checked.

Repeat a restore rehearsal after major upgrades and periodically during use. The automated team integration test exercises a BSON copy to a separately named MongoDB database and a byte-for-byte audio copy, plus restored identity and policy checks. An operational `mongodump`/bucket restore rehearsal using deployment backups is still needed before relying on disaster recovery.

## Two week pilot

Start with one administrator and two or three employees. Give each employee a short upload walkthrough using an actual phone sample. Verify its original filename, call date, byte count and playback after upload. Repeat completion and confirm storage is counted once. Use retention **never** and transcription **off** initially.

For two weeks, note whether employees upload regularly, how often the administrator retrieves a needed call, and whether manual uploading is the main obstacle. At the end, review missing uploads and retrieval failures together. Add automation only if manual upload is the demonstrated obstacle; add no departments, manager roles, custom permissions, shared contacts, SSO/SCIM, seat billing, licence activation or new processing platform without evidence from use.

## Development validation

`pnpm typecheck`, `pnpm lint` and `pnpm test` include ordinary compatibility checks. The isolated browser tests in `e2e/team-workflow.spec.ts` bundle the actual team components with fixture-only server actions; they cover mobile/desktop adoption confirmation, invitations, removal, company filtering, paging and former employee export without writing to the shared site.

The real database suite in `src/lib/team.integration.test.ts` is opt-in. Set `VOSIFT_TEST_MONGODB_URI` only in the test process, using a MongoDB account permitted to create/drop temporary databases. The suite replaces the database name with a random test name before connecting and drops only its test/recovery databases. Email and storage are intercepted; no external messages or transcription jobs are sent.

```powershell
node --conditions=react-server --import tsx --test --import ./src/test/env-test-setup.ts src/lib/team.integration.test.ts
pnpm exec playwright test e2e/team-workflow.spec.ts
```

Do not persist test fixtures into `.env`, `.env.local` or `.env.development*`. Use the saved public origin for shared-site read-only smoke checks. Physical phone samples, actual OAuth redirects, deployment backup commands and the two-week pilot remain operational checks separate from automated fixtures.
