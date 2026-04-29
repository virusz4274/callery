'use client';

import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
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
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import type { Recording } from '@/lib/types';
import type { SavedRecordingsView, SmartCollection } from '@/components/recordings/toolbar/types';
import type { SemanticFallbackReason, SemanticSearchMode } from '@/lib/db/search';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { buildCurrentPath, buildLoginRedirectHref } from '@/lib/auth-redirect';
import { getRecordingDetailsAction } from '@/app/actions/recordings';

const SAVED_VIEWS_STORAGE_KEY = 'callery:recordings:saved-views';
const CHECKLIST_DISMISSED_STORAGE_KEY = 'callery:recordings:checklist-dismissed';
const DENSITY_STORAGE_KEY = 'callery:recordings:density';

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
    const linkedRecordingId = searchParams.get('id') || undefined;
    const redirectPath = buildCurrentPath(pathname, searchParams.toString());

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
    const [semanticSearchMode, setSemanticSearchMode] = useState<SemanticSearchMode | undefined>(undefined);
    const [semanticFallbackReason, setSemanticFallbackReason] = useState<SemanticFallbackReason | undefined>(undefined);
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
    const [density, setDensity] = useState<'comfortable' | 'dense'>(() => {
        if (typeof window === 'undefined') {
            return 'dense';
        }

        try {
            return window.localStorage.getItem(DENSITY_STORAGE_KEY) === 'comfortable'
                ? 'comfortable'
                : 'dense';
        } catch {
            return 'dense';
        }
    });
    const [searchMode, setSearchMode] = useState<'text' | 'semantic'>('text');
    const [linkedRecording, setLinkedRecording] = useState<Recording | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
    }, [density]);

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

    const closeLinkedRecording = useCallback(() => {
        setLinkedRecording(null);
        updateUrl({ id: undefined });
    }, [updateUrl]);

    const handleSemanticSearch = useCallback(() => {
        if (!semanticQuery.trim()) return;
        setSearchMode('semantic');
        setHasRunSemanticSearch(true);
        startSearchTransition(async () => {
            const response = await searchRecordingsAction(semanticQuery, 1, limit);
            if (response.success) {
                setSemanticResults(response.results as unknown as Recording[]);
                setSemanticTotalCount(response.totalCount || response.results.length);
                setSemanticSearchMode(response.mode);
                setSemanticFallbackReason(response.fallbackReason);
            } else {
                toast({ title: 'Search failed', description: response.error, status: 'danger' });
            }
        });
    }, [semanticQuery, limit, toast]);

    const clearSemanticSearch = useCallback(() => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
        setSemanticSearchMode(undefined);
        setSemanticFallbackReason(undefined);
        setSearchMode('text');
    }, []);

    const handleSearchModeChange = useCallback((mode: 'text' | 'semantic') => {
        setSearchMode(mode);
        if (mode === 'text') {
            setSemanticQuery('');
            setSemanticResults(null);
            setSemanticTotalCount(0);
            setSemanticSearchMode(undefined);
            setSemanticFallbackReason(undefined);
        }
    }, []);

    const handleResetAll = useCallback(() => {
        setSemanticQuery('');
        setSemanticResults(null);
        setSemanticTotalCount(0);
        setSemanticSearchMode(undefined);
        setSemanticFallbackReason(undefined);
        setSearchMode('text');
        setDensity('dense');
        updateUrl({
            q: undefined,
            sortBy: 'date',
            order: 'desc',
            start: undefined,
            end: undefined,
            contact: undefined,
            view: undefined,
            collection: undefined,
            page: '1',
        });
    }, [updateUrl]);

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
    const visibleResultsLabel = isShowingSemanticResults
        ? `${displayTotalCount} AI matches`
        : `${displayTotalCount} recordings`;
    const totalLibraryCount = stats?.totalRecordings ?? totalCount;
    const hasRecordings = totalLibraryCount > 0;
    const hasContacts = (contacts?.length ?? 0) > 0;
    const activeCollectionName = activeSmartCollectionId
        ? SMART_COLLECTIONS.find((item) => item.id === activeSmartCollectionId)?.name || activeSmartCollectionId
        : null;
    const filteredContactName = contactId
        ? contacts?.find((contact) => contact.id === contactId)?.name || 'Filtered contact'
        : null;
    const activeViewName = activeViewId
        ? savedViews.find((item) => item.id === activeViewId)?.name || 'Saved'
        : null;
    const checklistItems = [
        {
            id: 'upload',
            title: 'Upload your first recording',
            done: hasRecordings,
            href: '/upload',
        },
        {
            id: 'contacts',
            title: 'Review contacts workspace',
            done: hasContacts,
            href: '/contacts',
        },
        {
            id: 'semantic',
            title: 'Run one AI search',
            done: hasRunSemanticSearch,
            href: '#semantic-search',
        },
    ];
    const completedChecklistCount = checklistItems.filter((item) => item.done).length;
    const shouldShowChecklist = !isChecklistDismissed && (!hasRecordings || !hasContacts);

    // -- Handlers --
    const handlePageChange = (newPage: number) => updateUrl({ page: newPage.toString() });

    const handleLinkedRecordingUpdated = useCallback(async (recording: Recording) => {
        setLinkedRecording(recording);
        await refetch();
    }, [refetch]);

    // -- Render --
    useEffect(() => {
        if (!user) {
            router.replace(buildLoginRedirectHref(redirectPath));
        }
    }, [redirectPath, router, user]);

    useEffect(() => {
        if (!user || !linkedRecordingId) {
            return;
        }

        const recordingFromList = (recordings || []).find((recording) => recording.id === linkedRecordingId);
        if (recordingFromList) {
            // Safe: linkedRecording is not in the dep array, so this can't loop.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLinkedRecording(recordingFromList);
            return;
        }

        let cancelled = false;

        void getRecordingDetailsAction(linkedRecordingId)
            .then((result) => {
                if (cancelled) {
                    return;
                }

                if ('error' in result) {
                    setLinkedRecording(null);
                    updateUrl({ id: undefined });
                    toast({
                        title: 'Recording unavailable',
                        description: 'The linked recording could not be opened.',
                        status: 'warning',
                    });
                    return;
                }

                setLinkedRecording(result.recording as Recording);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }

                console.error('Failed to open linked recording:', error);
                setLinkedRecording(null);
                updateUrl({ id: undefined });
                toast({
                    title: 'Recording unavailable',
                    description: 'The linked recording could not be opened.',
                    status: 'warning',
                });
            });

        return () => {
            cancelled = true;
        };
    }, [linkedRecordingId, recordings, toast, updateUrl, user]);

    if (!user) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner size="lg" color="current" className="text-primary" />
            </div>
        );
    }

    return (
        <div className="relative space-y-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className={`grid gap-5 px-5 md:px-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${
                    hasRecordings ? 'py-4 md:py-5' : 'py-5 md:py-6'
                }`}>
                    <div className="space-y-3">
                        <Chip variant="soft" color="accent" className="w-fit">
                            Call library
                        </Chip>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="mr-1 text-3xl font-black tracking-[-0.05em] text-foreground md:text-4xl">
                                Recordings
                            </h1>
                            <Chip variant="soft" color="success">
                                {visibleResultsLabel}
                            </Chip>
                            {isShowingSemanticResults && (
                                <Chip variant="soft" color="accent">
                                    AI search
                                </Chip>
                            )}
                            {activeCollectionName && (
                                <Chip variant="soft" color="warning">
                                    {activeCollectionName}
                                </Chip>
                            )}
                            {activeViewName && (
                                <Chip variant="soft" color="default">
                                    {activeViewName}
                                </Chip>
                            )}
                        </div>
                        <p className="max-w-2xl text-sm leading-6 text-default-500">
                            {hasRecordings
                                ? 'Search, filter, and open calls without leaving the main library.'
                                : 'Bring audio into the workspace, then search, filter, and review everything from one library.'}
                        </p>
                        {(filteredContactName || activeCollectionName) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {filteredContactName && (
                                    <Chip variant="soft" color="default">
                                        Contact: {filteredContactName}
                                    </Chip>
                                )}
                                {activeCollectionName && (
                                    <Chip variant="soft" color="warning">
                                        Collection: {activeCollectionName}
                                    </Chip>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                        <Link href="/upload">
                            <Button className="w-full rounded-full px-5 font-semibold">
                                Upload recordings
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        {!hasContacts && (
                            <Link href="/contacts">
                                <Button variant="secondary" className="w-full rounded-full px-5 font-semibold">
                                    Review contacts
                                </Button>
                            </Link>
                        )}
                    </div>
                </div>
            </section>

            {shouldShowChecklist && (
                <Surface variant="default" className="rounded-[1.35rem] border border-default-200/80 p-3 md:p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="warning">
                                Setup {completedChecklistCount}/{checklistItems.length}
                            </Chip>
                            {checklistItems.map((item) => (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                                        item.done
                                            ? 'border-success/30 bg-success/10 text-foreground'
                                            : 'border-default-200 bg-default-50/70 text-foreground hover:border-default-300'
                                    }`}
                                >
                                    <CheckCircle2 className={`h-4 w-4 ${item.done ? 'text-success' : 'text-default-300'}`} />
                                    {item.title}
                                </Link>
                            ))}
                        </div>
                        <Button size="sm" variant="ghost" onPress={dismissChecklist} className="self-start text-default-500">
                            <X className="h-4 w-4" />
                            Dismiss
                        </Button>
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
                    onSemanticQueryChange={(value) => {
                        setSearchMode('semantic');
                        setSemanticQuery(value);
                    }}
                    onSemanticSearch={handleSemanticSearch}
                    onClearSemanticSearch={clearSemanticSearch}
                    isSemanticSearching={isSemanticSearching}
                    semanticResultsCount={isShowingSemanticResults ? semanticTotalCount : undefined}
                    semanticSearchMode={semanticSearchMode}
                    semanticFallbackReason={semanticFallbackReason}
                    savedViews={savedViews}
                    activeViewId={activeViewId}
                    smartCollections={SMART_COLLECTIONS}
                    activeSmartCollectionId={activeSmartCollectionId}
                    onApplySavedView={applySavedView}
                    onDeleteSavedView={deleteSavedView}
                    onSaveCurrentView={saveCurrentView}
                    onApplySmartCollection={applySmartCollection}
                    searchMode={searchMode}
                    onSearchModeChange={handleSearchModeChange}
                    density={density}
                    onDensityChange={setDensity}
                    onResetAll={handleResetAll}
                />

                <section>
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
                                density={density}
                            />
                        </>
                    )}
                    </div>
                </section>
            </div>

            {linkedRecordingId && linkedRecording && (
                <RecordingDetailsDialog
                    recording={linkedRecording}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) {
                            closeLinkedRecording();
                        }
                    }}
                    onRecordingUpdated={handleLinkedRecordingUpdated}
                />
            )}
        </div>
    );
}
