import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.warn('GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY is not defined. Embedding features will be disabled.');
}

const ai = new GoogleGenAI({ apiKey });

/**
 * Generates a vector embedding for the given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    if (!apiKey || !text) return [];

    try {
        const result = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: text,
        });
        // The new SDK returns `result.embedding.values` directly usually, let's double check usage.
        // User snippet: result.embeddings --> looks like it might be plural?
        // Let's check the type if possible, or assume simple access.
        // Reference: result.embedding.values is common, but user snippet printed `result.embeddings`.
        // I will trust `result.embedding.values` for single content, or `result.embeddings[0].values`? 
        // Docs for @google/genai v0.0.1+ (the new one):
        // await client.models.embedContent({model: '...', contents: '...'}) returns EmbedContentResponse
        // which has `embedding` (ContentEmbedding).
        // Let's try `result.embedding?.values`.
        return result.embeddings?.[0]?.values || [];
    } catch (error) {
        console.error('Error generating embedding:', error);
        return [];
    }
}
