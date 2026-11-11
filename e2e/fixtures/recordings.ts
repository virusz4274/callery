import { getRecordingCallerLabel } from '../../src/lib/recording-label';
import type { FileSystemNode } from '../../src/lib/types';
import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ContactResponse, RecordingResponse, UserResponse } from '../../src/lib/db/types';
import type { SearchResponse } from '../../src/app/actions/search-actions';

const audio = Buffer.alloc(44 + 8000 * 30, 128);
audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(8000, 28); audio.writeUInt16LE(1, 32);
audio.writeUInt16LE(8, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);

export const profile: UserResponse = {
    id: 'transcription-fixture', email: 'transcription@example.com', name: 'Transcription Fixture',
    firstName: 'Transcription', lastName: 'Fixture', phoneNumber: '', role: 'user', timezone: 'UTC',
    planKey: 'lifetime', planName: 'Lifetime', createdAt: '2026-01-01T00:00:00Z',
    notificationSettings: { activityDigest: 'off' },
    storageSettings: { deletionPolicy: 'never' }, storageUsed: 0, storageAllocation: 1024 ** 3,
    transcriptionUsed: 0, transcriptionAllocation: 3600,
    transcriptionSettings: { autoTranscribe: false, defaultProvider: 'gemini' },
    billingSettings: { allowOverage: false }, totalRecordings: 1,
    googleSync: { status: 'completed', hasRefreshToken: false },
};

export const recording: RecordingResponse = {
    id: 'recording-fixture', authSubject: profile.id, contactId: null, contactName: 'Dialog Fixture',
    phoneNumber: '', r2Key: 'fixture.mp3', fileName: 'Dialog fixture recording',
    standardizedDisplayName: 'Dialog fixture recording', fileSize: 100, mimeType: 'audio/wav', duration: 60,
    recordedAt: profile.createdAt, createdAt: profile.createdAt, updatedAt: profile.createdAt,
    transcriptionStatus: 'pending', tags: [], isStarred: false, isArchived: false,
    playbackUrl: '/__recording-fixture.wav',
};

const providers = ['soniox', 'elevenlabs', 'gemini', 'openai_compat'].map(id => ({
    id, name: id, description: 'Fixture provider', multiplier: 1,
}));

export async function mockRecordings(page: Page, options: { profile?: UserResponse; fileSystem?: () => FileSystemNode; recording?: RecordingResponse; recordings?: RecordingResponse[]; failRecordings?: () => boolean; semanticSearch?: (query: string, page: number, limit: number) => Promise<SearchResponse> | SearchResponse; url?: string; open?: boolean; unavailable?: boolean; contacts?: ContactResponse[]; failContacts?: () => boolean; failUploads?: boolean; transcription?: 'complete' | 'fail' } = {}) {
    const fixtureRecording = options.recording || recording;
    const actionNames = new Map<string, string>();
    // Isolated production builds expose action names in the server manifest,
    // while development bundles expose them in the served JavaScript below.
    if (process.env.TEST_ACTION_MANIFEST_PATH) {
        const manifest = JSON.parse(await readFile(process.env.TEST_ACTION_MANIFEST_PATH, 'utf8'));
        for (const [id, entry] of Object.entries({ ...manifest.node, ...manifest.edge })) {
            if (entry && typeof entry === 'object' && 'exportedName' in entry && typeof entry.exportedName === 'string') {
                actionNames.set(id, entry.exportedName);
            }
        }
    }
    const transcriptionRequests: string[] = [];
    let transcribed = false;
    const uploads = new Map<string, { id: string; state: string; fileSize: number; partSize: number; partCount: number; expiresAt: string; recordingId: string | null; transport: string; parts: { partNumber: number; size: number; etag: string }[] }>();
    const uploadKeys = new Map<string, string>();

    // Intercept every API and Server Action request so no shared data or provider is touched.
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        // Use same-origin media so production CSP applies to the playback checks.
        if (url.pathname === '/__recording-fixture.wav') {
            return route.fulfill({ contentType: 'audio/wav', body: audio });
        }
        if (!process.env.TEST_ACTION_MANIFEST_PATH && url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js')) {
            const response = await route.fetch();
            const source = await response.text();
            // Discover action IDs from the served development bundles; IDs change between builds.
            // Webpack embeds modules in escaped eval strings; Turbopack serves plain source.
            const actionSource = source.replace(/\\"/g, '"').replace(/\\n/g, '\n');
            for (const match of actionSource.matchAll(/createServerReference[^\n]*?\)\("([a-f0-9]{40,64})",[^\n]*?, "(\w+)"\)/g)) {
                actionNames.set(match[1], match[2]);
            }
            for (const match of actionSource.matchAll(/__next_internal_action_entry_do_not_use__ (\[[^\n]+?\]|\{[^\n]+?\}) \*\//g)) {
                const parsed = JSON.parse(match[1]);
                const entries = Array.isArray(parsed) ? parsed[0] : parsed;
                for (const [id, entry] of Object.entries(entries)) {
                    actionNames.set(id, typeof entry === 'string' ? entry : (entry as { name: string }).name);
                }
            }
            return route.fulfill({ response, body: source });
        }
        if (url.pathname === '/api/uploads' || url.pathname.startsWith('/api/uploads/')) {
            if (options.failUploads) return route.fulfill({ status: 503, headers: { 'Retry-After': '0.01' }, json: { success: false, error: { code: 'storage_unavailable', message: 'Fixture storage unavailable. Please retry.' } } });
            const segments = url.pathname.split('/').filter(Boolean).slice(2);
            if (!segments.length && request.method() === 'POST') {
                const input = request.postDataJSON();
                const key = request.headers()['idempotency-key'];
                let id = uploadKeys.get(key);
                if (!id) {
                    id = `upload-${uploads.size}`; uploadKeys.set(key, id);
                    uploads.set(id, { id, state: 'uploading', fileSize: input.fileSize, partSize: 8 * 1024 ** 2, partCount: Math.ceil(input.fileSize / (8 * 1024 ** 2)), expiresAt: new Date(Date.now() + 86400_000).toISOString(), recordingId: null, transport: 'proxy', parts: [] });
                }
                return route.fulfill({ json: { success: true, data: uploads.get(id) } });
            }
            const session = uploads.get(segments[0]);
            if (!session) return route.fulfill({ status: 404, json: { success: false, error: { code: 'not_found', message: 'Fixture upload not found.' } } });
            if (segments[1] === 'parts' && request.method() === 'PUT') {
                const partNumber = Number(segments[2]);
                session.parts = session.parts.filter(part => part.partNumber !== partNumber);
                session.parts.push({ partNumber, size: request.postDataBuffer()?.byteLength || 0, etag: 'fixture' });
            } else if (segments[1] === 'complete') { session.state = 'completed'; session.recordingId = 'uploaded-fixture'; }
            else if (request.method() === 'DELETE') session.state = 'cancelled';
            return route.fulfill({ json: { success: true, data: session } });
        }
        if (url.pathname.startsWith('/api/')) {
            if ((url.pathname === '/api/contacts' || url.pathname.startsWith('/api/contacts/')) && options.failContacts?.()) {
                return route.fulfill({ status: 500, json: { error: 'Fixture contact directory unavailable' } });
            }
            if (url.pathname.startsWith('/api/contacts/')) {
                const contact = (options.contacts || []).find(item => item.id === decodeURIComponent(url.pathname.slice('/api/contacts/'.length)));
                return route.fulfill({ status: contact ? 200 : 404, json: contact ? { contact } : { error: 'Contact not found' } });
            }
            const contactSearch = (url.searchParams.get('search') || '').toLowerCase();
            const matchingContacts = (options.contacts || []).filter(contact => [contact.name, ...contact.phoneNumbers].some(value => value.toLowerCase().includes(contactSearch)));
            const skip = Number(url.searchParams.get('skip') || 0);
            const limit = Number(url.searchParams.get('limit') || 20);
            const data: Record<string, unknown> = {
                '/api/auth/get-session': {
                    user: { id: profile.id, name: profile.name, email: profile.email, emailVerified: true },
                    session: { id: 'fixture-session', userId: profile.id, token: 'fixture', expiresAt: '2099-01-01T00:00:00Z' },
                },
                '/api/auth/capabilities': { googleEnabled: false, emailVerificationRequired: false, passwordResetEnabled: false },
                '/api/auth/list-accounts': [],
                '/api/user/profile': { profile: options.profile || profile },
                '/api/system-settings/public': { maintenanceMode: false },
                '/api/contacts': { contacts: matchingContacts.slice(skip, skip + limit), totalCount: matchingContacts.length, limit, skip },
                '/api/filesystem': { fileSystem: options.fileSystem ? options.fileSystem() : { id: 'root', name: 'Home', type: 'folder', lastModified: profile.createdAt, children: [{ id: 'folder', name: 'Archive', type: 'folder', lastModified: profile.createdAt, children: [{ id: 'subfolder', name: '2026', type: 'folder', lastModified: profile.createdAt, children: [{ id: `file-${fixtureRecording.id}`, name: getRecordingCallerLabel(fixtureRecording), type: 'file', size: '10 MB', lastModified: profile.createdAt }] }] }] } },
            };
            return route.fulfill({ json: data[url.pathname] ?? {} });
        }
        if (request.method() === 'POST') {
            if (url.pathname.startsWith('/__nextjs')) return route.fulfill({ json: {} });
            const action = actionNames.get(request.headers()['next-action']);
            // React's action transport represents omitted arguments as "$undefined".
            const args = JSON.parse(request.postData() || '[]', (_key, value) => value === '$undefined' ? undefined : value);
            let result: unknown;
            if (action === 'getAvailableProviders') {
                result = providers;
            } else if (action === 'getStatsAction') {
                result = { stats: { totalRecordings: options.recordings?.length ?? 1 } };
            } else if (action === 'getExportStatus') {
                result = null;
            } else if (action === 'listRecordingShares') {
                result = [];
            } else if (action === 'fetchNotifications') {
                result = { notifications: [], unreadCount: 0, nextCursor: null };
            } else if (action === 'getActiveAnnouncements') {
                result = [];
            } else if (action === 'getRecordingsAction' && options.failRecordings?.()) {
                result = { error: 'Fixture recording list unavailable' };
            } else if (action === 'getRecordingsAction') {
                const query = args[0] || {};
                const matching = (options.recordings || [fixtureRecording]).filter(item => !options.recordings || (
                    (!query.needsTranscription || item.transcriptionStatus !== 'completed') &&
                    (!query.contactId || item.contactId === query.contactId) &&
                    (!query.startDate || item.recordedAt >= query.startDate) &&
                    (!query.endDate || item.recordedAt.slice(0, 10) <= query.endDate) &&
                    (!query.search || [item.contactName || '', item.phoneNumber, item.summary || '', item.fileName].some(value => value.toLowerCase().includes(query.search.toLowerCase()))))
                );
                matching.sort((a, b) => query.sortBy === 'duration' ? a.duration - b.duration : a.recordedAt.localeCompare(b.recordedAt));
                if (query.sortOrder !== 'asc') matching.reverse();
                const start = ((query.page || 1) - 1) * (query.limit || 100);
                result = { recordings: options.recordings ? matching.slice(start, start + (query.limit || 100)) : [fixtureRecording], totalCount: matching.length };
            } else if (action === 'searchRecordingsAction' && options.semanticSearch) {
                result = await options.semanticSearch(args[0].query, args[0].page, args[0].pageSize);
            } else if (action === 'getRecordingDetailsAction') {
                result = options.unavailable ? { error: 'Fixture unavailable' } : { recording: transcribed ? {
                    ...fixtureRecording, transcriptionStatus: 'completed', updatedAt: '2026-10-06T00:00:00Z',
                    fullTranscript: [{ speakerId: 'spk:0', start: 0, end: 5, text: 'Mocked transcription completed.', words: [] }],
                } : options.recordings?.find(item => item.id === args[0]) || fixtureRecording };
            } else if (action === 'transcribeRecordingAction' && options.transcription) {
                transcribed = options.transcription === 'complete';
                result = transcribed ? { success: true } : { error: 'Fixture transcription failed. Try again.' };
            } else {
                transcriptionRequests.push(action || 'Unknown action');
                result = { error: 'Unexpected fixture action' };
            }
            // Minimal React Server Component action response, with no navigation patch.
            return route.fulfill({ contentType: 'text/x-component', body: `0:${JSON.stringify({ a: result, f: '' })}\n` });
        }
        return route.continue();
    });

    await page.goto(options.url || '/recordings');
    if (options.open === false) return transcriptionRequests;
    const openRecording = page.getByRole('button', { name: getRecordingCallerLabel(fixtureRecording), exact: true });
    await expect(openRecording).toBeVisible();
    await openRecording.click();
    await expect(page.getByRole('dialog', { name: getRecordingCallerLabel(fixtureRecording) })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcribe', exact: true })).toBeVisible();
    return transcriptionRequests;
}
