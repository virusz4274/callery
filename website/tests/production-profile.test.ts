import test from 'node:test';
import assert from 'node:assert/strict';
import { productionEnvironment, productionProfile } from '../scripts/build-production.mjs';

test('the committed production profile contains only the two public origins', () => {
    assert.deepEqual(productionProfile, {
        websiteOrigin: 'https://getcallery.com',
        appOrigin: 'https://app.getcallery.com',
    });
});

test('production builds pin hosted origins without mutating inherited deployment settings', () => {
    const inherited = {
        NEXT_PUBLIC_APP_URL: 'https://self-host.fixture-callery.com',
        SITE_URL: 'https://other.fixture-callery.com',
        PUBLIC_APP_URL: 'https://other-app.fixture-callery.com',
        CF_PAGES: '1',
        CF_PAGES_BRANCH: 'preview-feature',
    };
    const unchanged = { ...inherited };
    const environment = productionEnvironment(inherited);
    assert.equal(environment.SITE_URL, 'https://getcallery.com');
    assert.equal(environment.PUBLIC_APP_URL, 'https://app.getcallery.com');
    assert.equal(environment.NEXT_PUBLIC_APP_URL, inherited.NEXT_PUBLIC_APP_URL);
    assert.equal(environment.CF_PAGES_BRANCH, inherited.CF_PAGES_BRANCH);
    assert.equal(environment.SITE_INDEXABLE, 'true');
    assert.equal(environment.SITE_LAUNCH_STAGE, 'coming-soon');
    assert.deepEqual(inherited, unchanged);
    assert.equal(productionEnvironment({ SITE_INDEXABLE: 'true' }).SITE_INDEXABLE, 'true');
    assert.equal(productionEnvironment({ SITE_INDEXABLE: 'false' }).SITE_INDEXABLE, 'false');
    assert.equal(productionEnvironment({ SITE_LAUNCH_STAGE: 'open' }).SITE_LAUNCH_STAGE, 'open');
});
