#!/usr/bin/env tsx

/**
 * Debug script to inspect transcript data in MongoDB
 */

import 'dotenv/config';
import { getMongoDb, Collections } from '../src/lib/mongodb';

async function checkTranscripts() {
    console.log('🔍 Checking transcript data in MongoDB...\n');

    const db = await getMongoDb();
    const recordings = await db.collection(Collections.RECORDINGS).find({
        fullTranscript: { $exists: true, $ne: null }
    }).limit(3).toArray();

    console.log(`Found ${recordings.length} recordings with transcripts\n`);

    for (const rec of recordings) {
        console.log('='.repeat(60));
        console.log('Recording ID:', rec._id.toString());
        console.log('Contact:', rec.contactName || rec.phoneNumber);
        console.log('Status:', rec.transcriptionStatus);
        console.log('Language:', rec.languageCode);
        console.log('Transcript type:', typeof rec.fullTranscript);
        console.log('Is Array:', Array.isArray(rec.fullTranscript));
        console.log('Segment count:', rec.fullTranscript?.length || 0);

        if (rec.fullTranscript && Array.isArray(rec.fullTranscript) && rec.fullTranscript.length > 0) {
            console.log('\n📝 First 2 segments:');
            rec.fullTranscript.slice(0, 2).forEach((seg: any, i: number) => {
                console.log(`\n  Segment ${i}:`);
                console.log(`    speakerId: "${seg.speakerId}" (type: ${typeof seg.speakerId})`);
                console.log(`    text: "${seg.text?.substring(0, 50)}..."`);
                console.log(`    start: ${seg.start}`);
                console.log(`    end: ${seg.end}`);
                console.log(`    words count: ${seg.words?.length || 0}`);
                if (seg.words && seg.words.length > 0) {
                    console.log(`    first word speaker_id: "${seg.words[0].speaker_id}"`);
                }
            });
        } else {
            console.log('\n⚠️  fullTranscript is empty or not an array');
            console.log('Raw value:', JSON.stringify(rec.fullTranscript)?.substring(0, 200));
        }
        console.log('\n');
    }

    process.exit(0);
}

checkTranscripts().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
