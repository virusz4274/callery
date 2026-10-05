import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { mergeSearchResults, type SearchResult } from './search';

function createSearchResult(id: string, searchScore: number): SearchResult {
    return {
        _id: new ObjectId(id),
        authSubject: 'user_1',
        contactId: null,
        contactName: null,
        phoneNumber: '',
        normalizedPhoneNumber: '',
        r2Key: '',
        fileName: '',
        standardizedDisplayName: '',
        fileSize: 0,
        mimeType: '',
        duration: 0,
        recordedAt: new Date('2024-01-01T00:00:00.000Z'),
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        transcriptionStatus: 'completed',
        tags: [],
        isStarred: false,
        isArchived: false,
        searchScore,
    };
}

test('mergeSearchResults keeps vector-ranked results first and appends keyword-only matches', () => {
    const keywordOnly = createSearchResult('507f1f77bcf86cd799439011', 2);
    const shared = createSearchResult('507f1f77bcf86cd799439012', 2);
    const vectorTop = createSearchResult('507f1f77bcf86cd799439013', 0.92);

    const merged = mergeSearchResults([keywordOnly, shared], [vectorTop, shared]);

    assert.deepEqual(
        merged.map((result) => result._id.toString()),
        [
            vectorTop._id.toString(),
            shared._id.toString(),
            keywordOnly._id.toString(),
        ]
    );
});
