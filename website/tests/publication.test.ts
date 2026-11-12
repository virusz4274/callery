import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { documentationPages } from '../src/lib/documentation';

const source = fileURLToPath(new URL('../', import.meta.url));
const astroManifest = JSON.parse(readFileSync(new URL('../node_modules/astro/package.json', import.meta.url), 'utf8'));
const astroCli = fileURLToPath(new URL(`../node_modules/astro/${astroManifest.bin.astro}`, import.meta.url));
const fixture = {
    version: 1, sourceAppOrigin: 'https://app.fixture-callery.com', generatedAt: '2026-11-12T00:00:00.000Z',
    pricing: { trial: null, plans: [{ key: 'standard', name: 'Standard', description: 'Test-only public plan.',
        price: 12, currency: 'USD', interval: 'monthly', storageBytes: 1024, weightedMinutes: 60,
        available: true, usage: null }] },
};

test('offline publication preserves content and enforces launch, pricing, and preview boundaries', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'callery-website-publication-'));
    const destination = path.join(temporary, 'website');
    try {
        await mkdir(destination);
        for (const file of ['src', 'public', 'scripts', 'package.json', 'tsconfig.json', 'astro.config.ts']) {
            await cp(path.join(source, file), path.join(destination, file), { recursive: true });
        }
        await cp(path.join(source, '../shared'), path.join(temporary, 'shared'), { recursive: true });
        await cp(path.join(source, '../deployment'), path.join(temporary, 'deployment'), { recursive: true });
        await mkdir(path.join(temporary, 'docs'));
        for (const page of documentationPages) {
            await cp(path.join(source, `../docs/${page.slug}.md`), path.join(temporary, `docs/${page.slug}.md`));
        }
        await symlink(path.join(source, '../node_modules'), path.join(temporary, 'node_modules'), 'dir');
        await symlink(path.join(source, 'node_modules'), path.join(destination, 'node_modules'), 'dir');
        const savedPricing = path.join(destination, 'src/data/pricing.json');
        await writeFile(savedPricing, JSON.stringify(fixture));
        const existingGuide = await readFile(path.join(destination, 'src/content/guides/find-and-export-samsung-call-recordings.md'), 'utf8');
        await writeFile(path.join(destination, 'src/content/guides/unpublished-vivo-guide.md'), existingGuide
            .replace(/^title:.*$/m, 'title: Unpublished Vivo fixture')
            .replace(/^manufacturer:.*$/m, 'manufacturer: Vivo')
            .replace(/^task:.*$/m, '$&\ncategory: setup')
            .replace(/^draft:.*$/m, 'draft: true')
            .replace(/^verification:.*$/m, 'verification: unverified'));
        const environment = {
            ...Object.fromEntries(['PATH', 'HOME', 'USER', 'TMPDIR', 'XDG_CACHE_HOME'].filter(key => process.env[key]).map(key => [key, process.env[key]])),
            ASTRO_TELEMETRY_DISABLED: '1', NODE_ENV: 'production', SITE_INDEXABLE: 'true', SITE_LAUNCH_STAGE: 'open',
            SITE_URL: 'https://www.fixture-callery.com', PUBLIC_APP_URL: fixture.sourceAppOrigin,
        };
        const build = (overrides: Record<string, string> = {}) => execFileSync(process.execPath, [astroCli, 'build'], {
            cwd: destination, env: { ...environment, ...overrides }, encoding: 'utf8', stdio: 'pipe',
        });
        build();
        const html = await readFile(path.join(destination, 'dist/index.html'), 'utf8');
        assert.match(html, /name="robots" content="index, follow/);
        assert.ok(html.includes('https://app.fixture-callery.com/signup'));
        assert.ok(html.includes('https://www.fixture-callery.com/social-preview.png'));
        assert.match(html, /<title>Call Recording Organizer &amp; Search \| Callery<\/title>/);
        const homepageHeading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)![1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
        assert.match(homepageHeading, /Organize your call recordings\.\s*Find what was said\./);
        for (const screenshot of ['upload', 'library', 'transcript']) {
            assert.ok(html.includes(`data-product-screenshot="${screenshot}"`), `Homepage must show the real ${screenshot} screenshot`);
        }
        assert.match(html, /<img\b[^>]*srcset=/, 'Product screenshots must have responsive image variants');
        assert.match(html, /fictional/i);
        assert.ok(html.includes('href="/search-call-recordings"'));
        const guideIndex = await readFile(path.join(destination, 'dist/guides.html'), 'utf8');
        const setupIndex = await readFile(path.join(destination, 'dist/call-recording.html'), 'utf8');
        const sitemap = await readFile(path.join(destination, 'dist/sitemap-0.xml'), 'utf8');
        assert.equal(guideIndex.includes('unpublished-vivo-guide'), false);
        assert.equal(setupIndex.includes('unpublished-vivo-guide'), false);
        assert.equal(sitemap.includes('unpublished-vivo-guide'), false);
        assert.equal(sitemap.includes('/404'), false);
        assert.ok(sitemap.includes('/search-call-recordings'));
        assert.ok(sitemap.includes('/pricing'), 'Open pricing should be discoverable when its catalog is valid');
        const searchPage = await readFile(path.join(destination, 'dist/search-call-recordings.html'), 'utf8');
        assert.match(searchPage, /data-product-screenshot="(?:search|transcript)"/);
        assert.match(searchPage, /indexed|indexing/i);
        assert.match(searchPage, /transcrib/i);
        const samsungLanding = await readFile(path.join(destination, 'dist/samsung-call-recording-organizer.html'), 'utf8');
        assert.ok(samsungLanding.includes('href="/search-call-recordings"'));
        const docsIndex = await readFile(path.join(destination, 'dist/docs.html'), 'utf8');
        for (const page of documentationPages) {
            assert.ok(docsIndex.includes(`/docs/${page.slug}`));
            assert.ok(sitemap.includes(`/docs/${page.slug}`));
            const document = await readFile(path.join(destination, `dist/docs/${page.slug}.html`), 'utf8');
            assert.equal((document.match(/<h1\b/g) || []).length, 1, `${page.slug} must have one title`);
            assert.match(document, /application\/ld\+json/);
            assert.ok(document.length > 12_000, `${page.slug} must include its full content`);
        }
        const integrationDocs = await readFile(path.join(destination, 'dist/docs/integration-api.html'), 'utf8');
        assert.ok(integrationDocs.includes('href="/docs/mcp-platforms"'));
        const mcpDocs = await readFile(path.join(destination, 'dist/docs/mcp-platforms.html'), 'utf8');
        assert.ok(mcpDocs.includes('href="https://github.com/virusz4274/callery/blob/main/integrations/README.md"'));
        assert.match(integrationDocs, /<table\b/);
        assert.match(integrationDocs, /<pre\b/);
        await assert.rejects(readFile(path.join(destination, 'dist/docs/billing.html')));
        for (const slug of ['enable-call-recording-xiaomi-hyperos', 'enable-call-recording-oppo-odialer',
            'enable-call-recording-vivo-iqoo', 'choose-android-dialer-for-call-recording', 'set-up-call-recording-with-ai']) {
            assert.ok(setupIndex.includes(`/guides/${slug}`), `Setup hub should list ${slug}`);
            assert.equal(guideIndex.includes(`/guides/${slug}`), false, 'Setup articles have a separate index from imports.');
            assert.ok(sitemap.includes(`/guides/${slug}`));
            const article = await readFile(path.join(destination, `dist/guides/${slug}.html`), 'utf8');
            const schema = JSON.parse(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(article)![1]);
            const breadcrumb = schema['@graph'].find((node: { '@type': string }) => node['@type'] === 'BreadcrumbList');
            assert.equal(breadcrumb.itemListElement[0].item, 'https://www.fixture-callery.com/call-recording');
            assert.match(article, /Sources and further reading/);
            assert.match(article, /<aside\b[^>]*data-archive-workflow="conditional"[^>]*>/,
                `${slug} must present OEM setup as conditional on original-file access`);
        }
        assert.ok(guideIndex.includes('/guides/find-and-export-samsung-call-recordings'));
        assert.equal(setupIndex.includes('/guides/find-and-export-samsung-call-recordings'), false);
        for (const file of (await readdir(path.join(destination, 'dist/guides'))).filter(file => file.endsWith('.html'))) {
            const guide = await readFile(path.join(destination, 'dist/guides', file), 'utf8');
            const callout = /<aside\b[^>]*data-guide-assistant\b[^>]*>[\s\S]*?<\/aside>/.exec(guide)?.[0];
            assert.ok(callout, `${file} must offer AI instructions`);
            assert.ok(guide.indexOf(callout) < guide.indexOf('data-archive-workflow='), `${file} must offer the choice near the top`);
            assert.match(callout, /Copy AI instructions/);
            assert.match(callout, /data-assistant-prompt\b/);
            assert.ok(callout.includes(`https://www.fixture-callery.com/guides/${file.slice(0, -5)}`),
                `${file} must copy its actual published guide URL`);
            assert.ok(callout.includes('https://www.fixture-callery.com/guides/set-up-call-recording-with-ai'));
            assert.match(callout, /Do not instruct me to root/);
            assert.match(callout, /Do not download, sideload, or install external APKs/);
            assert.match(callout, /install-existing fails.*stop/);
            assert.match(callout, /does not need unrestricted write access/);
        }
        const xiaomi = await readFile(path.join(destination, 'dist/guides/enable-call-recording-xiaomi-hyperos.html'), 'utf8');
        const xiaomiText = xiaomi.replace(/<[^>]*>/g, '');
        assert.match(xiaomiText, /community.reported/i);
        assert.match(xiaomiText, /install-existing/);
        assert.match(xiaomiText, /com\.android\.contacts/);
        assert.match(xiaomiText, /com\.android\.incallui/);
        assert.match(xiaomiText, /rollback|roll back|restore the previous/i);
        assert.ok(xiaomi.includes('https://www.reddit.com/r/HyperOS/comments/1k7ztyg/'));
        assert.match(xiaomiText, /2\.0\.216\.0/);
        assert.match(xiaomiText, /exactly one device entry/);
        assert.match(xiaomiText, /current device firmware is incompatible with this supported Callery setup/);
        assert.doesNotMatch(xiaomiText, /PHONE_SERIAL|adb -s /);
        assert.doesNotMatch(xiaomiText, /adb shell pm uninstall[^\n<]*com\.google\.android\./);
        assert.doesNotMatch(xiaomiText, /adb (?:install|push) |settings put global hidden_api/);
        const modifyingCommands = [...xiaomi.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/g)]
            .flatMap(block => block[0].replace(/<[^>]*>/g, '').split(/\r?\n/).map(line => line.trim()))
            .filter(line => /^adb shell (?:pm (?:install-existing|enable|disable|uninstall|default-state)\b|cmd overlay (?:enable|disable)\b)/.test(line));
        assert.deepEqual(modifyingCommands.slice(0, 2), [
            'adb shell pm install-existing --user 0 com.android.contacts',
            'adb shell pm install-existing --user 0 com.android.incallui',
        ], 'Both restoration commands must precede every other modifying command');
        assert.match(xiaomiText, /Only after both restorations succeed, select and test the Xiaomi dialer/);
        assert.match(xiaomiText, /Package \.\.\. (?:doesn&#39;t|doesn't) exist/);
        assert.match(xiaomiText, /Google Dialer and Contacts stay installed, their data is preserved, and their default selection remains unchanged/);
        for (const slug of ['enable-call-recording-xiaomi-hyperos', 'enable-call-recording-oppo-odialer', 'enable-call-recording-vivo-iqoo']) {
            const guide = await readFile(path.join(destination, `dist/guides/${slug}.html`), 'utf8');
            assert.match(guide, /incoming/i, `${slug} must check normal calling after a dialer change`);
            assert.match(guide, /outgoing/i, `${slug} must check normal calling after a dialer change`);
        }

        const samsung = await readFile(path.join(destination, 'dist/guides/find-and-export-samsung-call-recordings.html'), 'utf8');
        const folderRequirement = /<aside\b[^>]*data-archive-workflow="folder-copy"[^>]*>([\s\S]*?)<\/aside>/.exec(samsung)?.[1];
        assert.ok(folderRequirement, 'Samsung must expose its original-folder workflow to readers');
        const folderHeading = /<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(folderRequirement)?.[1].replace(/<[^>]*>/g, ' ');
        assert.match(folderHeading || '', /copy/i);
        assert.match(folderHeading || '', /original/i);
        assert.match(samsung, /<code\b[^>]*>Recordings\/Call<\/code>/,
            'Samsung instructions must identify the actual recording folder');

        const googlePath = '/guides/export-google-phone-call-recordings';
        const unsupportedSection = /<section\b[^>]*id="unsupported-workflows"[^>]*>([\s\S]*?)<\/section>/.exec(guideIndex)?.[0];
        assert.ok(unsupportedSection, 'The import index must separate unsupported workflows');
        assert.ok(unsupportedSection.includes(googlePath));
        const supportedGroups = [...guideIndex.matchAll(/<section\b[^>]*class="guide-group"[^>]*>([\s\S]*?)<\/section>/g)]
            .map(match => match[0]).filter(section => !section.includes('id="unsupported-workflows"'));
        assert.ok(supportedGroups.length > 0, 'The index should still contain supported folder-copy guides');
        assert.equal(supportedGroups.some(section => section.includes(googlePath)), false,
            'Google Phone must not be listed as a supported manufacturer import guide');
        const google = await readFile(path.join(destination, `dist${googlePath}.html`), 'utf8');
        assert.match(google, /<aside\b[^>]*data-archive-workflow="unsupported"[^>]*>/);
        const googleNext = /<aside\b[^>]*class="guide-next"[^>]*>([\s\S]*?)<\/aside>/.exec(google)?.[1];
        assert.ok(googleNext, 'The Google Phone limitation needs a relevant next step');
        assert.match(googleNext, /href="\/phone-compatibility"/);
        assert.doesNotMatch(googleNext, /href="[^"]*\/signup(?:[?"#]|\/|$)/,
            'The article next step must not promise signup as a solution to unsupported storage');
        const googleSchema = JSON.parse(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(google)![1]);
        const googleArticle = googleSchema['@graph'].find((node: { '@type': string }) => node['@type'] === 'Article');
        const googleBreadcrumb = googleSchema['@graph'].find((node: { '@type': string }) => node['@type'] === 'BreadcrumbList');
        assert.equal(googleBreadcrumb.itemListElement[0].name, 'Unsupported workflows');
        assert.equal(googleBreadcrumb.itemListElement[0].item, 'https://www.fixture-callery.com/guides#unsupported-workflows');
        const googleSource = await readFile(path.join(destination, 'src/content/guides/export-google-phone-call-recordings.md'), 'utf8');
        const googleTitle = /^title: (.+)$/m.exec(googleSource)![1];
        assert.equal(googleArticle.headline, googleTitle, 'Structured data must use the corrected limitation title');
        assert.match(googleArticle.headline, /not supported|limitation/i);
        await assert.rejects(readFile(path.join(destination, 'dist/guides/unpublished-vivo-guide.html')));
        const pricing = await readFile(path.join(destination, 'dist/pricing.html'), 'utf8');
        assert.ok(pricing.includes('rel="canonical" href="https://www.fixture-callery.com/pricing"'));
        assert.match(pricing, /\$12/);
        const schemaText = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(pricing)![1];
        const application = JSON.parse(schemaText)['@graph'].find((node: { '@type': string }) => node['@type'] === 'SoftwareApplication');
        assert.equal(application.offers[0].price, fixture.pricing.plans[0].price);
        const notFound = await readFile(path.join(destination, 'dist/404.html'), 'utf8');
        assert.match(notFound, /name="robots" content="noindex, nofollow"/);

        await writeFile(savedPricing, 'null\n');
        assert.throws(() => build(), /Command failed/);
        await writeFile(savedPricing, JSON.stringify(fixture));
        assert.throws(() => build({ PUBLIC_APP_URL: 'https://other.fixture-callery.com' }), /Command failed/);

        build({ CF_PAGES: '1', CF_PAGES_BRANCH: 'preview-feature' });
        assert.match(await readFile(path.join(destination, 'dist/index.html'), 'utf8'), /name="robots" content="noindex, nofollow"/);

        // Even a valid saved catalog must not leak offers or purchase links into
        // the coming-soon experience, and the launch content can be indexed.
        build({ SITE_LAUNCH_STAGE: 'coming-soon' });
        const comingSoonPricing = await readFile(path.join(destination, 'dist/pricing.html'), 'utf8');
        assert.match(comingSoonPricing, /name="robots" content="noindex, nofollow"/);
        assert.match(comingSoonPricing, /announced/i);
        assert.doesNotMatch(comingSoonPricing, /\$12/);
        const comingSoonSchema = JSON.parse(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(comingSoonPricing)![1]);
        for (const node of comingSoonSchema['@graph']) assert.equal('offers' in node, false);
        const comingSoonSitemap = await readFile(path.join(destination, 'dist/sitemap-0.xml'), 'utf8');
        assert.equal(comingSoonSitemap.includes('/pricing'), false);
        assert.equal(comingSoonSitemap.includes('/404'), false);
        assert.ok(comingSoonSitemap.includes('/search-call-recordings'));
        const htmlFiles = (await readdir(path.join(destination, 'dist'), { recursive: true })).filter(file => file.endsWith('.html'));
        for (const file of htmlFiles) {
            const page = await readFile(path.join(destination, 'dist', file), 'utf8');
            const links = [...page.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]);
            assert.equal(links.some(link => link.startsWith(`${fixture.sourceAppOrigin}/`)), false,
                `${file} must not link to an unopened managed app`);
        }
        const comingSoonHome = await readFile(path.join(destination, 'dist/index.html'), 'utf8');
        assert.match(comingSoonHome, /Launching soon/);
        assert.ok(comingSoonHome.includes('https://www.youtube.com/watch?v=Z4hJoVGuXgw'));
        assert.ok(comingSoonHome.includes('href="/self-host"'));
        assert.match(comingSoonHome, /name="robots" content="index, follow/);
        await writeFile(savedPricing, 'null\n');
        build({ SITE_LAUNCH_STAGE: 'coming-soon' });
        assert.match(await readFile(path.join(destination, 'dist/index.html'), 'utf8'), /name="robots" content="index, follow/);
        await writeFile(savedPricing, JSON.stringify({ ...fixture, sourceAppOrigin: 'https://wrong.fixture-callery.com' }));
        assert.throws(() => build({ SITE_LAUNCH_STAGE: 'coming-soon' }), /Command failed/);
        await writeFile(savedPricing, JSON.stringify({ ...fixture, version: 'not-a-version' }));
        assert.throws(() => build({ SITE_LAUNCH_STAGE: 'coming-soon', SITE_INDEXABLE: 'false' }), /Command failed/);

        // Exercise the actual deploy command offline; fixture prices never touch
        // the saved catalog or configuration in the shared source checkout.
        const buildProduction = (overrides: Record<string, string> = {}) => execFileSync(process.execPath,
            [path.join(destination, 'scripts/build-production.mjs')], {
                cwd: temporary,
                env: { ...environment, SITE_LAUNCH_STAGE: 'coming-soon', SITE_INDEXABLE: 'true', ...overrides },
                encoding: 'utf8', stdio: 'pipe',
            });
        await writeFile(savedPricing, 'null\n');
        buildProduction();
        const productionHtml = await readFile(path.join(destination, 'dist/index.html'), 'utf8');
        assert.ok(productionHtml.includes('rel="canonical" href="https://getcallery.com/"'));
        assert.ok(productionHtml.includes('https://getcallery.com/social-preview.png'));
        assert.equal(productionHtml.includes('href="https://app.getcallery.com/'), false);
        assert.match(productionHtml, /name="robots" content="index, follow/);
        assert.doesNotMatch(await readFile(path.join(destination, 'dist/_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
        assert.ok((await readFile(path.join(destination, 'dist/sitemap-0.xml'), 'utf8')).includes('https://getcallery.com/docs'));
        assert.equal(productionHtml.includes('https://www.fixture-callery.com'), false);
        assert.throws(() => buildProduction({ SITE_LAUNCH_STAGE: 'open' }), /Command failed/);
        await writeFile(savedPricing, JSON.stringify(fixture));
        assert.throws(() => buildProduction({ SITE_LAUNCH_STAGE: 'open' }), /Command failed/);
        assert.throws(() => buildProduction(), /Command failed/, 'A present catalog must match the production app origin');
        await writeFile(savedPricing, 'null\n');
        buildProduction({ CF_PAGES: '1', CF_PAGES_BRANCH: 'preview-feature' });
        assert.match(await readFile(path.join(destination, 'dist/index.html'), 'utf8'), /name="robots" content="noindex, nofollow"/);
        assert.match(await readFile(path.join(destination, 'dist/_headers'), 'utf8'), /X-Robots-Tag: noindex, nofollow/);
        buildProduction({ SITE_INDEXABLE: 'false' });
        assert.match(await readFile(path.join(destination, 'dist/index.html'), 'utf8'), /name="robots" content="noindex, nofollow"/);
    } finally { await rm(temporary, { recursive: true, force: true }); }
});
