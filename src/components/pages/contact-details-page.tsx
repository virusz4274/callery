'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, Button, Chip, Skeleton, Surface } from '@heroui/react';
import { useUser } from '@/lib/firebase/provider';
import { useContacts } from '@/hooks/use-contacts';
import { useRecordings } from '@/hooks/use-recordings';
import { ArrowLeft, ArrowRight, Building2, CalendarClock, Phone, Tag, UserRound } from 'lucide-react';

function formatDuration(totalSeconds: number) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}m ${secs}s`;
}

export function ContactDetailsPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { user, isUserLoading } = useUser();
    const { data: contacts, isLoading: isContactsLoading } = useContacts();
    const contactId = params?.id;

    const {
        data: recordings,
        isLoading: isRecordingsLoading,
        totalCount,
    } = useRecordings({
        page: 1,
        limit: 30,
        contactId,
        sortBy: 'date',
        sortOrder: 'desc',
    });

    React.useEffect(() => {
        if (!isUserLoading && !user) {
            router.replace('/login');
        }
    }, [isUserLoading, router, user]);

    if (isUserLoading || isContactsLoading || (isRecordingsLoading && !recordings)) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-40 rounded-[1.8rem]" />
                <div className="grid gap-4 lg:grid-cols-3">
                    <Skeleton className="h-56 rounded-[1.6rem]" />
                    <Skeleton className="h-56 rounded-[1.6rem]" />
                    <Skeleton className="h-56 rounded-[1.6rem]" />
                </div>
            </div>
        );
    }

    const contact = contacts?.find((item) => item.id === contactId);
    if (!contact) {
        return (
            <Surface variant="default" className="rounded-[1.8rem] border border-default-200/80 p-6">
                <h1 className="text-2xl font-bold tracking-[-0.03em] text-foreground">Contact not found</h1>
                <p className="mt-2 text-sm text-default-500">
                    We could not find that contact in your workspace. It may have been merged or removed.
                </p>
                <Link href="/contacts" className="mt-4 inline-flex">
                    <Button variant="secondary" className="rounded-full">
                        <ArrowLeft className="h-4 w-4" />
                        Back to contacts
                    </Button>
                </Link>
            </Surface>
        );
    }

    const allRecordings = recordings || [];
    const totalDuration = allRecordings.reduce((sum, item) => sum + item.duration, 0);
    const recentRecordings = allRecordings.slice(0, 6);
    const timeline = [...allRecordings].sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
    );
    const lastCall = timeline[0];
    const extractedTags = Array.from(
        new Set(
            allRecordings
                .flatMap((recording) => recording.tags || [])
                .filter((tag): tag is string => Boolean(tag && tag.trim()))
        )
    ).slice(0, 10);

    return (
        <div className="relative space-y-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(circle_at_top_right,rgba(38,132,255,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(13,148,136,0.12),transparent_28%)]" />

            <section className="overflow-hidden rounded-[2rem] border border-default-200/80 bg-background/90 shadow-[0_24px_64px_-48px_rgba(15,23,42,0.45)]">
                <div className="grid gap-8 px-5 py-6 md:px-8 md:py-8 xl:grid-cols-[minmax(0,1.05fr)_auto] xl:items-start">
                    <div className="space-y-4">
                        <Link href="/contacts" className="inline-flex items-center gap-2 text-sm font-medium text-default-500 hover:text-foreground">
                            <ArrowLeft className="h-4 w-4" />
                            Back to contacts
                        </Link>
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16 ring-2 ring-default-200/70">
                                <Avatar.Fallback className="text-xl font-semibold bg-primary/15 text-primary">
                                    {(contact.name || 'U').charAt(0).toUpperCase()}
                                </Avatar.Fallback>
                            </Avatar>
                            <div>
                                <h1 className="text-4xl font-black tracking-[-0.05em] text-foreground md:text-5xl">
                                    {contact.name}
                                </h1>
                                <p className="mt-1 text-sm text-default-500">
                                    {contact.jobTitle || 'Contact'}{contact.company ? ` · ${contact.company}` : ''}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Chip variant="soft" color="default">{totalCount || contact.totalRecordings} recordings</Chip>
                            <Chip variant="soft" color="success">{formatDuration(totalDuration)} total talk time</Chip>
                            {lastCall && (
                                <Chip variant="soft" color="accent">
                                    Last call {new Date(lastCall.recordedAt).toLocaleDateString()}
                                </Chip>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row xl:flex-col">
                        <Link href={`/recordings?contact=${contact.id}`}>
                            <Button className="w-full rounded-full px-6 font-semibold">
                                Open recordings view
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                        <Link href="/upload">
                            <Button variant="secondary" className="w-full rounded-full px-6 font-semibold">
                                Upload new calls
                            </Button>
                        </Link>
                    </div>
                </div>

                <div className="grid gap-3 border-t border-default-100/80 bg-default-50/50 px-5 py-5 md:grid-cols-2 xl:grid-cols-4 md:px-8">
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <UserRound className="h-3.5 w-3.5" />
                                Identity
                            </div>
                            <div className="text-lg font-bold text-foreground">{contact.firstName} {contact.lastName}</div>
                            <div className="text-sm text-default-500">{contact.email || 'No email linked'}</div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Phone className="h-3.5 w-3.5" />
                                Phone
                            </div>
                            <div className="text-lg font-bold text-foreground">{contact.phoneNumbers[0] || 'Unavailable'}</div>
                            <div className="text-sm text-default-500">{contact.phoneNumbers.length} phone number(s)</div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Building2 className="h-3.5 w-3.5" />
                                Company
                            </div>
                            <div className="text-lg font-bold text-foreground">{contact.company || 'No company'}</div>
                            <div className="text-sm text-default-500">{contact.jobTitle || 'Role not set'}</div>
                        </div>
                    </Surface>
                    <Surface variant="secondary" className="rounded-[1.5rem] border border-default-200/80 p-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <CalendarClock className="h-3.5 w-3.5" />
                                Activity
                            </div>
                            <div className="text-lg font-bold text-foreground">
                                {lastCall ? new Date(lastCall.recordedAt).toLocaleDateString() : 'No calls yet'}
                            </div>
                            <div className="text-sm text-default-500">Most recent conversation date</div>
                        </div>
                    </Surface>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <Surface variant="default" className="rounded-[1.75rem] border border-default-200/80 p-5">
                    <div className="space-y-4">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                Timeline
                            </div>
                            <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">Recent call timeline</h2>
                        </div>
                        <div className="space-y-3">
                            {timeline.length === 0 && (
                                <div className="rounded-[1rem] border border-default-200 bg-default-50/70 px-4 py-5 text-sm text-default-500">
                                    No recordings linked to this contact yet.
                                </div>
                            )}
                            {timeline.map((recording) => (
                                <article key={recording.id} className="rounded-[1rem] border border-default-200 bg-background px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-foreground">{recording.fileName}</div>
                                            <div className="text-xs text-default-500">{new Date(recording.recordedAt).toLocaleString()}</div>
                                        </div>
                                        <Chip size="sm" variant="soft" color="default">
                                            {formatDuration(recording.duration)}
                                        </Chip>
                                    </div>
                                    {recording.summary && (
                                        <p className="mt-2 line-clamp-2 text-sm text-default-600">{recording.summary}</p>
                                    )}
                                </article>
                            ))}
                        </div>
                    </div>
                </Surface>

                <div className="space-y-6">
                    <Surface variant="default" className="rounded-[1.75rem] border border-default-200/80 p-5">
                        <div className="space-y-4">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                    Recent calls
                                </div>
                                <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">Workspace snippets</h2>
                            </div>
                            <div className="space-y-3">
                                {recentRecordings.map((recording) => (
                                    <div key={recording.id} className="rounded-[1rem] border border-default-200 bg-default-50/60 px-4 py-3">
                                        <div className="text-sm font-semibold text-foreground">{recording.fileName}</div>
                                        <div className="mt-1 text-xs text-default-500">
                                            {new Date(recording.recordedAt).toLocaleDateString()} · {formatDuration(recording.duration)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Surface>

                    <Surface variant="default" className="rounded-[1.75rem] border border-default-200/80 p-5">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-default-400">
                                <Tag className="h-3.5 w-3.5" />
                                Tags and themes
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {extractedTags.length === 0 && (
                                    <span className="text-sm text-default-500">No tags detected yet.</span>
                                )}
                                {extractedTags.map((tagValue) => (
                                    <Chip key={tagValue} variant="soft" color="accent">
                                        {tagValue}
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    </Surface>
                </div>
            </div>
        </div>
    );
}
