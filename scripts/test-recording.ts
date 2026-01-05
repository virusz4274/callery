#!/usr/bin/env tsx

/**
 * Create a test recording to verify upload flow
 */

import 'dotenv/config';
import { createRecording } from '../src/lib/db/recordings';

async function createTestRecording() {
    console.log('📝 Creating test recording...\n');

    try {
        const testRecording = await createRecording({
            firebaseUid: 'test-user-123',
            contactId: null,
            contactName: 'John Doe',
            phoneNumber: '+1-555-0123',
            r2Key: 'test-user-123/2026/01/test_recording.mp3',
            fileName: 'test_recording.mp3',
            fileSize: 1024000, // ~1MB
            mimeType: 'audio/mpeg',
            duration: 120, // 2 minutes
            recordedAt: new Date(),
            transcriptionStatus: 'pending',
            transcriptSnippet: '',
            transcript: '',
            tags: ['test'],
            isStarred: false,
            isArchived: false,
        });

        console.log('✅ Test recording created successfully!');
        console.log('   ID:', testRecording._id.toString());
        console.log('   Contact:', testRecording.contactName);
        console.log('   Phone:', testRecording.phoneNumber);
        console.log('   Duration:', testRecording.duration, 'seconds');
        console.log('   File:', testRecording.fileName);
        console.log('\n✅ Database write successful - recordings collection is working!\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating test recording:', error);
        process.exit(1);
    }
}

createTestRecording();
