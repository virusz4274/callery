import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { rewriteDocumentationLink } from '../src/lib/documentation-links';

const source = fileURLToPath(new URL('../../docs/setup-guide.md', import.meta.url));
const repository = 'https://github.com/virusz4274/callery';

test('published documentation links stay on the website and retain fragments', () => {
    assert.equal(rewriteDocumentationLink('./integration-api.md?view=example#credentials-and-permissions', source),
        '/docs/integration-api?view=example#credentials-and-permissions');
    assert.equal(rewriteDocumentationLink(`${repository}/blob/main/docs/recording-filenames.md#samsung`, source),
        '/docs/recording-filenames#samsung');
    assert.equal(rewriteDocumentationLink('#search-setup', source), '#search-setup');
});

test('unpublished engineering documentation and source links retain GitHub destinations', () => {
    assert.equal(rewriteDocumentationLink('billing.md#setup', source), `${repository}/blob/main/docs/billing.md#setup`);
    assert.equal(rewriteDocumentationLink('../integrations/README.md', source), `${repository}/blob/main/integrations/README.md`);
    assert.equal(rewriteDocumentationLink('../src/lib/config.ts', source), `${repository}/blob/main/src/lib/config.ts`);
    assert.equal(rewriteDocumentationLink('https://example.org/help', source), 'https://example.org/help');
    assert.equal(rewriteDocumentationLink('/guides', source), '/guides');
});

test('non-repository relative links are left for their original renderer', () => {
    assert.equal(rewriteDocumentationLink('next-guide.md', fileURLToPath(new URL('../src/content/guides/example.md', import.meta.url))), 'next-guide.md');
});
