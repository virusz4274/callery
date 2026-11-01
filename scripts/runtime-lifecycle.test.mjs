// Narrow request-lifecycle checks for the installed Next and vinext runtimes.
// This does not certify Workers auth, SMTP, large exports or PWA parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolvePackageChain } from './dependency-patch.mjs';

const require = createRequire(import.meta.url);

test('installed Next after defers a single callback until response close, including redirects', async () => {
  // Next supplies this global during startup; reproduce its request context only.
  globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
  const { after } = require('next/server');
  const { AfterContext } = require('next/dist/server/after/after-context');
  const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external');
  const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external');
  const pending = []; const closing = []; const events = [];
  const afterContext = new AfterContext({ waitUntil: promise => pending.push(promise), onClose: callback => closing.push(callback) });
  const store = { afterContext };
  await workAsyncStorage.run(store, () => workUnitAsyncStorage.run({ phase: 'action' }, async () => {
    after(async () => { await Promise.resolve(); events.push('completed'); });
    assert.deepEqual(events, []);
    assert.equal(pending.length, 1, 'The route must retain completion before returning its redirect.');
    const response = Response.redirect('https://runtime-fixture.invalid/complete');
    assert.equal(response.status, 302);
    for (const close of closing) close();
    await Promise.all(pending);
  }));
  assert.deepEqual(events, ['completed']);
});

test('installed vinext after survives a completed response on real local workerd', { timeout: 60_000 }, async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'vosift-after-worker-'));
  const esbuild = createRequire(path.join(resolvePackageChain(['tsx']), 'package.json'))('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = createRequire(path.join(resolvePackageChain(['cf']), 'package.json'))('miniflare');
  let worker;
  try {
    const source = `
      import { after } from ${JSON.stringify(path.join(resolvePackageChain(['vinext']), 'dist/shims/server.js'))};
      import { createRequestContext, runWithRequestContext, closeAfterResponseWithBody } from ${JSON.stringify(path.join(resolvePackageChain(['vinext']), 'dist/shims/unified-request-context.js'))};
      const completed = []; const failed = [];
      export default { fetch(request, env, executionContext) {
        const url = new URL(request.url);
        if (url.pathname === '/state') return Response.json({ completed, failed });
        const context = createRequestContext({ executionContext });
        return runWithRequestContext(context, () => {
          const id = url.pathname.slice(1);
          after(async () => {
            try {
              await new Promise(resolve => setTimeout(resolve, 25));
              if (id === 'failure') throw new Error('Fixture failure');
              completed.push(id);
            } catch { failed.push(id); }
          });
          return closeAfterResponseWithBody(Response.json({ ranBeforeResponse: completed.includes(id) || failed.includes(id) }), context);
        });
      }};
    `;
    const scriptPath = path.join(temporary, 'worker.mjs');
    await esbuild.build({ stdin: { contents: source, resolveDir: process.cwd(), sourcefile: 'runtime-fixture.mjs' },
      bundle: true, format: 'esm', platform: 'neutral', external: ['node:*'], outfile: scriptPath, logLevel: 'silent' });
    worker = new Miniflare(convertV4MiniflareOptions({ rootPath: temporary, name: 'runtime-fixture', modules: true, scriptPath, compatibilityDate: '2026-10-04', compatibilityFlags: ['nodejs_compat'] }));
    for (const id of ['success', 'failure']) {
      const response = await worker.dispatchFetch(`http://runtime-fixture.invalid/${id}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ranBeforeResponse: false });
    }
    let state;
    const deadline = Date.now() + 5_000;
    do {
      state = await (await worker.dispatchFetch('http://runtime-fixture.invalid/state')).json();
      if (state.completed.length && state.failed.length) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    } while (Date.now() < deadline);
    assert.deepEqual(state, { completed: ['success'], failed: ['failure'] });
  } finally {
    if (worker) await worker.dispose();
    await rm(temporary, { recursive: true, force: true });
  }
});

test('browser billing eligibility imports public configuration without the server configuration graph', async () => {
  const esbuild = createRequire(path.join(resolvePackageChain(['tsx']), 'package.json'))('esbuild');
  const result = await esbuild.build({ entryPoints: ['src/lib/access-control-common.ts'], bundle: true,
    platform: 'browser', format: 'esm', write: false, metafile: true, logLevel: 'silent',
    define: { 'process.env.NEXT_PUBLIC_ENABLE_BILLING': 'false', 'process.env.STRIPE_SECRET_KEY': '"server-secret-fixture"' } });
  const inputs = Object.keys(result.metafile.inputs);
  assert.ok(inputs.some(file => file.endsWith('/public-env.ts')));
  assert.equal(inputs.some(file => /\/lib\/(?:env|config)\.ts$/.test(file)), false);
  const output = result.outputFiles.map(file => file.text).join('\n');
  assert.equal(output.includes('server-secret-fixture'), false);
  assert.equal(output.includes('STRIPE_SECRET_KEY'), false);
  assert.equal(output.includes('MONGODB_URI'), false);
});
