"use client";

import { useEffect, useState } from 'react';
import { Card, Chip, Button, Spinner, Surface } from '@heroui/react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Server, Database, Cloud, Cpu, Siren, BellRing } from 'lucide-react';
import {
    checkSystemHealth,
    clearAllServiceIncidents,
    clearServiceIncident,
    retryFailedAsyncJob,
    sendAdminTestEmail,
} from '@/app/actions/admin-health';
import type { AsyncJobResponse, ExternalServiceIncidentResponse } from '@/lib/db/types';
import { useToast } from '@/components/toast-provider';

type ServiceStatus = {
    name: string;
    status: 'operational' | 'degraded' | 'down';
    latency: number;
    message?: string;
};

export function HealthDashboard() {
    const { toast } = useToast();
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [incidents, setIncidents] = useState<ExternalServiceIncidentResponse[]>([]);
    const [asyncJobs, setAsyncJobs] = useState<{
        queuedCount: number;
        runningCount: number;
        failedCount: number;
        recentFailed: AsyncJobResponse[];
    }>({
        queuedCount: 0,
        runningCount: 0,
        failedCount: 0,
        recentFailed: [],
    });
    const [openIncidentCount, setOpenIncidentCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [clearingIncidentId, setClearingIncidentId] = useState<string | null>(null);
    const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
    const [testEmailRecipient, setTestEmailRecipient] = useState('');
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

    const fetchHealth = async () => {
        setLoading(true);
        try {
            const data = await checkSystemHealth();
            setStatuses(data.services);
            setIncidents(data.incidents.recent);
            setOpenIncidentCount(data.incidents.openCount);
            setAsyncJobs(data.asyncJobs);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHealth();
    }, []);

    const handleClearIncident = async (incidentId: string) => {
        setClearingIncidentId(incidentId);
        try {
            const result = await clearServiceIncident(incidentId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to clear incident');
            }

            toast({
                title: 'Incident cleared',
                description: 'The incident has been marked resolved.',
                status: 'success',
            });
            await fetchHealth();
        } catch (error) {
            toast({
                title: 'Unable to clear incident',
                description: error instanceof Error ? error.message : 'Something went wrong',
                status: 'danger',
            });
        } finally {
            setClearingIncidentId(null);
        }
    };

    const handleClearAll = async () => {
        setIsClearingAll(true);
        try {
            const result = await clearAllServiceIncidents();
            if (!result.success) {
                throw new Error('Failed to clear incidents');
            }

            toast({
                title: 'Incidents cleared',
                description: result.clearedCount > 0
                    ? `Resolved ${result.clearedCount} open incident${result.clearedCount === 1 ? '' : 's'}.`
                    : 'There were no open incidents to clear.',
                status: 'success',
            });
            await fetchHealth();
        } catch (error) {
            toast({
                title: 'Unable to clear incidents',
                description: error instanceof Error ? error.message : 'Something went wrong',
                status: 'danger',
            });
        } finally {
            setIsClearingAll(false);
        }
    };

    const handleSendTestEmail = async () => {
        setIsSendingTestEmail(true);
        try {
            const result = await sendAdminTestEmail(testEmailRecipient);
            if (!result.success) {
                throw new Error(result.error || 'Failed to send test email');
            }

            toast({
                title: 'Test email sent',
                description: `Notification email sent to ${result.recipient}.`,
                status: 'success',
            });
        } catch (error) {
            toast({
                title: 'Email test failed',
                description: error instanceof Error ? error.message : 'Something went wrong',
                status: 'danger',
            });
        } finally {
            setIsSendingTestEmail(false);
        }
    };

    const handleRetryAsyncJob = async (jobId: string) => {
        setRetryingJobId(jobId);
        try {
            const result = await retryFailedAsyncJob(jobId);
            if (!result.success) {
                throw new Error(result.error || 'Failed to retry async job');
            }

            toast({
                title: 'Async job requeued',
                description: 'The job was moved back to the queue and its user-facing state was reset.',
                status: 'success',
            });
            await fetchHealth();
        } catch (error) {
            toast({
                title: 'Unable to retry async job',
                description: error instanceof Error ? error.message : 'Something went wrong',
                status: 'danger',
            });
        } finally {
            setRetryingJobId(null);
        }
    };

    const getIcon = (name: string) => {
        if (name.includes('Mongo')) return <Database className="size-5" />;
        if (name.includes('R2')) return <Cloud className="size-5" />;
        if (name.includes('Gemini')) return <Cpu className="size-5" />;
        return <Server className="size-5" />;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'operational': return 'success';
            case 'degraded': return 'warning';
            case 'down': return 'danger';
            default: return 'default';
        }
    };

    const formatRelativeTime = (value: string) => {
        const diffMs = Date.now() - new Date(value).getTime();
        const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    const getAsyncJobLabel = (type: AsyncJobResponse['type']) => {
        if (type === 'auto_transcription') {
            return 'Auto transcription';
        }

        if (type === 'google_contacts_sync') {
            return 'Google contacts sync';
        }

        return 'Support email';
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-[-0.03em] text-foreground">System health</h2>
                    <p className="text-sm text-default-500">Check the core services that keep storage, billing, and transcription running.</p>
                </div>
                <Button 
                    size="sm" 
                    variant="ghost" 
                    onPress={fetchHealth} 
                    isPending={loading}
                    className="rounded-full"
                >
                    <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {statuses.map((service) => (
                    <Card key={service.name} className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                        <div className="flex items-start justify-between mb-2">
                            <div className="rounded-2xl bg-default-100 p-2 text-default-600">
                                {getIcon(service.name)}
                            </div>
                            <Chip 
                                size="sm" 
                                color={getStatusColor(service.status)}
                                variant="soft"
                            >
                                <span className="flex items-center gap-1">
                                    {service.status === 'operational' ? <CheckCircle className="size-3" /> :
                                     service.status === 'degraded' ? <AlertTriangle className="size-3" /> :
                                     <XCircle className="size-3" />}
                                    {service.status.toUpperCase()}
                                </span>
                            </Chip>
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">{service.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-default-500">Latency:</span>
                                <span className={`text-xs font-mono ${service.latency > 500 ? 'text-warning' : 'text-success'}`}>
                                    {service.latency}ms
                                </span>
                            </div>
                            {service.message && (
                                <p className="mt-2 rounded-xl bg-danger/10 p-2 text-xs text-danger">
                                    {service.message}
                                </p>
                            )}
                        </div>
                    </Card>
                ))}
                
                {loading && statuses.length === 0 && (
                    <>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center rounded-[1.5rem] border border-default-200/80"><Spinner /></Surface>
                    </>
                )}
            </div>

            <Card className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-warning/10 p-2 text-warning">
                                <Siren className="size-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Service incidents</h3>
                                <p className="text-sm text-default-500">
                                    Deduped runtime failures from Gemini, transcription providers, Stripe, and other external services.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Chip color={openIncidentCount > 0 ? 'warning' : 'success'} variant="soft">
                            <span className="flex items-center gap-1">
                                <BellRing className="size-3" />
                                {openIncidentCount > 0 ? `${openIncidentCount} open` : 'No open incidents'}
                            </span>
                        </Chip>
                        {openIncidentCount > 0 && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onPress={handleClearAll}
                                isPending={isClearingAll}
                                className="rounded-full"
                            >
                                Clear all
                            </Button>
                        )}
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {incidents.length === 0 ? (
                        <div className="rounded-[1.25rem] border border-success/20 bg-success/5 p-4 text-sm text-success-700">
                            No active external-service incidents right now.
                        </div>
                    ) : (
                        incidents.map((incident) => (
                            <div
                                key={incident.id}
                                className={`rounded-[1.25rem] border p-4 ${
                                    incident.severity === 'down'
                                        ? 'border-danger/30 bg-danger/5'
                                        : 'border-warning/30 bg-warning/5'
                                }`}
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">
                                                {incident.service} / {incident.operation.replace(/_/g, ' ')}
                                            </p>
                                            <Chip
                                                size="sm"
                                                color={incident.severity === 'down' ? 'danger' : 'warning'}
                                                variant="soft"
                                            >
                                                {incident.severity.toUpperCase()}
                                            </Chip>
                                            <Chip size="sm" variant="soft">
                                                {incident.errorKind}
                                            </Chip>
                                        </div>
                                        <p className="text-sm leading-6 text-default-600">{incident.message}</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500 md:justify-end">
                                        <span>Seen {incident.occurrenceCount}x</span>
                                        <span>Last {formatRelativeTime(incident.lastSeenAt)}</span>
                                        {incident.httpStatus ? <span>HTTP {incident.httpStatus}</span> : null}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onPress={() => handleClearIncident(incident.id)}
                                            isPending={clearingIncidentId === incident.id}
                                            className="rounded-full"
                                        >
                                            Clear
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>

            <Card className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">Email test</h3>
                        <p className="text-sm text-default-500">
                            Send a test admin notification email to verify SMTP delivery.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row">
                        <input
                            type="email"
                            value={testEmailRecipient}
                            onChange={(event) => setTestEmailRecipient(event.target.value)}
                            placeholder="Leave blank to send to your admin email"
                            className="w-full rounded-xl border border-default-200 bg-default-50 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                        />
                        <Button
                            className="rounded-full md:min-w-44"
                            onPress={handleSendTestEmail}
                            isPending={isSendingTestEmail}
                        >
                            Send test email
                        </Button>
                    </div>
                </div>
            </Card>

            <Card className="rounded-[1.5rem] border border-default-200/80 bg-background/95 p-4 shadow-[0_18px_48px_-42px_rgba(15,23,42,0.45)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">Async jobs</h3>
                        <p className="text-sm text-default-500">
                            Durable background work for transcription, Google contacts sync, and support email delivery.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Chip variant="soft" color={asyncJobs.queuedCount > 0 ? 'warning' : 'default'}>
                            {asyncJobs.queuedCount} queued
                        </Chip>
                        <Chip variant="soft" color={asyncJobs.runningCount > 0 ? 'accent' : 'default'}>
                            {asyncJobs.runningCount} running
                        </Chip>
                        <Chip variant="soft" color={asyncJobs.failedCount > 0 ? 'danger' : 'success'}>
                            {asyncJobs.failedCount > 0 ? `${asyncJobs.failedCount} failed` : 'No failed jobs'}
                        </Chip>
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {asyncJobs.recentFailed.length === 0 ? (
                        <div className="rounded-[1.25rem] border border-success/20 bg-success/5 p-4 text-sm text-success-700">
                            No failed async jobs right now.
                        </div>
                    ) : (
                        asyncJobs.recentFailed.map((job) => (
                            <div
                                key={job.id}
                                className="rounded-[1.25rem] border border-danger/20 bg-danger/5 p-4"
                            >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">
                                                {getAsyncJobLabel(job.type)}
                                            </p>
                                            <Chip size="sm" color="danger" variant="soft">
                                                FAILED
                                            </Chip>
                                            <Chip size="sm" variant="soft">
                                                {job.attempts}/{job.maxAttempts} attempts
                                            </Chip>
                                        </div>
                                        <p className="text-sm leading-6 text-default-600">
                                            {job.lastError || 'No error message recorded'}
                                        </p>
                                        <p className="text-xs text-default-500">
                                            User: {job.firebaseUid}
                                            {job.recordingId ? ` • Recording: ${job.recordingId}` : ''}
                                            {job.supportMessageId ? ` • Support message: ${job.supportMessageId}` : ''}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500 md:justify-end">
                                        <span>Updated {formatRelativeTime(job.updatedAt)}</span>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onPress={() => handleRetryAsyncJob(job.id)}
                                            isPending={retryingJobId === job.id}
                                            className="rounded-full"
                                        >
                                            Retry
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
}
