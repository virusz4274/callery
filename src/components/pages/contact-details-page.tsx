'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Accordion, Alert, Avatar, Button, Card, Chip, Link, RouterProvider, Skeleton } from '@heroui/react';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { format } from 'date-fns';
import { useUser } from '@/lib/auth/client';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { useContactDetails } from '@/hooks/use-contact-details';
import { useRecordingWorkspace } from '@/hooks/use-recording-workspace';
import { useRecordings } from '@/hooks/use-recordings';
import { RecordingWorkspace } from '@/components/recording-view/recording-workspace';
import { ClientFormattedDate } from '@/components/client-formatted-date';
import { SummaryExpansionProvider, SummaryPreview } from '@/components/recordings-table/summary-preview';
import { ContactPhoneDisplay } from './contacts/contact-phone-display';

function formatDuration(totalSeconds: number) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
}

// Scope HeroUI's client-side routing to this page; modified clicks retain native link behavior.
export function ContactDetailsPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();
    const navigate = (href: string) => {
        if (href === '/contacts') {
            try {
                const saved = JSON.parse(sessionStorage.getItem('vosift:contacts-return') || 'null');
                if (saved?.id === id && /^\/contacts(?:\?|$)/.test(saved.href)) {
                    router.push(saved.href, { scroll: false });
                    return;
                }
            } catch { /* Direct visits return to the directory. */ }
        }
        router.push(href);
    };
    return <RouterProvider navigate={navigate}><ContactDetailsContent /></RouterProvider>;
}

function ContactDetailsContent() {
    const { id: contactId } = useParams<{ id: string }>();
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const { data: contact, error: contactError, isLoading: isContactsLoading, mutate: retryContact } = useContactDetails(user?.id, contactId);
    const { data: recordings, isLoading: isRecordingsLoading, totalCount, error: recordingsError, refetch: retryRecordings } = useRecordings({
        page: 1, limit: 30, contactId, sortBy: 'date', sortOrder: 'desc',
    });
    const workspace = useRecordingWorkspace(recordings || []);

    useEffect(() => {
        if (!isUserLoading && !user) router.replace(buildLoginRedirectHref(`/contacts/${contactId}`));
    }, [contactId, isUserLoading, router, user]);

    const backLink = <Link href="/contacts" className="min-h-11 gap-2 text-sm"><ArrowLeft aria-hidden="true" className="size-4" />Back to contacts</Link>;

    if (isUserLoading || !user || isContactsLoading) {
        return <div className="space-y-6" role="status" aria-label="Loading contact">
            <Skeleton className="h-11 w-40" />
            <Card><Card.Content><Skeleton className="h-16" /><Skeleton className="mt-3 h-20" /></Card.Content></Card>
            <Card><Card.Content>{[1, 2, 3].map(item => <Skeleton key={item} className="mb-3 h-20" />)}</Card.Content></Card>
        </div>;
    }

    if (contactError || !contact) {
        return <div className="space-y-4">
            {backLink}
            <Card>
                <Card.Header><h1 className="text-xl font-semibold">{contactError ? 'Unable to load contact' : 'Contact not found'}</h1></Card.Header>
                <Card.Content><p className="text-sm text-muted">{contactError ? 'Please try again to load this contact.' : 'This contact may have been merged or removed from your workspace.'}</p></Card.Content>
                {contactError && <Card.Footer><Button variant="secondary" className="min-h-11" onPress={() => void retryContact().catch(() => {})}>Try again</Button></Card.Footer>}
            </Card>
        </div>;
    }

    const timeline = [...(recordings || [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    const recordingCount = recordings ? totalCount : contact.totalRecordings;
    const lastCallAt = contact.lastRecordingAt || timeline[0]?.recordedAt;
    const topics = Array.from(new Set(timeline.flatMap(recording => recording.tags || []).filter(tag => tag?.trim()))).slice(0, 10);
    const recordingsHref = `/recordings?contact=${contact.id}`;

    return <div className="min-w-0 space-y-6">
        {backLink}
        <Card className="min-w-0" data-testid="contact-profile">
            <Card.Header className="gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar size="lg" className="shrink-0"><Avatar.Fallback>{(contact.name || 'U').charAt(0).toUpperCase()}</Avatar.Fallback></Avatar>
                    <div className="min-w-0">
                        <h1 className="break-words text-xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere] md:text-3xl">{contact.name}</h1>
                        {(contact.jobTitle || contact.company) && <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">{[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}</p>}
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <Button onPress={() => router.push(recordingsHref)} className="min-h-11">View recordings<ArrowRight aria-hidden="true" className="size-4" /></Button>
                    <Link href="/upload" className="min-h-11 text-sm">Upload recordings</Link>
                </div>
            </Card.Header>
            <Card.Content>
                <dl className="grid min-w-0 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <div className="min-w-0"><dt className="text-sm text-muted">Phone</dt><dd><ContactPhoneDisplay phoneNumbers={contact.phoneNumbers} contactName={contact.name} /></dd></div>
                    <div className="min-w-0"><dt className="text-sm text-muted">Email</dt><dd className="flex min-h-6 items-center break-all text-sm text-foreground lg:min-h-11">{contact.email || 'No email linked'}</dd></div>
                </dl>
            </Card.Content>
            <Card.Footer className="flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-sm text-muted">
                <span className="tabular-nums">{recordingCount} recording{recordingCount === 1 ? '' : 's'}</span>
                {lastCallAt && <><span aria-hidden="true">·</span><span>Last call <ClientFormattedDate date={lastCallAt} formatString="MMM d, yyyy" /></span></>}
            </Card.Footer>
        </Card>

        <Card className="min-w-0" data-testid="contact-call-history">
            <Card.Header className="gap-1">
                <h2 className="text-base font-semibold">Recent calls</h2>
                <Card.Description>{recordings ? `Showing ${timeline.length} of ${totalCount} recordings, newest first.` : 'Review conversations linked to this contact.'}</Card.Description>
            </Card.Header>
            <Card.Content>
                {recordingsError && <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content><Alert.Title>Could not load call history</Alert.Title><Alert.Description>Try again to refresh the calls linked to this contact.</Alert.Description>
                        <Button variant="secondary" size="sm" className="mt-2 min-h-11" onPress={() => void retryRecordings().catch(() => {})}>Retry calls</Button>
                    </Alert.Content>
                </Alert>}
                {isRecordingsLoading && !recordings ? <div role="status" aria-label="Loading call history" className="space-y-3">
                    {[1, 2, 3].map(item => <Skeleton key={item} className="h-20" />)}
                </div> : !recordingsError && !timeline.length ? <p className="py-4 text-sm text-muted">No recordings linked to this contact yet.</p> : null}
                <SummaryExpansionProvider>
                    <ul className="divide-y divide-border">
                        {timeline.map(recording => <li key={recording.id} className="py-4 first:pt-0 last:pb-0" data-testid="contact-call-row">
                            <div className="mb-2 flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <Button variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-0 text-left" aria-label={`Open recording from ${format(new Date(recording.recordedAt), 'PPp')}`}
                                        onPress={() => workspace.open(recording)}>
                                        <ClientFormattedDate date={recording.recordedAt} formatString="MMM d, yyyy · p" />
                                    </Button>
                                    <p className="text-sm tabular-nums text-muted">{formatDuration(recording.duration)}</p>
                                </div>
                                <Button isIconOnly variant="ghost" className="size-11 shrink-0" aria-label={`Play recording from ${format(new Date(recording.recordedAt), 'PPp')}`}
                                    onPress={() => workspace.open(recording, true)}><Play aria-hidden="true" className="size-4" /></Button>
                            </div>
                            <SummaryPreview recording={recording} density="dense" />
                        </li>)}
                    </ul>
                </SummaryExpansionProvider>
            </Card.Content>
            {timeline.length > 0 && <Card.Footer className="flex-col items-start gap-3 border-t border-border pt-3">
                <Link href={recordingsHref} className="min-h-11 text-sm">View all {totalCount} recording{totalCount === 1 ? '' : 's'}<Link.Icon><ArrowRight className="size-4" /></Link.Icon></Link>
                {topics.length > 0 && <Accordion className="w-full" hideSeparator>
                    <Accordion.Item id="topics"><Accordion.Heading><Accordion.Trigger className="min-h-11 text-sm">Topics in recent calls<Accordion.Indicator /></Accordion.Trigger></Accordion.Heading>
                        <Accordion.Panel><Accordion.Body><div className="flex flex-wrap gap-2">{topics.map(topic => <Chip key={topic} size="sm" variant="soft">{topic}</Chip>)}</div></Accordion.Body></Accordion.Panel>
                    </Accordion.Item>
                </Accordion>}
            </Card.Footer>}
        </Card>
        <RecordingWorkspace workspace={workspace} />
    </div>;
}
