'use server';

import { after } from 'next/server';
import { z } from 'zod';
import { ObjectId, type Db } from 'mongodb';
import { getAuthSubjectFromSession } from '@/lib/auth-utils';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { integrationDb } from '@/lib/integrations/database';
import { enqueueSearchIndex, processTranscriptionJobs, type IngestionJob } from '@/lib/integrations/jobs';
import type { Recording } from '@/lib/db/types';
import { assertSearchIndexingAccess } from '@/lib/search/reindex';
import { embeddingProfile } from '@/lib/search/profile';
import { inspectSearchReadiness } from '@/lib/search/readiness';
import { recordingSearchFilter } from '@/lib/search/retrieval';
import type { SearchIndexingScope, SearchIndexingStatus } from '@/lib/search/types';
import { logger } from '@/lib/logger';

const Scope = z.object({ contactId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    startDate: z.iso.date().optional(), endDate: z.iso.date().optional() }).strict();
const BATCH_SIZE = 100;

function candidates(owner: string, scope: SearchIndexingScope, profileId: string) {
    return { ...recordingSearchFilter(owner, scope), 'fullTranscript.0': { $exists: true }, transcriptionStatus: 'completed' as const,
        transcriptionEnrichmentPending: { $ne: true }, transcriptionQueuedJobId: { $exists: false },
        $or: [{ 'searchIndex.profileId': { $ne: profileId } }, { 'searchIndex.state': { $ne: 'ready' } }] };
}

async function availableCandidates(owner: string, scope: SearchIndexingScope, profileId: string, db: Db) {
    // Already admitted and operator-review work must not occupy every slot in
    // the next bounded batch, starving later recordings in a large archive.
    const busy = await db.collection<IngestionJob>('integration_jobs').find({ owner, kind: 'search_index', searchProfileId: profileId,
        $or: [{ state: { $in: ['pending', 'running', 'submitted', 'needs_review'] } },
            { state: 'failed', 'processingStatus.retryAction': 'contact_admin' }] }).project<{ recordingId: string; searchTranscriptRevision?: string }>({ recordingId: 1, searchTranscriptRevision: 1 }).toArray();
    const ids = busy.filter(job => ObjectId.isValid(job.recordingId)).map(job => new ObjectId(job.recordingId));
    return { ...candidates(owner, scope, profileId), ...(ids.length ? { _id: { $nin: ids } } : {}) };
}

export async function getSearchIndexingStatusAction(scope: SearchIndexingScope = {}, expectedOwner?: string): Promise<{ success: true; status: SearchIndexingStatus } | { success: false; error: string }> {
    try {
        const owner = await getAuthSubjectFromSession();
        if (!owner) return { success: false, error: 'Sign in to manage search indexing.' };
        if (owner !== expectedOwner) return { success: false, error: 'The signed-in account changed. Refresh before managing indexing.' };
        const parsed = Scope.safeParse(scope);
        if (!parsed.success) return { success: false, error: 'Choose valid contact and date filters.' };
        const db = await getMongoDb(), profile = embeddingProfile();
        const jobs = db.collection<IngestionJob>('integration_jobs');
        const match = { owner, kind: 'search_index' as const, searchProfileId: profile.id };
        const availableFilter = await availableCandidates(owner, parsed.data, profile.id, db);
        const [eligible, available, queued, running, needsReview, readiness] = await Promise.all([
            db.collection<Recording>(Collections.RECORDINGS).countDocuments(candidates(owner, parsed.data, profile.id)),
            db.collection<Recording>(Collections.RECORDINGS).countDocuments(availableFilter),
            jobs.countDocuments({ ...match, state: 'pending' }), jobs.countDocuments({ ...match, state: 'running' }),
            jobs.countDocuments({ ...match, $or: [{ state: 'needs_review' }, { state: 'failed', 'processingStatus.retryAction': 'contact_admin' }] }), inspectSearchReadiness(db),
        ]);
        return { success: true, status: { eligible, available, queued, running, needsReview, ready: readiness.ready, message: readiness.message, batchSize: BATCH_SIZE } };
    } catch (error) {
        logger.error('Could not check saved-transcript indexing:', error);
        return { success: false, error: 'Search indexing status is unavailable. Check the embedding configuration or try again.' };
    }
}

/** Explicit approval of at most 100 saved transcripts; never submits audio or changes its usage receipt. */
export async function startSearchIndexingAction(scope: SearchIndexingScope = {}, expectedOwner?: string): Promise<{
    success: true; queued: number; needsReview: number; alreadyReady: number;
} | { success: false; error: string }> {
    try {
        const owner = await getAuthSubjectFromSession();
        if (!owner) return { success: false, error: 'Sign in to index saved transcripts.' };
        if (owner !== expectedOwner) return { success: false, error: 'The signed-in account changed. Refresh before starting indexing.' };
        const parsed = Scope.safeParse(scope);
        if (!parsed.success) return { success: false, error: 'Choose valid contact and date filters.' };
        const db = await integrationDb(), profile = embeddingProfile();
        await assertSearchIndexingAccess(owner, db);
        const readiness = await inspectSearchReadiness(db);
        if (!readiness.ready) return { success: false, error: readiness.message };
        const recordings = await db.collection<Recording>(Collections.RECORDINGS)
            .find(await availableCandidates(owner, parsed.data, profile.id, db)).sort({ recordedAt: -1, _id: -1 }).limit(BATCH_SIZE).toArray();
        let queued = 0, needsReview = 0, alreadyReady = 0;
        for (const recording of recordings) {
            const result = await enqueueSearchIndex(owner, recording._id.toString(), profile.id, db);
            if (result.state === 'needs_review') needsReview++;
            else if (result.state === 'completed') alreadyReady++;
            else queued++;
        }
        if (queued) after(async () => { await processTranscriptionJobs(); });
        return { success: true, queued, needsReview, alreadyReady };
    } catch (error) {
        logger.error('Could not queue saved-transcript indexing:', error);
        return { success: false, error: 'Indexing could not be started. Check processing access and provider configuration, then try again.' };
    }
}
