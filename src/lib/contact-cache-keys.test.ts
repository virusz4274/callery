import test from 'node:test';
import assert from 'node:assert/strict';
import { unstable_serialize } from 'swr/infinite';
import { contactPageKey, isContactDependentCacheKey, ownedContactListKeys } from './contact-cache-keys';

test('contact sync invalidation recognizes only the authenticated owner', () => {
    const keys = [contactPageKey('owner', 'query', 0), ['contact-detail', 'owner', 'id'], ['recordings', 'owner', {}],
        ['filesystem', 'owner'], ['recording-details', 'owner', 'id'], ['/api/contacts?limit=1&skip=0', 'owner']];
    for (const key of keys) {
        assert.equal(isContactDependentCacheKey(key, 'owner'), true);
        assert.equal(isContactDependentCacheKey(key, 'another'), false);
    }
    assert.equal(isContactDependentCacheKey('/api/contacts?limit=20', 'owner'), false);
    assert.equal(isContactDependentCacheKey(['contact-detail', 'owner-other', 'id'], 'owner'), false);
});

test('contact infinite-list aggregates are derived from exact owned page metadata', () => {
    const cache = new Map<string, { _k?: unknown }>([
        ['owner-page-0', { _k: contactPageKey('owner', '', 0) }],
        ['owner-page-1', { _k: contactPageKey('owner', '', 1) }],
        ['owner-search', { _k: contactPageKey('owner', 'A,quote"', 0) }],
        ['other-owner', { _k: contactPageKey('owner-other', '', 0) }],
        ['$inf$owner-in-name', { _k: 'opaque aggregate' }],
    ]);
    assert.deepEqual(ownedContactListKeys(cache, 'owner'), [
        unstable_serialize(() => contactPageKey('owner', '', 0)),
        unstable_serialize(() => contactPageKey('owner', 'A,quote"', 0)),
    ]);
});
