import test from 'node:test';
import assert from 'node:assert/strict';

import { ensureTestEnv } from '@/test/env-test-setup';
import {
    normalizeContactName,
    normalizeContactPhoneNumber,
    normalizeGoogleContactInput,
} from '@/lib/db/contacts/normalize';

ensureTestEnv();

test('normalizes contact names for case-insensitive Google-backed lookup', () => {
    assert.equal(normalizeContactName('  Achan   Joseph  '), 'achan joseph');
});

test('normalizes phone numbers without inferring a country code', () => {
    assert.equal(normalizeContactPhoneNumber('+91 93530 96358'), '+919353096358');
    assert.equal(normalizeContactPhoneNumber('8606-197-662'), '8606197662');
});

test('builds normalized Google contact fields without changing display casing', () => {
    const normalized = normalizeGoogleContactInput({
        googleContactId: 'people/123',
        name: 'Achan',
        phoneNumbers: ['+91 93530 96358', '+91 93530 96358'],
        email: null,
        company: 'Vosift',
        jobTitle: 'Founder',
    });

    assert.deepEqual(normalized, {
        googleContactId: 'people/123',
        name: 'Achan',
        normalizedName: 'achan',
        phoneNumbers: ['+91 93530 96358'],
        normalizedPhoneNumbers: ['+919353096358'],
        firstName: 'Achan',
        lastName: '',
        email: '',
        company: 'Vosift',
        jobTitle: 'Founder',
    });
});
