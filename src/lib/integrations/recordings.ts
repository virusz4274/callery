import { ObjectId, type Filter } from 'mongodb';
import { Collections } from '@/lib/mongodb';
import type { Recording } from '@/lib/db/types';
import { integrationDb } from './database';
import { ApiError } from './contracts';
import { companyScope, requireScope, type ApiActor } from './tokens';

export function recordingResponse(recording: Recording, detail = false) {
    return { id: recording._id.toString(), contactId: recording.contactId?.toString() ?? null, contactName: recording.contactName, phoneNumber: recording.phoneNumber, fileName: recording.fileName, displayName: recording.standardizedDisplayName, fileSize: recording.fileSize, mimeType: recording.mimeType, duration: recording.duration, recordedAt: recording.recordedAt.toISOString(), createdAt: recording.createdAt.toISOString(), updatedAt: recording.updatedAt.toISOString(), transcriptionStatus: recording.transcriptionStatus, tags: recording.tags, isArchived: recording.isArchived, isStarred: recording.isStarred, source: recording.integration?.source ?? null, externalId: recording.integration?.externalId ?? null, metadata: recording.integration?.metadata ?? {}, ...(detail ? { summary: recording.summary ?? null, transcript: recording.fullTranscript ?? null, languageCode: recording.languageCode ?? null, transcriptionProvider: recording.transcriptionProvider ?? null, transcriptionModel: recording.transcriptionModel ?? null } : {}) };
}
export async function apiRecording(actor: ApiActor, id: string, purpose: 'read' | 'download' | 'transcribe') {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new ApiError(404, 'not_found', 'Recording not found.');
    const company = purpose !== 'transcribe' && await companyScope(actor, purpose === 'read' ? 'company:recordings:read' : 'company:recordings:download');
    if (!company) requireScope(actor, purpose === 'read' ? 'recordings:read' : purpose === 'download' ? 'recordings:download' : 'recordings:transcribe');
    const recording = await (await integrationDb()).collection<Recording>(Collections.RECORDINGS).findOne({ _id: new ObjectId(id), ...(!company ? { authSubject: actor.token.owner } : {}) });
    if (!recording) throw new ApiError(404, 'not_found', 'Recording not found.');
    return recording;
}
export async function listRecordings(actor: ApiActor, params: URLSearchParams) {
    const company = await companyScope(actor, 'company:recordings:read');
    if (!company) requireScope(actor, 'recordings:read');
    const limit = Number(params.get('limit') || 20); const page = Number(params.get('page') || 1);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(page) || page < 1 || page > 100000) throw new ApiError(400, 'invalid_query', 'limit must be 1–100 and page 1–100000.');
    const filter: Filter<Recording> = { ...(!company ? { authSubject: actor.token.owner } : {}), ...(params.get('includeArchived') === 'true' ? {} : { isArchived: { $ne: true } }) };
    const source = params.get('source'); const externalId = params.get('externalId');
    if (source) filter['integration.source'] = source;
    if (externalId) filter['integration.externalId'] = externalId;
    const start = params.get('startDate'); const end = params.get('endDate');
    if (start || end) {
        const from = start ? new Date(start) : null; const to = end ? new Date(end.length === 10 ? `${end}T23:59:59.999Z` : end) : null;
        if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime())) || (from && to && from > to)) throw new ApiError(400, 'invalid_query', 'Invalid recording date range.');
        filter.recordedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const search = params.get('search');
    if (search) {
        if (search.length > 200) throw new ApiError(400, 'invalid_query', 'Search exceeds 200 characters.');
        const expression = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = ['fileName', 'contactName', 'phoneNumber', 'summary', 'tags', 'fullTranscript.text'].map(field => ({ [field]: { $regex: expression, $options: 'i' } }));
    }
    const collection = (await integrationDb()).collection<Recording>(Collections.RECORDINGS);
    const [recordings, totalCount] = await Promise.all([collection.find(filter, { projection: { fullTranscript: 0, summaryEmbedding: 0 } }).sort({ recordedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).toArray(), collection.countDocuments(filter)]);
    return { recordings: recordings.map(recording => recordingResponse(recording)), page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}
