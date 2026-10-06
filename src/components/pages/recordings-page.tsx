'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RecordingsToolbar } from '@/components/recordings/recordings-toolbar';
import { RecordingsTable } from '@/components/recordings-table';
import { useRecordings } from '@/hooks/use-recordings';
import { useUser } from '@/lib/auth/client';
import { Alert, Button, Chip, Spinner, Surface } from '@heroui/react';
import { useStats } from '@/hooks/use-stats';
import { useContacts } from '@/hooks/use-contacts';
import { useToast } from '@/components/toast-provider';
import { RecordingDetailsDialog } from '@/components/recording-details-dialog';
import type { Recording } from '@/lib/types';
import type { SavedRecordingsView, SmartCollection } from '@/components/recordings/toolbar/types';
import { Upload, CheckCircle2, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { getRecordingDetailsAction } from '@/app/actions/recordings';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useRecordingsFilters } from '@/hooks/use-recordings-filters';
import { useSemanticSearch } from '@/hooks/use-semantic-search';

const SAVED_VIEWS_STORAGE_KEY = 'callery:recordings:saved-views';
const CHECKLIST_DISMISSED_STORAGE_KEY = 'callery:recordings:checklist-dismissed';
const DENSITY_STORAGE_KEY = 'callery:recordings:density';

// Stable reference so useLocalStorage's dep array doesn't fire on every render
const EMPTY_SAVED_VIEWS: SavedRecordingsView[] = [];

const SMART_COLLECTIONS: SmartCollection[] = [
    { id: 'recent-week', name: 'Recent week', description: 'Recordings captured in the last 7 days.' },
    { id: 'longest-calls', name: 'Longest calls', description: 'Sort by duration to surface long conversations first.' },
    { id: 'needs-transcription', name: 'Needs transcription', description: 'Show items where transcription has not completed yet.' },
];

export function RecordingsPage() {
    const router = useRouter();
    const { user } = useUser();
    const { toast } = useToast();

    const {
        page, limit, search, sortBy, sortOrder,
        startDate, endDate, contactId,
        activeViewId, activeSmartCollectionId, linkedRecordingId,
        redirectPath, updateUrl,
        handlePageChange, handleSearchChange, handleSortChange,
        handleDateChange, handleContactChange, applySmartCollection,
    } = useRecordingsFilters();

    const {
        inputMode: searchMode,
        setInputMode: setSearchMode,
        query: semanticQuery,
        setQuery: setSemanticQuery,
        results: semanticResults,
        totalCount: semanticTotalCount,
        engineMode: semanticSearchMode,
        fallbackReason: semanticFallbackReason,
        isSearching: isSemanticSearching,
        hasRun: hasRunSemanticSearch,
        search: runSemanticSearch,
        clear: clearSemanticSearch,
    } = useSemanticSearch(limit);

    const [savedViews, setSavedViews] = useLocalStorage<SavedRecordingsView[]>(SAVED_VIEWS_STORAGE_KEY, EMPTY_SAVED_VIEWS);
    const [isChecklistDismissed, setIsChecklistDismissed] = useLocalStorage<boolean>(CHECKLIST_DISMISSED_STORAGE_KEY, false);

    const [density, setDensity] = useLocalStorage<'comfortable' | 'dense'>(DENSITY_STORAGE_KEY, 'dense');

    const [linkedRecording, setLinkedRecording] = useState<Recording | null>(null);

    // -- Data fetching --
    const queryOptions = useMemo(
        () => ({ page, limit, search, sortBy, sortOrder, startDate, endDate, contactId, includeArchived: false }),
        [page, limit, search, sortBy, sortOrder, startDate, endDate, contactId]
    );
    const { data: recordings, totalCount, isLoading: isLoadingRecordings, error: recordingsError, refetch } = useRecordings(queryOptions);
    const { data: contacts, isLoading: isLoadingContacts } = useContacts();
    const { stats } = useStats();

    // -- Saved views --
    const applySavedView = useCallback((viewId: string) => {
        const view = savedViews.find((item) => item.id === viewId);
        if (!view) return;
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
        setSavedViews(savedViews.filter((view) => view.id !== viewId));
        if (activeViewId === viewId) updateUrl({ view: undefined });
    }, [activeViewId, savedViews, setSavedViews, updateUrl]);

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
        setSavedViews([view, ...savedViews].slice(0, 10));
        updateUrl({ view: view.id });
    }, [contactId, endDate, savedViews, setSavedViews, search, sortBy, sortOrder, startDate, updateUrl]);

    // -- Misc callbacks --
    const dismissChecklist = useCallback(() => setIsChecklistDismissed(true), [setIsChecklistDismissed]);

    const closeLinkedRecording = useCallback(() => {
        setLinkedRecording(null);
        updateUrl({ id: undefined });
    }, [updateUrl]);

    const handleSearchModeChange = useCallback((mode: 'text' | 'semantic') => {
        if (mode === 'text') {
            clearSemanticSearch();
        } else {
            setSearchMode('semantic');
        }
    }, [clearSemanticSearch, setSearchMode]);

    const handleResetAll = useCallback(() => {
        clearSemanticSearch();
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
    }, [clearSemanticSearch, setDensity, updateUrl]);

    const handleLinkedRecordingUpdated = useCallback(async (recording: Recording) => {
        setLinkedRecording(recording);
        await refetch();
    }, [refetch]);

    // -- Derived state --
    const isShowingSemanticResults = !!semanticResults;
    const displayedRecordings = useMemo(() => {
        const source = isShowingSemanticResults ? (semanticResults ?? []) : (recordings ?? []);
        if (activeSmartCollectionId !== 'needs-transcription') return source;
        return source.filter((r) => r.transcriptionStatus !== 'completed');
    }, [activeSmartCollectionId, isShowingSemanticResults, recordings, semanticResults]);

    const displayTotalCount = activeSmartCollectionId === 'needs-transcription'
        ? displayedRecordings.length
        : (isShowingSemanticResults ? semanticTotalCount : totalCount);
    const totalLibraryCount = stats?.totalRecordings ?? totalCount;
    const hasRecordings = totalLibraryCount > 0;
    const hasContacts = (contacts?.length ?? 0) > 0;
    const activeCollectionName = activeSmartCollectionId
        ? SMART_COLLECTIONS.find((item) => item.id === activeSmartCollectionId)?.name ?? activeSmartCollectionId
        : null;
    const filteredContactName = contactId
        ? contacts?.find((c) => c.id === contactId)?.name ?? 'Filtered contact'
        : null;
    const activeViewName = activeViewId
        ? savedViews.find((item) => item.id === activeViewId)?.name ?? 'Saved'
        : null;

    const checklistItems = [
        { id: 'upload', title: 'Upload your first recording', done: hasRecordings, href: '/upload' },
        { id: 'contacts', title: 'Review contacts workspace', done: hasContacts, href: '/contacts' },
        { id: 'semantic', title: 'Run one AI search', done: hasRunSemanticSearch, href: '#semantic-search' },
    ];
    const completedChecklistCount = checklistItems.filter((item) => item.done).length;
    const shouldShowChecklist = !isChecklistDismissed && !isLoadingRecordings && !isLoadingContacts && !recordingsError && (!hasRecordings || !hasContacts);

    // -- Effects --
    useEffect(() => {
        if (!user) router.replace(buildLoginRedirectHref(redirectPath));
    }, [redirectPath, router, user]);

    useEffect(() => {
        if (!user || !linkedRecordingId) return;

        const recordingFromList = (recordings ?? []).find((r) => r.id === linkedRecordingId);
        if (recordingFromList) {
            // Safe: linkedRecording is not in the dep array, so this can't loop.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLinkedRecording(recordingFromList);
            return;
        }

        let cancelled = false;
        void getRecordingDetailsAction(linkedRecordingId)
            .then((result) => {
                if (cancelled) return;
                if ('error' in result) {
                    setLinkedRecording(null);
                    updateUrl({ id: undefined });
                    toast({ title: 'Recording unavailable', description: 'The linked recording could not be opened.', status: 'warning' });
                    return;
                }
                setLinkedRecording(result.recording as Recording);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to open linked recording:', error);
                setLinkedRecording(null);
                updateUrl({ id: undefined });
                toast({ title: 'Recording unavailable', description: 'The linked recording could not be opened.', status: 'warning' });
            });
        return () => { cancelled = true; };
    }, [linkedRecordingId, recordings, toast, updateUrl, user]);

    if (!user) {
        return (
            <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner size="lg" color="current" className="text-primary" />
            </div>
        );
    }

    return (
        <div className="min-w-0 space-y-6">


            <PageHeader
                title="Recordings"
                description={hasRecordings ? 'Your conversations, ready to search and revisit.' : 'Build your searchable archive by uploading your first recording.'}
                meta={<Chip variant="soft" color="default" size="sm">{isShowingSemanticResults ? `${displayTotalCount} AI matches` : `${displayTotalCount} recordings`}</Chip>}
                actions={<Button onPress={() => router.push('/upload')}><Upload className="size-4" />Upload recordings</Button>}
            />
            {(filteredContactName || activeCollectionName || activeViewName) && (
                <div className="flex flex-wrap items-center gap-2">
                    {filteredContactName && <Chip variant="soft" color="default">Contact: {filteredContactName}</Chip>}
                    {activeCollectionName && <Chip variant="soft" color="accent">{activeCollectionName}</Chip>}
                    {activeViewName && <Chip variant="soft" color="default">{activeViewName}</Chip>}
                </div>
            )}

            {shouldShowChecklist && (
                <Surface variant="default" className="rounded-xl border border-border bg-surface p-4 shadow-none">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="warning">Setup {completedChecklistCount}/{checklistItems.length}</Chip>
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
                    onSearchChange={handleSearchChange}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={handleSortChange}
                    startDate={startDate}
                    endDate={endDate}
                    onDateChange={handleDateChange}
                    contacts={contacts ?? []}
                    contactId={contactId}
                    onContactChange={handleContactChange}
                    semanticQuery={semanticQuery}
                    onSemanticQueryChange={(value) => {
                        setSearchMode('semantic');
                        setSemanticQuery(value);
                    }}
                    onSemanticSearch={runSemanticSearch}
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
                        {recordingsError && !isShowingSemanticResults ? (
                            <Alert status="danger">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Title>Unable to load your recordings</Alert.Title>
                                    <Alert.Description>Please try again to reconnect to your library.</Alert.Description>
                                    <Button variant="secondary" size="sm" className="mt-3" onPress={async () => {
                                        try { await refetch(); } catch { /* The fetch error stays visible until recovery. */ }
                                    }}>Try again</Button>
                                </Alert.Content>
                            </Alert>
                        ) : isLoadingRecordings && !isShowingSemanticResults ? (
                            <div className="flex justify-center items-center h-64">
                                <Spinner size="lg" />
                            </div>
                        ) : (
                            <RecordingsTable
                                recordings={displayedRecordings}
                                totalCount={displayTotalCount}
                                page={isShowingSemanticResults ? 1 : page}
                                itemsPerPage={limit}
                                setPage={handlePageChange}
                                onRecordingsChange={refetch}
                                contacts={contacts ?? []}
                                density={density}
                            />
                        )}
                    </div>
                </section>
            </div>

            {linkedRecordingId && linkedRecording && (
                <RecordingDetailsDialog
                    recording={linkedRecording}
                    onOpenChange={(isOpen) => {
                        if (!isOpen) closeLinkedRecording();
                    }}
                    onRecordingUpdated={handleLinkedRecordingUpdated}
                />
            )}
        </div>
    );
}
