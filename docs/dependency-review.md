# Dependency Review Register

This file is the lightweight place to record deliberate dependency holds or accepted dependency risk that should stay visible after a remediation pass.

## Current Repo Facts

- Production dependency audit helper: `npm run audit:prod`
- Main runtime framework line: `next@16.1.7`
- Firebase admin line: `firebase-admin@12.1.0`

## How To Use This File

Add an entry when you intentionally decide not to upgrade or remediate a dependency issue right away.

Each entry should capture:

- date
- package or package group
- why the issue is being accepted or deferred
- what must pass before the follow-up ships
- the next review checkpoint

## Current Status

No active dependency exception is documented here beyond the package versions currently in `package.json`.
