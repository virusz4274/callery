'use client';

import React, { useCallback, useMemo, useState, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { RecordingsToolbar } from '@/components/recordings/recordings-toolbar';
import { RecordingsTable } from '@/components/recordings-table';
import { useRecordings } from '@/hooks/use-recordings';
import { useUser } from '@/lib/firebase/provider';
import { Button, Chip, Spinner, Surface } from '@heroui/react';
import { useStats } from '@/hooks/use-stats';
import { useContacts } from '@/hooks/use-contacts';
import { searchRecordingsAction } from '@/app/actions/search-actions';
import { useToast } from '@/components/toast-provider';
import type { Recording } from '@/lib/types';
import type { SavedRecordingsView, SmartCollection } from '@/components/recordings/toolbar/types';
import { ArrowRight, CalendarRange, CheckCircle2, Sparkles, Users, X } from 'lucide-react';

const SAVED_VIEWS_STORAGE_KEY = 'vosift:recordings:saved-views';
const CHECKLIST_DISMISSED_STORAGE_KEY = 'vosift:recordings:checklist-dismissed';

const SMART_COLLECTIONS: SmartCollection[] = [
    {
        id: 'recent-week',
        name: 'Recent week',
        description: 'Recordings captured in the last 7 days.',
    },
    {
        id: 'longest-calls',
        name: 'Longest calls',
        description: 'Sort by duration to surface long conversations first.',
    },
    {
        id: 'needs-transcription',
        name: 'Needs transcription',
        description: 'Show items where transcription has not completed yet.',
    },
];

function formatAverageDuration(seconds: number | undefined) {
    if (!seconds) {
        return '0m';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);

    if (mins === 0) {
        return `${secs}s`;
    }

    return `${mins}m`;
}

export function RecordingsPage() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user } = useUser();

    // -- URL State Management --
    const createQueryString = useCallback(
        (updates: Record<string, string | undefined>) => {
            const params = new URLSearchParams(searchParams.toString());

            for (const [name, value] of Object.entries(updates)) {
                if (value) {
                    params.set(name, value);
                } else {
                    params.delete(name);
                }
            }

            return params.toString();
        },
        [searchParams]
    );

    const updateUrl = useCallback((updates: Record<string, string | undefined>) => {
        const query = createQueryString(updates);
        router.push(query ? `${pathname}?${query}` : pathname);
    }, [router, pathname, createQueryString]);

    // -- Extract State from URL --
    const page = Number(searchParams.get('page')) || 1;
    const limit = Number(searchParams.get('limit')) || 10;
    const search = searchParams.get('q') || '';
    const sortBy = (searchParams.get('sortBy') as 'date' | 'duration') || 'date';
    const sortOrder = (searchParams.get('order') as 'asc' | 'desc') || 'desc';
    const startDate = searchParams.get('start') || undefined;
    const endDate = searchParams.get('end') || undefined;
    const contactId = searchParams.get('contact') || undefined;
    const activeViewId = searchParams.get('view') || undefined;
    const activeSmartCollectionId = searchParams.get('collection') || undefined;

    // -- Data Fetching --
    const queryOptions = useMemo(() => ({
        page,
        limit,
        search, // Note: Hook might need update if it doesn't support 'search' param directly for semantic/text
        sortBy,
        sortOrder,
        startDate,
        endDate,
        contactId,
        includeArchived: false,
    }), [page, limit, search, sortBy, sortOrder, startDate, endDate, contactId]);

    const {
        data: recordings,
        totalCount,
        isLoading: isLoadingRecordings,
        refetch
    } = useRecordings(queryOptions);

    const { data: contacts } = useContacts();
    const { stats, isLoading: isLoadingStats } = useStats();
    const { toast } = useToast();

    // -- Semantic Search State --
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticResults, setSemanticResults] = useState<Recording[] | null>(null);
    const [semanticTotalCount, setSemanticTotalCount] = useState(0);
    const [isSemanticSearching, startSearchTransition] = useTransition();
    const [hasRunSemanticSearch, setHasRunSemanticSearch] = useState(false);
    const [savedViews, setSavedViews] = useState<SavedRecordingsView[]>(() => {
        if (typeof window === 'undefined') {
            return [];
        }

        try {
            const rawViews = window.localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
            if (rawViews) {
                const parsed = JSON.parse(rawViews) as SavedRecordingsView[];
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
        } catch (error) {
            void error;
        }

        return [];
    });
    const [isChecklistDismissed, setIsChecklistDismissed] = useState(() => {
        if (typeof window === 'undefined') {
            return false;
        }

        try {
            return window.localStorage.getItem(CHECKLIST_DISMISSED_STORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const persistSavedViews = useCallback((nextViews: SavedRecordingsView[]) => {
        setSavedViews(nextViews);

        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(nextViews));
    }, []);

    const dismissChecklist = useCallback(() => {
        setIsChecklistDismissed(true);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(CHECKLIST_DISMISSED_STORAGE_KEY, 'true');
        }
    }, []);

    const handleSemanticSearch = useCallback(() => {
        if (!semanticQuery.trim()) return;
        setHasRunSemanticSearch(true);
        startSearchTransition(async () => {
            const response = await searchRecordingsAction(semanticQuery, 1, limit);
            if (response.success) {
                setSemanticResults(response.results as unknown as Recording[]);
                setSemanticTotalCount(response.totalCount || response.results.length);
            } else {
                toast({ title: 'Search failed', description: response.error, status: 'danger' });
            }
        });
    }, [semanticQuery, limit, toast]);

    const clearSemanticSearch = useCallback(() => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
    }, []);

    const applySavedView = useCallback((viewId: string) => {
        const view = savedViews.find((item) => item.id === viewId);
        if (!view) {
            return;
        }

        updateUrl({
            q: view.search || undefined,
            sortBy: view.sortBy,
            order: view.sortOrder,
            start: view.startDate || undefined,
            end: view.endDate || undefined,
            contact: view.contactId || undefined,
            view: view.id,
            collection: undefined,
            page: '1',
        });
    }, [savedViews, updateUrl]);

    const deleteSavedView = useCallback((viewId: string) => {
        const nextViews = savedViews.filter((view) => view.id !== viewId);
        persistSavedViews(nextViews);

        if (activeViewId === viewId) {
            updateUrl({ view: undefined });
        }
    }, [activeViewId, persistSavedViews, savedViews, updateUrl]);

    const saveCurrentView = useCallback((name: string) => {
        const view: SavedRecordingsView = {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            search: search || undefined,
            sortBy,
            sortOrder,
            startDate,
            endDate,
            contactId,
        };

        const nextViews = [view, ...savedViews].slice(0, 10);
        persistSavedViews(nextViews);
        updateUrl({ view: view.id });
    }, [contactId, endDate, persistSavedViews, savedViews, search, sortBy, sortOrder, startDate, updateUrl]);

    const applySmartCollection = useCallback((collectionId: string) => {
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const fromDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        if (collectionId === 'recent-week') {
            updateUrl({
                start: fromDate,
                end: toDate,
                sortBy: 'date',
                order: 'desc',
                collection: collectionId,
                view: undefined,
                page: '1',
            });
            return;
        }

        if (collectionId === 'longest-calls') {
            updateUrl({
                sortBy: 'duration',
                order: 'desc',
                collection: collectionId,
                view: undefined,
                page: '1',
            });
            return;
        }

        if (collectionId === 'needs-transcription') {
            updateUrl({
                collection: collectionId,
                view: undefined,
                page: '1',
            });
        }
    }, [updateUrl]);

    // Determine what to display
    const isShowingSemanticResults = !!semanticResults;
    const displayedRecordings = useMemo(() => {
        const source = isShowingSemanticResults ? (semanticResults || []) : (recordings || []);

        if (activeSmartCollectionId !== 'needs-transcription') {
            return source;
        }

        return source.filter((recording) => recording.transcriptionStatus !== 'completed');
    }, [activeSmartCollectionId, isShowingSemanticResults, recordings, semanticResults]);
    const displayTotalCount = activeSmartCollectionId === 'needs-transcription'
        ? displayedRecordings.length
        : (isShowingSemanticResults ? semanticTotalCount : totalCount);
    const activeFilters = [
        search ? `Text: ${search}` : null,
        contactId ? `Contact: ${contacts?.find((contact) => contact.id === contactId)?.name || 'Unknown'}` : null,
        startDate ? `From ${startDate}` : null,
        endDate ? `To ${endDate}` : null,
        activeSmartCollectionId
            ? `Collection: ${SMART_COLLECTIONS.find((item) => item.id === activeSmartCollectionId)?.name || activeSmartCollectionId}`
            : null,
        activeViewId
            ? `View: ${savedViews.find((item) => item.id === activeViewId)?.name || 'Saved'}`
            : null,
    ].filter(Boolean) as string[];
    const visibleResultsLabel = isShowingSemanticResults
        ? `${displayTotalCount} AI matches`
        : `${displayTotalCount} recordings`;
    const searchModeLabel = isShowingSemanticResults ? 'AI search view' : 'Library view';
    const checklistItems = [
        {
            id: 'upload',
            title: 'Upload your first recording',
            done: (stats?.totalRecordings ?? totalCount) > 0,
            href: '/upload',
        },
        {
            id: 'contacts',
            title: 'Review contacts workspace',
            done: (contacts?.length ?? 0) > 0,
            href: '/contacts',
        },
        {
            id: 'semantic',
            title: 'Run one AI semantic search',
            done: hasRunSemanticSearch,
            href: '#semantic-search',
        },
    ];
    const completedChecklistCount = checklistItems.filter((item) => item.done).length;
    const shouldShowChecklist = !isChecklistDismissed && completedChecklistCount < checklistItems.length;

    // -- Handlers --
    const handlePageChange = (newPage: number) => updateUrl({ page: newPage.toString() });

    // -- Render --
    if (!user) {
        return <div className="p-8 text-center">Please log in to view recordings.</div>;
    }

    return (
        <div className="relative space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                    <div className="space-y-4">
                        <Chip variant="soft" color="accent" className="rounded-full px-3 py-1 text-xs font-medium">
                            Recordings workspace
                        </Chip>
                        <div className="space-y-3">
                            <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                Recordings
                            </h1>
                            <p className="max-w-2xl text-base leading-7 text-default-600 md:text-lg">
                                Review the call library, switch between keyword and AI search, and
                                move from raw transcript to the exact moment that needs action.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color={isShowingSemanticResults ? 'accent' : 'default'}>
                                {searchModeLabel}
                            </Chip>
                            <Chip variant="soft" color="success">
                                {visibleResultsLabel}
                            </Chip>
                            {activeFilters.length > 0 && (
                                <Chip variant="soft" color="warning">
                                    {activeFilters.length} active filter{activeFilters.length > 1 ? 's' : ''}
                                </Chip>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                        <Link href="/upload">
                            <Button className="w-full rounded-full px-6 font-semibold">
                                Upload recordings
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="/contacts">
                            <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                                Review contacts
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-3 border-t border-default-100/80 bg-default-50/50 px-5 py-5 md:grid-cols-2 xl:grid-cols-4 md:px-8">
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Total library
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                                {isLoadingStats ? '...' : stats?.totalRecordings ?? totalCount}
                            </div>
                            <div className="text-sm text-default-500">
                                All stored recordings in your workspace
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Showing now
                            </div>
                            <div className="text-2xl font-bold text-foreground">{displayTotalCount}</div>
                            <div className="text-sm text-default-500">
                                Current result set after filters and search
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <CalendarRange className="h-3.5 w-3.5" />
                                Avg duration
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                                {isLoadingStats ? '...' : formatAverageDuration(stats?.avgDuration)}
                            </div>
                            <div className="text-sm text-default-500">
                                Average call length across the account
                            </div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                {isShowingSemanticResults ? <Sparkles className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                                Focus
                            </div>
                            <div className="text-lg font-bold text-foreground">
                                {isShowingSemanticResults
                                    ? 'Meaning-based search'
                                    : contactId
                                        ? contacts?.find((contact) => contact.id === contactId)?.name || 'Filtered contact'
                                        : 'Entire workspace'}
                            </div>
                            <div className="text-sm text-default-500">
                                {isShowingSemanticResults
                                    ? 'AI results temporarily replace the library list until you clear them.'
                                    : 'Use contact and date filters to narrow the archive without losing context.'}
                            </div>
                        </div>
                    </Surface>
                </div>
            </section>

            {shouldShowChecklist && (
                <Surface variant="default" className="rounded-[1.6rem] border border-default-200/80 p-5">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    First-run checklist
                                </div>
                                <h2 className="text-xl font-bold tracking-[-0.03em] text-foreground">
                                    Complete these steps to finish workspace setup.
                                </h2>
                                <p className="text-sm text-default-500">
                                    {completedChecklistCount} of {checklistItems.length} complete
                                </p>
                            </div>
                            <Button size="sm" variant="ghost" onPress={dismissChecklist}>
                                <X className="h-4 w-4" />
                                Dismiss
                            </Button>
                        </div>
                        <div className="grid gap-2 md:grid-cols-3">
                            {checklistItems.map((item) => (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`rounded-[1rem] border px-3 py-3 transition-colors ${
                                        item.done
                                            ? 'border-success/30 bg-success/10'
                                            : 'border-default-200 bg-default-50/70 hover:border-default-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                                        <CheckCircle2 className={`h-4 w-4 ${item.done ? 'text-success' : 'text-default-300'}`} />
                                        {item.title}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </Surface>
            )}

            <div className="flex flex-col gap-6">
                <RecordingsToolbar
                    search={search}
                    onSearchChange={(val) =>
                        updateUrl({ q: val || undefined, view: undefined, collection: undefined, page: '1' })
                    }
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(by, order) =>
                        updateUrl({ sortBy: by, order, view: undefined, collection: undefined, page: '1' })
                    }
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={(start, end) =>
                        updateUrl({
                            start: start || undefined,
                            end: end || undefined,
                            view: undefined,
                            collection: undefined,
                            page: '1',
                        })
                    }
                    contacts={contacts || []}
                    contactId={contactId}
                    onContactChange={(id) =>
                        updateUrl({ contact: id || undefined, view: undefined, collection: undefined, page: '1' })
                    }
                    // Semantic Search
                    semanticQuery={semanticQuery}
                    onSemanticQueryChange={setSemanticQuery}
                    onSemanticSearch={handleSemanticSearch}
                    onClearSemanticSearch={clearSemanticSearch}
                    isSemanticSearching={isSemanticSearching}
                    semanticResultsCount={isShowingSemanticResults ? semanticTotalCount : undefined}
                    savedViews={savedViews}
                    activeViewId={activeViewId}
                    smartCollections={SMART_COLLECTIONS}
                    activeSmartCollectionId={activeSmartCollectionId}
                    onApplySavedView={applySavedView}
                    onDeleteSavedView={deleteSavedView}
                    onSaveCurrentView={saveCurrentView}
                    onApplySmartCollection={applySmartCollection}
                />

                <section className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Results
                            </div>
                            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
                                {isShowingSemanticResults ? 'Semantic matches' : 'Recording library'}
                            </h2>
                            <p className="text-sm leading-6 text-default-500">
                                {isShowingSemanticResults
                                    ? 'These results come from AI search and are separate from the normal paginated library view.'
                                    : 'Browse every recording, open details, and manage the archive from one surface.'}
                            </p>
                        </div>

                        {activeFilters.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {activeFilters.map((filter) => (
                                    <Chip key={filter} variant="soft" color="default">
                                        {filter}
                                    </Chip>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="min-h-[400px]">
                    {isLoadingRecordings && !isShowingSemanticResults ? (
                        <div className="flex justify-center items-center h-64">
                            <Spinner size="lg" />
                        </div>
                    ) : (
                        <>
                            <RecordingsTable
                                recordings={displayedRecordings}
                                totalCount={displayTotalCount}
                                page={isShowingSemanticResults ? 1 : page}
                                itemsPerPage={limit}
                                setPage={handlePageChange}
                                onRecordingsChange={refetch}
                                contacts={contacts || []}
                            />

                            <div className="mt-4 flex justify-between items-center">
                                <div className="text-small text-default-500">
                                    {isShowingSemanticResults
                                        ? `Found ${displayTotalCount} matching recordings`
                                        : `Total ${displayTotalCount} recordings`
                                    }
                                </div>
                            </div>
                        </>
                    )}
                    </div>
                </section>
            </div>
        </div>
    );
}
