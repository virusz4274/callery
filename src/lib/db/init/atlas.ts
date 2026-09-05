import { logger } from '@/lib/logger';
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
        {
            path: 'isArchived',
            type: 'filter',
        },
    ],
};

export function printAtlasIndexInstructions() {
    logger.info('');
    logger.info('📝 Note: For Atlas Search and Vector Search, create indexes manually in MongoDB Atlas UI:');
    logger.info('');
    logger.info('1. Atlas Search Index (for keyword/full-text search):');
    logger.info('   - Index name: recordings_text_search');
    logger.info('   - Collection: recordings');
    logger.info('   - JSON Configuration:');
    logger.info(JSON.stringify(ATLAS_SEARCH_INDEX_CONFIG, null, 2));
    logger.info('');
    logger.info('2. Atlas Vector Search Index (for semantic search):');
    logger.info('   - Index name: recordings_vector_search');
    logger.info('   - Collection: recordings');
    logger.info('   - JSON Configuration:');
    logger.info(JSON.stringify(ATLAS_VECTOR_INDEX_CONFIG, null, 2));
}
