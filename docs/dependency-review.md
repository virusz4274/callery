# Dependency Review Register

## 2026-03-19

### Accepted low-severity production risk

- `npm audit --omit=dev` still reports 8 low-severity transitive findings through `firebase-admin`:
  - `@google-cloud/firestore`
  - `@google-cloud/storage`
  - `google-gax`
  - `retry-request`
  - `teeny-request`
  - `http-proxy-agent`
  - `@tootallnate/once`
- The current installed version is `firebase-admin@12.1.0`.
- The current npm registry version reviewed during this pass is `firebase-admin@13.7.0`.

### Decision

- Keep the current `firebase-admin` line in this remediation pass.
- Do not force a same-pass auth-library upgrade unless it clearly removes the audit tail and passes full Firebase auth/session regression testing.

### Review checkpoint

- Reassess `firebase-admin` on or before `2026-04-19`.
- The upgrade should only ship with:
  - `npm run audit:prod`
  - `npm test`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - a manual Firebase sign-in and session-cookie verification pass
