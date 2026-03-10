const ATLAS_SEARCH_INDEX_CONFIG = {
    mappings: {
        dynamic: false,
        fields: {
            firebaseUid: {
                type: 'string',
            },
            summary: {
                type: 'string',
            },
            contactName: {
                type: 'string',
            },
            fileName: {
                type: 'string',
            },
            fullTranscript: {
                type: 'document',
                fields: {
                    text: {
                        type: 'string',
                    },
                },
            },
            tags: {
                type: 'string',
            },
            standardizedDisplayName: {
                type: 'string',
            },
        },
    },
};

const ATLAS_VECTOR_INDEX_CONFIG = {
    fields: [
        {
            numDimensions: 3072,
            path: 'summaryEmbedding',
            similarity: 'cosine',
            type: 'vector',
        },
        {
            path: 'firebaseUid',
            type: 'filter',
        },
    ],
};

export function printAtlasIndexInstructions() {
    console.log('');
    console.log('📝 Note: For Atlas Search and Vector Search, create indexes manually in MongoDB Atlas UI:');
    console.log('');
    console.log('1. Atlas Search Index (for keyword/full-text search):');
    console.log('   - Index name: recordings_text_search');
    console.log('   - Collection: recordings');
    console.log('   - JSON Configuration:');
    console.log(JSON.stringify(ATLAS_SEARCH_INDEX_CONFIG, null, 2));
    console.log('');
    console.log('2. Atlas Vector Search Index (for semantic search):');
    console.log('   - Index name: recordings_vector_search');
    console.log('   - Collection: recordings');
    console.log('   - JSON Configuration:');
    console.log(JSON.stringify(ATLAS_VECTOR_INDEX_CONFIG, null, 2));
}
