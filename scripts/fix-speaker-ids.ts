#!/usr/bin/env tsx

/**
 * Migration Script: Fix Speaker ID Format
 * 
 * This script updates existing transcription segments to convert speaker IDs
 * from the old format ("speaker_0", "speaker_1") to the new display format
 * ("Speaker 0", "Speaker 1").
 * 
 * Usage: npx tsx scripts/fix-speaker-ids.ts
 * 
 * Options:
 *   --dry-run    Preview changes without modifying the database
 */

import 'dotenv/config';
import { getMongoDb, getMongoClient, Collections } from '../src/lib/mongodb';
import type { TranscriptionSegment } from '../src/lib/db/types';

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Format speaker ID from API format to display format.
 * Converts "speaker_0" to "Speaker 0", "speaker_1" to "Speaker 1", etc.
 */
function formatSpeakerId(speakerId: string): string {
    if (!speakerId) return 'Unknown';
    // Handle "speaker_0" format -> "Speaker 0"
    const match = speakerId.match(/^speaker_(\d+)$/i);
    if (match) {
        return `Speaker ${match[1]}`;
    }
    // Return as-is if already in correct format or unknown format
    return speakerId;
}

/**
 * Check if a speaker ID needs to be migrated
 */
function needsMigration(speakerId: string): boolean {
    return /^speaker_\d+$/i.test(speakerId);
}

async function migrateRecordings() {
    console.log('🔧 Speaker ID Migration Script\n');

    if (DRY_RUN) {
        console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    try {
        await getMongoClient();
        console.log('✅ MongoDB connection successful\n');

        const db = await getMongoDb();
        const recordingsCollection = db.collection(Collections.RECORDINGS);

        // Find all recordings with fullTranscript
        const recordings = await recordingsCollection.find({
            fullTranscript: { $exists: true, $ne: null, $not: { $size: 0 } }
        }).toArray();

        console.log(`📊 Found ${recordings.length} recordings with transcripts\n`);

        let totalUpdated = 0;
        let totalSegmentsFixed = 0;

        for (const recording of recordings) {
            const segments: TranscriptionSegment[] = recording.fullTranscript || [];
            let needsUpdate = false;
            let segmentsFixed = 0;

            const updatedSegments = segments.map(segment => {
                if (needsMigration(segment.speakerId)) {
                    needsUpdate = true;
                    segmentsFixed++;
                    return {
                        ...segment,
                        speakerId: formatSpeakerId(segment.speakerId)
                    };
                }
                return segment;
            });

            if (needsUpdate) {
                console.log(`📝 Recording ${recording._id}:`);
                console.log(`   Contact: ${recording.contactName || recording.phoneNumber}`);
                console.log(`   Segments to fix: ${segmentsFixed}`);

                // Show sample of changes
                const sampleOld = segments.find(s => needsMigration(s.speakerId));
                const sampleNew = updatedSegments.find(s => s.speakerId.startsWith('Speaker'));
                if (sampleOld && sampleNew) {
                    console.log(`   Before: "${sampleOld.speakerId}" → After: "${sampleNew.speakerId}"`);
                }

                if (!DRY_RUN) {
                    await recordingsCollection.updateOne(
                        { _id: recording._id },
                        { $set: { fullTranscript: updatedSegments } }
                    );
                    console.log(`   ✅ Updated\n`);
                } else {
                    console.log(`   ⏭️  Would update (dry-run)\n`);
                }

                totalUpdated++;
                totalSegmentsFixed += segmentsFixed;
            }
        }

        console.log('\n📈 Summary:');
        console.log(`   Recordings scanned: ${recordings.length}`);
        console.log(`   Recordings ${DRY_RUN ? 'to update' : 'updated'}: ${totalUpdated}`);
        console.log(`   Segments ${DRY_RUN ? 'to fix' : 'fixed'}: ${totalSegmentsFixed}`);

        if (DRY_RUN && totalUpdated > 0) {
            console.log('\n💡 Run without --dry-run to apply changes');
        }

        console.log('\n✅ Migration complete');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

migrateRecordings();
