# Contributing to Callery

Callery is free software under [AGPL-3.0](LICENSE). Contributions are accepted under the same license. You must have permission to contribute the code and assets in your change under those terms.

Use public issues for reproducible bugs and proposed improvements; use [private security reporting](SECURITY.md) for vulnerabilities. Examples and fixtures must use synthetic recordings, identities and credentials.

## Development

Follow [setup](docs/setup-guide.md), `.nvmrc` and `package.json`'s `packageManager`. Use the user's installed tools. Preserve existing deployment environment files and processes; test against disposable services instead of shared deployments.

Before changing Next.js code, read the relevant installed guide in `node_modules/next/dist/docs/`. This repository's Next.js version can differ from examples found online.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm peers check
node --test scripts/release-tooling.test.mjs
```

`pnpm check` uses isolated test defaults but skips optional network suites without their fixture variables. A successful default run does not prove Docker, SMTP or production integrations work. With Docker Engine, installed dependencies and Playwright Chromium available, the acceptance script creates temporary source/configuration, databases, buckets and randomly published loopback ports:

```sh
node scripts/ci-acceptance.mjs --billing=false --checks
node scripts/ci-acceptance.mjs --billing=true --checks
```

It never reuses the deployment `.env`, public tunnel or a user-started server. It cleans only its generated Compose project. Runtime containers cannot call live provider APIs. Both profiles and the retained-history secret scan are required in CI. See [release verification](docs/releases.md) for boundaries and prerequisites.

Keep changes focused, explain the user-visible outcome, and include the relevant validation. Changes to billing or authorization need regression tests for account isolation, retries and failure behavior. Avoid private data in screenshots, logs and issue attachments.
