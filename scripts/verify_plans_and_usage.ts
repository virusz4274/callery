import 'dotenv/config'; // Load .env file
import { getMongoDb, Collections } from '../src/lib/mongodb';
import { createUser, checkAndResetUsageCycle } from '../src/lib/db/users';
import { checkStorageAccess, checkTranscriptionAccess } from '../src/lib/access-control';
import { User } from '../src/lib/db/types';

async function runVerification() {
    console.log('🧪 Starting Plan & Usage Verification...');
    const db = await getMongoDb();
    const users = db.collection<User>(Collections.USERS);

    const testUidBase = 'test_verify_user_';
    const cleanUp = async () => {
        await users.deleteMany({ authSubject: { $regex: `^${testUidBase}` } });
    };

    try {
        await cleanUp(); // Clean start

        // --- Scenario 1: New Trial User (Should Work) ---
        console.log('\n--- Scenario 1: Active Trial User ---');
        const user1 = await createUser({
            authSubject: `${testUidBase}1`,
            email: 'test1@example.com',
            name: 'Test Trial',
            firstName: 'Test',
            lastName: 'Trial',
            phoneNumber: '',
            role: 'user',
            plan: 'Free Trial',
            storageUsed: 0,
            storageAllocation: 100 * 1024 * 1024, // 100MB
            transcriptionUsed: 0,
            transcriptionAllocation: 600, // 10 mins
            notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
            transcriptionSettings: { autoTranscribe: true },
            storageSettings: { deletionPolicy: 'never' },
            totalContacts: 0,
            totalRecordings: 0,
            totalDuration: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days active
            createdAt: new Date(), updatedAt: new Date()
        } as any); // Casting partly due to strict types vs default values

        const access1_Storage = checkStorageAccess(user1, 10 * 1024 * 1024); // +10MB
        console.log(`Storage (Used 0 + 10MB / Alloc 100MB): ${access1_Storage.allowed ? '✅ Allowed' : '❌ Blocked'}`);
        if (!access1_Storage.allowed) throw new Error('New Trial user should upload');

        const access1_Trans = checkTranscriptionAccess(user1, 60); // +60s
        console.log(`Transcribe (Used 0 + 60s / Alloc 600s): ${access1_Trans.allowed ? '✅ Allowed' : '❌ Blocked'}`);
        if (!access1_Trans.allowed) throw new Error('New Trial user should transcribe');


        // --- Scenario 2: Expired Trial User (Should Block) ---
        console.log('\n--- Scenario 2: Expired Trial User ---');
        const user2 = await createUser({
            authSubject: `${testUidBase}2`,
            email: 'test2@example.com',
            name: 'Test Expired',
            firstName: 'Test',
            lastName: 'Expired',
            phoneNumber: '',
            role: 'user',
            plan: 'Free Trial',
            storageUsed: 0,
            storageAllocation: 100 * 1024 * 1024,
            transcriptionUsed: 0,
            transcriptionAllocation: 600,
            notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
            transcriptionSettings: { autoTranscribe: true },
            storageSettings: { deletionPolicy: 'never' },
            totalContacts: 0, totalRecordings: 0, totalDuration: 0,
            trialEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired 1 day ago
            createdAt: new Date(), updatedAt: new Date()
        } as any);

        const access2_Storage = checkStorageAccess(user2, 1024);
        console.log(`Storage (Expired): ${!access2_Storage.allowed ? '✅ Blocked' : '❌ Allowed (Fail)'} - Reason: ${access2_Storage.reason}`);
        if (access2_Storage.allowed) throw new Error('Expired user should NOT upload');


        // --- Scenario 3: Trial User Limit Exceeded (Should Block) ---
        console.log('\n--- Scenario 3: Trial User Over Limit ---');
        const user3 = await createUser({
            authSubject: `${testUidBase}3`,
            email: 'test3@example.com',
            name: 'Test Full',
            firstName: 'Test',
            lastName: 'Full',
            phoneNumber: '',
            role: 'user',
            plan: 'Free Trial',
            storageUsed: 95 * 1024 * 1024, // 95MB used
            storageAllocation: 100 * 1024 * 1024, // 100MB alloc
            transcriptionUsed: 590, // 590s used
            transcriptionAllocation: 600, // 600s alloc
            notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
            transcriptionSettings: { autoTranscribe: true },
            storageSettings: { deletionPolicy: 'never' },
            totalContacts: 0, totalRecordings: 0, totalDuration: 0,
            trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdAt: new Date(), updatedAt: new Date()
        } as any);

        const access3_Storage = checkStorageAccess(user3, 10 * 1024 * 1024); // Try add 10MB -> 105MB (>100)
        console.log(`Storage (95+10 > 100): ${!access3_Storage.allowed ? '✅ Blocked' : '❌ Allowed (Fail)'} - Reason: ${access3_Storage.reason}`);
        if (access3_Storage.allowed) throw new Error('Trial user over limit should be blocked');

        const access3_Trans = checkTranscriptionAccess(user3, 20); // Try add 20s -> 610s (>600)
        console.log(`Transcribe (590+20 > 600): ${!access3_Trans.allowed ? '✅ Blocked' : '❌ Allowed (Fail)'} - Reason: ${access3_Trans.reason}`);
        if (access3_Trans.allowed) throw new Error('Trial user over transcription limit should be blocked');


        // --- Scenario 4: Paid User - Overage DISABLED (Should BLOCK) ---
        console.log('\n--- Scenario 4a: Paid User - Overage DISABLED (Defaults) ---');
        const user4 = await createUser({
            authSubject: `${testUidBase}4`,
            email: 'test4@example.com',
            name: 'Test Pro Strict',
            firstName: 'Test',
            lastName: 'Pro',
            phoneNumber: '',
            role: 'user',
            plan: 'Pro Plan', // Paid
            storageUsed: 150 * 1024 * 1024, // 150MB used
            storageAllocation: 100 * 1024 * 1024, // 100MB alloc
            transcriptionUsed: 700, // 700s used
            transcriptionAllocation: 600, // 600s alloc
            notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
            transcriptionSettings: { autoTranscribe: true },
            storageSettings: { deletionPolicy: 'never' },
            billingSettings: { allowOverage: false }, // Explicitly disabled
            totalContacts: 0, totalRecordings: 0, totalDuration: 0,
            trialEndsAt: null,
            createdAt: new Date(), updatedAt: new Date()
        } as any);

        const access4a_Storage = checkStorageAccess(user4, 10 * 1024 * 1024);
        console.log(`Storage (Paid Strict): ${!access4a_Storage.allowed ? '✅ Blocked' : '❌ Allowed (Fail)'} - Reason: ${access4a_Storage.reason}`);
        if (access4a_Storage.allowed) throw new Error('Paid user strictly limited should be blocked');


        // --- Scenario 4b: Paid User - Overage ENABLED (Should ALLOW) ---
        console.log('\n--- Scenario 4b: Paid User - Overage ENABLED ---');
        // Enable Overage manually
        user4.billingSettings.allowOverage = true;

        const access4b_Storage = checkStorageAccess(user4, 10 * 1024 * 1024);
        console.log(`Storage (Paid Overage ON): ${access4b_Storage.allowed ? '✅ Allowed (Metered)' : '❌ Blocked'}`);
        if (!access4b_Storage.allowed) throw new Error('Paid user with Overage enabled should be allowed');


        // --- Scenario 5: Usage Cycle Reset ---
        // Paid user with overdue cycle
        console.log('\n--- Scenario 5: Usage Cycle Reset ---');
        const user5 = await createUser({
            authSubject: `${testUidBase}5`,
            email: 'test5@example.com',
            name: 'Test Reset',
            firstName: 'Test',
            lastName: 'Reset',
            phoneNumber: '',
            role: 'user',
            plan: 'Pro Plan',
            storageUsed: 50,
            storageAllocation: 100,
            transcriptionUsed: 500, // High usage
            transcriptionAllocation: 600,
            notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
            transcriptionSettings: { autoTranscribe: true },
            storageSettings: { deletionPolicy: 'never' },
            totalContacts: 0, totalRecordings: 0, totalDuration: 0,
            stripeCurrentPeriodEnd: new Date(Date.now() - 1000), // Period ended 1s ago
            createdAt: new Date(), updatedAt: new Date()
        } as any);

        console.log('Checking cycle reset...');
        const updatedUser5 = await checkAndResetUsageCycle(user5);

        console.log(`Old Transcription Used: ${user5.transcriptionUsed}`);
        console.log(`New Transcription Used: ${updatedUser5.transcriptionUsed}`);
        console.log(`Cycle Reset: ${updatedUser5.transcriptionUsed === 0 ? '✅ Yes' : '❌ No'}`);

        if (updatedUser5.transcriptionUsed !== 0) throw new Error('Usage cycle did not reset');
        if (updatedUser5.stripeCurrentPeriodEnd!.getTime() <= Date.now()) throw new Error('Period End date did not update');


        console.log('\n✅ VERIFICATION SUCCESSFUL: All scenarios passed.');

    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error);
        process.exit(1);
    } finally {
        await cleanUp();
        process.exit(0);
    }
}

runVerification();
