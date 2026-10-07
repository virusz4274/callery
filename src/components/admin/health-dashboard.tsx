"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Chip, Button, Input, Spinner, Surface } from '@heroui/react';
import { CheckCircle, AlertTriangle, XCircle, RefreshCw, Server, Database, Cloud, Cpu, Siren, BellRing } from 'lucide-react';
import {
    checkSystemHealth,
    clearAllServiceIncidents,
    clearServiceIncident,
    sendAdminTestEmail,
} from '@/app/actions/admin-health';
import { AdminFeedback } from './admin-feedback';
import type { ExternalServiceIncidentResponse } from '@/lib/db/types';
import { useToast } from '@/components/toast-provider';

type ServiceStatus = {
    name: string;
    status: 'operational' | 'degraded' | 'down' | 'configured' | 'disabled';
    latency: number;
    message?: string;
};

export function HealthDashboard() {
    const { toast } = useToast();
    const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
    const [incidents, setIncidents] = useState<ExternalServiceIncidentResponse[]>([]);
    const [openIncidentCount, setOpenIncidentCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isClearingAll, setIsClearingAll] = useState(false);
    const [clearingIncidentId, setClearingIncidentId] = useState<string | null>(null);
    const [testEmailRecipient, setTestEmailRecipient] = useState('');
    const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

    const [checkedAt, setCheckedAt] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const requestId = useRef(0);

    const fetchHealth = useCallback(async () => {
        const request = ++requestId.current;
        setLoading(true); setError(null);
        try {
            const data = await checkSystemHealth();
            if (request !== requestId.current) return;
            setCheckedAt(data.checkedAt); setStatuses(data.services);
            setIncidents(data.incidents.recent); setOpenIncidentCount(data.incidents.openCount);
        } catch (error) {
            if (request === requestId.current) setError(error instanceof Error ? error.message : 'Please try again.');
        } finally { if (request === requestId.current) setLoading(false); }
    }, []);
    useEffect(() => {
        let active = true;
        const requests = requestId;
        void Promise.resolve().then(() => { if (active) void fetchHealth(); });
        return () => { active = false; requests.current++; };
    }, [fetchHealth]);

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
        const diffMs = checkedAt - new Date(value).getTime();
        const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

        if (diffMinutes < 1) return 'just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours}h ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    };

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-foreground">System health</h2>
                    <p className="text-sm text-muted">Check the core services that keep storage, billing, and transcription running.</p>
                </div>
                <Button
                    aria-label="Refresh system health"
                    className="size-11 shrink-0"
                    isIconOnly
                    variant="ghost"
                    onPress={() => void fetchHealth()}
                    isPending={loading}
                    isDisabled={loading}

                >
                    <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {checkedAt > 0 && <p className="text-xs text-muted">Last checked: {new Date(checkedAt).toLocaleString()}{error ? ' · Data may be out of date' : loading ? ' · Refreshing…' : ''}</p>}
            {error && <AdminFeedback title="Could not check system health" message={error} onRetry={() => void fetchHealth()} pending={loading} />}
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {statuses.map((service) => (
                    <Card key={service.name} className="p-4">
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                            <div className="rounded-2xl bg-surface-secondary p-2 text-muted">
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
                                     service.status === 'configured' || service.status === 'disabled' ? <Server className="size-3" /> :
                                     <XCircle className="size-3" />}
                                    {service.status.toUpperCase()}
                                </span>
                            </Chip>
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">{service.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted">Latency:</span>
                                <span className={`text-xs font-mono ${service.status === 'down' ? 'text-danger' : service.latency > 500 ? 'text-warning' : 'text-muted'}`}>
                                    {service.status === 'configured' || service.status === 'disabled' ? 'Not tested' : `${service.latency}ms`}
                                </span>
                            </div>
                            {service.message && (
                                <p className={`mt-2 break-words rounded-xl p-2 text-sm ${service.status === 'down' ? 'bg-danger/10 text-danger' : service.status === 'degraded' ? 'bg-warning/10 text-warning' : 'bg-surface-secondary text-muted'}`}>
                                    {service.message}
                                </p>
                            )}
                        </div>
                    </Card>
                ))}

                {loading && statuses.length === 0 && (
                    <>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center"><Spinner /></Surface>
                        <Surface variant="secondary" className="flex h-32 items-center justify-center"><Spinner /></Surface>
                    </>
                )}
            </div>

            <Card className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-warning/10 p-2 text-warning">
                                <Siren className="size-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-foreground">Service incidents</h3>
                                <p className="text-sm text-muted">
                                    Deduped runtime failures from Gemini, transcription providers, Stripe, and other external services.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Chip color={!checkedAt ? 'default' : openIncidentCount > 0 ? 'warning' : 'success'} variant="soft">
                            <span className="flex items-center gap-1">
                                <BellRing className="size-3" />
                                {!checkedAt ? loading ? 'Checking incidents…' : 'Incidents unavailable' : openIncidentCount > 0 ? `${openIncidentCount} open` : 'No open incidents'}
                            </span>
                        </Chip>
                        {checkedAt > 0 && openIncidentCount > 0 && (
                            <Button
                                className="min-h-11"
                                variant="ghost"
                                onPress={handleClearAll}
                                isPending={isClearingAll}
                                isDisabled={!!clearingIncidentId || isClearingAll || loading}

                            >
                                Clear all
                            </Button>
                        )}
                    </div>
                </div>

                <div className="mt-4 space-y-3">
                    {!checkedAt ? <p className="text-sm text-muted">{loading ? 'Loading incidents…' : 'Retry the health check to load incidents.'}</p> : incidents.length === 0 ? (
                        <div className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">
                            No active external-service incidents right now.
                        </div>
                    ) : (
                        incidents.map((incident) => (
                            <div
                                key={incident.id}
                                className={`rounded-xl border p-4 ${
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
                                        <p className="text-sm leading-6 text-muted">{incident.message}</p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted md:justify-end">
                                        <span>Seen {incident.occurrenceCount}x</span>
                                        <span>Last {formatRelativeTime(incident.lastSeenAt)}</span>
                                        {incident.httpStatus ? <span>HTTP {incident.httpStatus}</span> : null}
                                        <Button
                                            className="min-h-11"
                                            aria-label={`Clear incident for ${incident.service}`}
                                            variant="ghost"
                                            onPress={() => handleClearIncident(incident.id)}
                                            isPending={clearingIncidentId === incident.id}
                                            isDisabled={!!clearingIncidentId || isClearingAll || loading}

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

            <Card className="p-4">
                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-foreground">Email test</h3>
                        <p className="text-sm text-muted">
                            Send a test admin notification email to verify SMTP delivery.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 md:flex-row">
                        <Input
                            type="email"
                            aria-label="Test email recipient"
                            value={testEmailRecipient}
                            onChange={(event) => setTestEmailRecipient(event.target.value)}
                            placeholder="Leave blank to send to your admin email"
                            className="min-h-11 min-w-0 flex-1"
                        />
                        <Button
                            className="md:min-w-44"
                            onPress={handleSendTestEmail}
                            isPending={isSendingTestEmail}
                            isDisabled={isSendingTestEmail}
                        >
                            Send test email
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}
