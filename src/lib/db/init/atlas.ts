import { embeddingProfile } from '@/lib/search/profile';
import { passageVectorIndexDefinition } from '@/lib/search/readiness';
import { PASSAGES_COLLECTION, PASSAGE_VECTOR_INDEX } from '@/lib/search/passages';
import { logger } from '@/lib/logger';
const ATLAS_SEARCH_INDEX_CONFIG = {
    mappings: {
        dynamic: false,
        fields: {
            authSubject: {
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
    logger.info(`   - Index name: ${PASSAGE_VECTOR_INDEX}`);
    logger.info(`   - Collection: ${PASSAGES_COLLECTION}`);
    logger.info('   - JSON Configuration:');
    try { logger.info(JSON.stringify(passageVectorIndexDefinition(embeddingProfile().dimensions), null, 2)); }
    catch { logger.warn('Configure the embedding model and SEARCH_EMBEDDING_DIMENSIONS before creating the semantic index.'); }
}
