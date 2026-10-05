import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ZipArchive } from 'archiver';
import { BRACES_ADVISORY, isVerifiedLocalFix, resolvePackageChain } from './dependency-patch.mjs';
import { prepareWindowsStandalone } from './prepare-standalone.mjs';

const chains = [
    ['eslint-config-next', '@next/eslint-plugin-next', 'fast-glob', 'micromatch', 'braces'],
    ['vinext', 'vite-plugin-commonjs', 'vite-plugin-dynamic-import', 'fast-glob', 'micromatch', 'braces'],
];
const directories = [...new Set(chains.map(resolvePackageChain))];
const require = createRequire(import.meta.url);

for (const directory of directories) {
    const braces = require(path.join(directory, 'index.js'));
    test(`braces rejects excessive string and AST nesting (${path.basename(path.dirname(path.dirname(directory)))})`, () => {
        const tooDeep = '{'.repeat(4_000) + 'a,b' + '}'.repeat(4_000);
        const tooDeepParens = '('.repeat(4_000) + 'a' + ')'.repeat(4_000);
        for (const method of ['parse', 'compile', 'expand', 'stringify']) {
            for (const pattern of [tooDeep, tooDeepParens]) {
                assert.throws(() => braces[method](pattern), { name: 'SyntaxError', message: /max depth/ });
            }
        }
        let ast = { type: 'text', value: 'a' };
        for (let n = 0; n < 4_000; n++) ast = { type: 'root', nodes: [ast] };
        const cyclic = { type: 'root', nodes: [] };
        cyclic.nodes.push(cyclic);
        for (const method of ['compile', 'expand', 'stringify']) {
            assert.throws(() => braces[method](ast), { name: 'SyntaxError', message: /max depth/ });
            assert.throws(() => braces[method](cyclic), { name: 'SyntaxError', message: /max depth/ });
        }
    });
    test('braces preserves ordinary expansion, balanced nesting, escaped and quoted literals', () => {
        assert.deepEqual(braces.expand('src/{app,lib}/{a,b}.ts'), [
            'src/app/a.ts', 'src/app/b.ts', 'src/lib/a.ts', 'src/lib/b.ts',
        ]);
        assert.deepEqual(braces.expand('clip-{01..03}.wav'), ['clip-01.wav', 'clip-02.wav', 'clip-03.wav']);
        assert.equal(braces.compile('src/{app,lib}/*.ts'), 'src/(app|lib)/*.ts');
        assert.doesNotThrow(() => braces.compile('{'.repeat(100) + 'a' + '}'.repeat(100)));
        assert.doesNotThrow(() => braces.compile('\\{'.repeat(1_500) + 'a' + '\\}'.repeat(1_500)));
        assert.doesNotThrow(() => braces.compile('"' + '{'.repeat(3_500) + 'a' + '}'.repeat(3_500) + '"'));
    });
}

test('audit recognizes only the exact advisory and verifies every installed dependency path', () => {
    const advisory = {
        github_advisory_id: BRACES_ADVISORY, module_name: 'braces',
        findings: [{ version: '3.0.3', paths: chains.map(chain => '.>' + chain.join('>')) }],
    };
    assert.equal(isVerifiedLocalFix(advisory), true);
    assert.equal(isVerifiedLocalFix({ ...advisory, github_advisory_id: 'GHSA-another-advisory' }), false);
    assert.throws(() => isVerifiedLocalFix({ ...advisory, findings: [{ version: '3.0.2', paths: advisory.findings[0].paths }] }));
    assert.throws(() => isVerifiedLocalFix({ ...advisory, findings: [] }));
});

test('Archiver 8 produces a readable ZIP with streamed audio, Unicode paths and transcript files', async () => {
    const fflateDirectory = resolvePackageChain(['vinext', '@vercel/og', 'satori', 'fflate']);
    const { unzipSync } = createRequire(path.join(fflateDirectory, 'package.json'))('fflate');
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];
    const complete = new Promise((resolve, reject) => {
        archive.on('data', chunk => chunks.push(chunk));
        archive.on('error', reject);
        archive.on('end', resolve);
    });
    archive.append('viewer content', { name: 'viewer.html' });
    archive.append(Readable.from([Buffer.from([0, 1, 2, 255])]), { name: 'Contacts/മലയാളം/2026/10/clip.wav' });
    archive.append(JSON.stringify({ transcript: 'Call transcript' }), { name: 'recording.json' });
    await archive.finalize();
    await complete;
    const files = unzipSync(Buffer.concat(chunks));
    assert.equal(Buffer.from(files['viewer.html']).toString(), 'viewer content');
    assert.deepEqual(Buffer.from(files['Contacts/മലയാളം/2026/10/clip.wav']), Buffer.from([0, 1, 2, 255]));
    assert.deepEqual(JSON.parse(Buffer.from(files['recording.json']).toString()), { transcript: 'Call transcript' });
});

test('Windows standalone repairs file-typed directory links and rejects external targets', { skip: process.platform !== 'win32' }, () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), 'vosift-standalone-test-'));
    try {
        const output = path.join(sandbox, 'output');
        const target = path.join(output, 'package');
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, 'index.js'), 'module.exports = 42;');
        const link = path.join(output, 'dependency');
        symlinkSync('package', link, 'file');
        assert.throws(() => statSync(link), { code: 'EPERM' });
        assert.equal(prepareWindowsStandalone(output), 1);
        assert.equal(readFileSync(path.join(link, 'index.js'), 'utf8'), 'module.exports = 42;');
        assert.equal(prepareWindowsStandalone(output), 0);
        const outside = path.join(sandbox, 'outside');
        mkdirSync(outside);
        writeFileSync(path.join(outside, 'keep.txt'), 'keep');
        symlinkSync('../outside', path.join(output, 'escape'), 'file');
        assert.throws(() => prepareWindowsStandalone(output), /outside the build output/);
        assert.equal(readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
    } finally {
        // This fixture was created here; never delete a caller-provided path.
        assert.equal(path.dirname(sandbox), path.resolve(tmpdir()));
        assert.ok(path.basename(sandbox).startsWith('vosift-standalone-test-'));
        rmSync(sandbox, { recursive: true, force: true });
    }
});
