import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth-utils';
import { getRecordingsForApi, countRecordingsByUser } from '@/lib/db/recordings';
import { searchRecordingsByAtlas, isAtlasUnavailableError } from '@/lib/db/search';
import { toRecordingResponse } from '@/lib/db/converters';

function clampInt(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = parseInt(value || '', 10);
    if (isNaN(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}


/**
 * GET /api/recordings
 *
 * Fetch recordings for the authenticated user, newest first by default.
 * Query params:
 * - limit: number (default 20, max 100)
 * - page: number, 1-based (default 1); `skip` is accepted as a legacy alias
 * - includeArchived: boolean (default false)
 * - contactName: exact contact name, or 'Unknown' for unlinked recordings
 * - sortBy: 'date' | 'duration'
 * - sortOrder: 'asc' | 'desc'
 * - startDate / endDate: ISO date bounds (bare YYYY-MM-DD covers the full day)
 * - search (alias `q`): keyword search across contact, phone, file, summary,
 *   tags, and transcript. Served by Atlas Search when available, with a
 *   regex fallback for self-hosted MongoDB or a missing search index.
 */
export async function GET(request: NextRequest) {
    const authSubject = await getUserFromRequest(request);

    if (!authSubject) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const limit = clampInt(searchParams.get('limit'), 20, 1, 100);
        const includeArchived = searchParams.get('includeArchived') === 'true';
        const contactName = searchParams.get('contactName') || undefined;

        const sortBy = (searchParams.get('sortBy') as 'date' | 'duration') || undefined;
        const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;
        const startDate = searchParams.get('startDate') || undefined;
        const endDate = searchParams.get('endDate') || undefined;
        const search = searchParams.get('search') || searchParams.get('q') || undefined;

        // Pagination: prefer explicit `page`; accept legacy `skip`. Page is
        // capped so (page - 1) * limit can never overflow to Infinity.
        const rawSkip = searchParams.get('skip');
        const page = rawSkip !== null
            ? Math.min(Math.floor(Math.max(0, parseInt(rawSkip, 10) || 0) / limit) + 1, 100000)
            : clampInt(searchParams.get('page'), 1, 1, 100000);
        const skip = (page - 1) * limit;

        const options = {
            limit,
            skip,
            includeArchived,
            contactName,
            sortBy,
            sortOrder,
            startDate,
            endDate,
            search,
        };

        // Keyword search path: Atlas Search first, regex fallback.
        // Phone-like queries skip Atlas (phoneNumber is not in the text
        // index) and go straight to the exact regex path.
        const trimmedSearch = search?.trim();
        const isPhoneLike = !!trimmedSearch && /^[+\d][\d\s\-().]*$/.test(trimmedSearch);
        if (trimmedSearch && !isPhoneLike) {
            try {
                const { results, totalCount } = await searchRecordingsByAtlas(trimmedSearch, authSubject, options);
                if (totalCount > 0) {
                    return NextResponse.json({
                        recordings: results.map(rec => toRecordingResponse(rec)),
                        totalCount,
                        page,
                        limit,
                        totalPages: Math.ceil(totalCount / limit),
                        searchMode: 'atlas' as const,
                    });
                }
                // Atlas found nothing: fall through to regex so exact
                // substrings (e.g. partial file names the analyzer splits)
                // still match.
            } catch (error) {
                if (!isAtlasUnavailableError(error)) throw error;
                // Atlas unavailable (self-hosted / missing index): regex path below.
            }
        }

        const [recordings, totalCount] = await Promise.all([
            getRecordingsForApi(authSubject, options),
            countRecordingsByUser(authSubject, {
                includeArchived,
                contactName,
                startDate,
                endDate,
                search,
            }),
        ]);

        return NextResponse.json({
            recordings,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
            ...(search?.trim() ? { searchMode: 'regex' as const } : {}),
        });
    } catch (error) {
        console.error('Error fetching recordings:', error);
        return NextResponse.json(
            { error: 'Failed to fetch recordings' },
            { status: 500 }
        );
    }
}
