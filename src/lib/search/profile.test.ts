import test from 'node:test';
import assert from 'node:assert/strict';
import { embeddingProfile, validateEmbedding } from './profile';
import { searchEmbeddingDimensions } from '@/lib/config';
import type { Db } from 'mongodb';
import { inspectSearchReadiness, passageVectorIndexDefinition } from './readiness';
import { PASSAGES_COLLECTION, PASSAGE_VECTOR_INDEX } from './passages';

test('embedding space pins model, dimensions, task adapter and chunker instead of width alone', t => {
    const previous = process.env.SEARCH_EMBEDDING_DIMENSIONS;
    t.after(() => { if (previous === undefined) delete process.env.SEARCH_EMBEDDING_DIMENSIONS; else process.env.SEARCH_EMBEDDING_DIMENSIONS = previous; });
    process.env.SEARCH_EMBEDDING_DIMENSIONS = '2';
    const a = embeddingProfile({ provider: 'gemini', model: 'a' }), b = embeddingProfile({ provider: 'gemini', model: 'b' });
    assert.notEqual(a.id, b.id);
    assert.equal(a.countBasis, 'provider_tokenizer');
    assert.throws(() => validateEmbedding([1], a), /2 finite values/);
    assert.throws(() => validateEmbedding([0, 0], a), /2 finite values/);
    assert.throws(() => validateEmbedding([NaN, 1], a), /2 finite values/);
    assert.doesNotThrow(() => validateEmbedding([1, 0], a));
    delete process.env.SEARCH_EMBEDDING_DIMENSIONS;
    assert.equal(searchEmbeddingDimensions('gemini', 'gemini-embedding-001'), 3072);
    assert.throws(() => searchEmbeddingDimensions('gemini', 'custom-model'), /SEARCH_EMBEDDING_DIMENSIONS/);
    assert.throws(() => searchEmbeddingDimensions('openai_compat', 'custom-model'), /SEARCH_EMBEDDING_DIMENSIONS/);
});

test('passage vector index includes every pre-retrieval access and scope constraint', () => {
    const index = passageVectorIndexDefinition(2);
    assert.deepEqual(index.fields[0], { type: 'vector', path: 'vector', numDimensions: 2, similarity: 'cosine' });
    for (const path of ['owner', 'profileId', 'contactId', 'recordedAt', 'isArchived', 'published']) assert.ok(index.fields.some(field => field.path === path));
});

test('readiness rejects indexes with incompatible vectors or missing scope filters', async t => {
    const saved = { dimensions: process.env.SEARCH_EMBEDDING_DIMENSIONS, provider: process.env.AI_PROVIDER };
    t.after(() => {
        for (const [key, value] of Object.entries({ SEARCH_EMBEDDING_DIMENSIONS: saved.dimensions, AI_PROVIDER: saved.provider })) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
    process.env.SEARCH_EMBEDDING_DIMENSIONS = '2'; process.env.AI_PROVIDER = 'gemini';
    const inspect = (definition: unknown, queryable = true) => inspectSearchReadiness({ collection(name: string) {
        assert.equal(name, PASSAGES_COLLECTION);
        return { listSearchIndexes(index: string) {
            assert.equal(index, PASSAGE_VECTOR_INDEX);
            return { async toArray() { return [{ queryable, latestDefinition: definition }]; } };
        } };
    } } as unknown as Db);
    assert.equal((await inspect(passageVectorIndexDefinition(2))).ready, true);
    assert.equal((await inspect(passageVectorIndexDefinition(2), false)).ready, false);
    assert.equal((await inspect(passageVectorIndexDefinition(3))).ready, false);
    for (const vector of [{ type: 'filter' }, { similarity: 'dotProduct' }, { similarity: 'euclidean' }]) {
        const definition = passageVectorIndexDefinition(2);
        Object.assign(definition.fields[0], vector);
        assert.equal((await inspect(definition)).ready, false);
    }
    for (const path of ['owner', 'profileId', 'contactId', 'recordedAt', 'isArchived', 'published']) {
        const definition = passageVectorIndexDefinition(2);
        definition.fields = definition.fields.filter(field => field.path !== path);
        assert.equal((await inspect(definition)).ready, false, `Missing ${path} filter must fail readiness`);
        definition.fields.push({ type: 'vector', path });
        assert.equal((await inspect(definition)).ready, false, `${path} must be a filter field`);
    }
});
