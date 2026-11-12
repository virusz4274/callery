import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../dist/', import.meta.url));
async function filesWithin(directory) {
    return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? filesWithin(file) : [file];
    }))).flat();
}

const files = await filesWithin(directory);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const htmlByFile = new Map(await Promise.all(htmlFiles.map(async file => [file, await readFile(file, 'utf8')])));
assert.ok(htmlFiles.length >= 12, 'Expected the public pages and initial guides.');
const homepage = await readFile(path.join(directory, 'index.html'), 'utf8');
const canonical = /<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/.exec(homepage)
    || /<link\b[^>]*href="([^"]+)"[^>]*rel="canonical"/.exec(homepage);
assert.ok(canonical, 'Homepage canonical is missing.');
const origin = new URL(canonical[1]).origin;
let verifiedLinks = 0;
for (const file of htmlFiles) {
    const html = htmlByFile.get(file);
    assert.match(html, /<html\b[^>]*lang="en"/);
    assert.match(html, /<title>[^<]+<\/title>/);
    assert.match(html, /name="description"/);
    assert.match(html, /<main\b/);
    assert.match(html, /property="og:image"/);
    for (const [, data] of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        const schema = JSON.parse(data);
        assert.equal(schema['@context'], 'https://schema.org');
    }
    const pageUrl = new URL(path.relative(directory, file).split(path.sep).join('/'), `${origin}/`);
    for (const [, attribute] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(attribute.replaceAll('&amp;', '&'), pageUrl);
        if (url.origin !== origin || !url.pathname.startsWith('/') || url.pathname === '/404') continue;
        const local = path.join(directory, decodeURIComponent(url.pathname));
        const candidates = [local, `${local}.html`, path.join(local, 'index.html')];
        const matches = await Promise.all(candidates.map(candidate => stat(candidate).then(info => info.isFile(), () => false)));
        assert.ok(matches.some(Boolean),
            `Broken local asset/link ${attribute} in ${path.relative(directory, file)}`);
        const targetHtml = htmlByFile.get(candidates[matches.indexOf(true)]);
        if (url.hash && targetHtml) {
            const id = decodeURIComponent(url.hash.slice(1));
            assert.ok([...targetHtml.matchAll(/\bid="([^"]+)"/g)].some(([, value]) => value === id),
                `Broken local fragment ${attribute} in ${path.relative(directory, file)}`);
        }
        verifiedLinks++;
    }
}
const sitemapIndex = await readFile(path.join(directory, 'sitemap-index.xml'), 'utf8');
assert.ok(sitemapIndex.includes(origin));
const robots = await readFile(path.join(directory, 'robots.txt'), 'utf8');
const headers = await readFile(path.join(directory, '_headers'), 'utf8');
if (robots.includes('Disallow: /')) {
    assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
    assert.match(homepage, /name="robots"[^>]*content="noindex, nofollow"/);
} else {
    assert.ok(robots.includes(`${origin}/sitemap-index.xml`));
}
assert.equal(files.some(file => /(?:^|\/)(?:sw\.js|manifest\.json)$/.test(file)), false,
    'App PWA assets do not belong in the marketing build.');
console.log(`Verified ${htmlFiles.length} static pages, JSON-LD, sitemap, robots, and ${verifiedLinks} local links/assets.`);
