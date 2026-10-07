import { getRecordingCallerLabel } from '../../src/lib/recording-label';
import type { FileSystemNode } from '../../src/lib/types';
import { expect, type Page } from '@playwright/test';
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
    notificationSettings: { activityDigest: 'off', ingestSuccess: false, ingestFail: false },
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
    playbackUrl: `data:audio/wav;base64,${audio.toString('base64')}`,
};

const providers = ['soniox', 'elevenlabs', 'gemini', 'openai_compat'].map(id => ({
    id, name: id, description: 'Fixture provider', multiplier: 1,
}));

export async function mockRecordings(page: Page, options: { profile?: UserResponse; fileSystem?: () => FileSystemNode; recording?: RecordingResponse; recordings?: RecordingResponse[]; failRecordings?: () => boolean; semanticSearch?: (query: string, page: number, limit: number) => Promise<SearchResponse> | SearchResponse; url?: string; open?: boolean; unavailable?: boolean; contacts?: ContactResponse[]; failContacts?: () => boolean; failUploads?: boolean; transcription?: 'complete' | 'fail' } = {}) {
    const fixtureRecording = options.recording || recording;
    const actionNames = new Map<string, string>();
    const transcriptionRequests: string[] = [];
    let transcribed = false;

    // Intercept every API and Server Action request so no shared data or provider is touched.
    await page.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js')) {
            const response = await route.fetch();
            const source = await response.text();
            // Discover action IDs from the served development bundles; IDs change between builds.
            for (const match of source.matchAll(/createServerReference[^\n]*?\)\("([a-f0-9]{40,64})",[^\n]*?, "(\w+)"\)/g)) {
                actionNames.set(match[1], match[2]);
            }
            for (const match of source.matchAll(/__next_internal_action_entry_do_not_use__ (\[[^\n]+?\]) \*\//g)) {
                const [entries] = JSON.parse(match[1]);
                for (const [id, entry] of Object.entries(entries)) {
                    actionNames.set(id, typeof entry === 'string' ? entry : (entry as { name: string }).name);
                }
            }
            return route.fulfill({ response, body: source });
        }
        if (url.pathname.startsWith('/api/')) {
            if (url.pathname === '/api/contacts' && options.failContacts?.()) {
                return route.fulfill({ status: 500, json: { error: 'Fixture contact directory unavailable' } });
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
            } else if (action === 'initializeDirectUpload' && options.failUploads) {
                result = { success: false, error: 'Fixture storage unavailable. Please retry.' };
            } else if (action === 'fetchNotifications' || action === 'getActiveAnnouncements') {
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
                result = await options.semanticSearch(args[0], args[1], args[2]);
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
