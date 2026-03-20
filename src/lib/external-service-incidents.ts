import * as Sentry from '@sentry/nextjs';
import { ObjectId } from 'mongodb';
import type {
    ExternalServiceIncident,
    ExternalServiceIncidentResponse,
    User,
} from '@/lib/db/types';
import type { ExternalServiceIncidentErrorKind, ExternalServiceIncidentSeverity } from '@/lib/db/types';
import { classifyExternalServiceError, type IncidentClassification } from '@/lib/external-service-incident-classification';
import { Collections, getMongoDb } from '@/lib/mongodb';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';

const DEFAULT_INCIDENT_COOLDOWN_MS = 30 * 60 * 1000;
const STALE_INCIDENT_AFTER_MS = 6 * 60 * 60 * 1000;
const TRANSIENT_ESCALATION_THRESHOLD = 3;

const TRANSIENT_ERROR_KINDS = new Set<ExternalServiceIncidentErrorKind>([
    'quota',
    'rate_limit',
    'network',
    'timeout',
    'upstream_5xx',
]);

export type IncidentContext = Record<string, unknown>;

export type ReportExternalServiceIncidentInput = {
    provider: string;
    service?: string;
    operation: string;
    error: unknown;
    context?: IncidentContext;
    notifyAdmins?: boolean;
    cooldownMs?: number;
};

export type ResolveExternalServiceIncidentInput = {
    provider: string;
    operation: string;
};

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeLabel(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function buildDedupeKey(
    provider: string,
    operation: string,
    errorKind: ExternalServiceIncidentErrorKind
): string {
    return `${normalizeLabel(provider)}:${normalizeLabel(operation)}:${errorKind}`;
}

export { classifyExternalServiceError } from '@/lib/external-service-incident-classification';

function buildSentryFingerprint(provider: string, operation: string, errorKind: ExternalServiceIncidentErrorKind) {
    return ['external-service', normalizeLabel(provider), normalizeLabel(operation), errorKind];
}

function captureIncidentInSentry(
    provider: string,
    service: string,
    operation: string,
    classification: IncidentClassification,
    error: unknown,
    context?: IncidentContext
): string | undefined {
    return Sentry.withScope((scope) => {
        scope.setLevel(classification.severity === 'down' ? 'error' : 'warning');
        scope.setTag('incident.type', 'external_service');
        scope.setTag('provider', normalizeLabel(provider));
        scope.setTag('service', normalizeLabel(service));
        scope.setTag('operation', normalizeLabel(operation));
        scope.setTag('error_kind', classification.errorKind);
        scope.setTag('retryable', String(classification.retryable));

        if (classification.httpStatus) {
            scope.setTag('http_status', String(classification.httpStatus));
        }

        scope.setFingerprint(buildSentryFingerprint(provider, operation, classification.errorKind));
        scope.setContext('external_service', {
            provider,
            service,
            operation,
            httpStatus: classification.httpStatus,
            retryable: classification.retryable,
            ...context,
        });

        if (error instanceof Error) {
            return Sentry.captureException(error);
        }

        return Sentry.captureMessage(classification.message, classification.severity === 'down' ? 'error' : 'warning');
    });
}

function toExternalServiceIncidentResponse(
    incident: ExternalServiceIncident
): ExternalServiceIncidentResponse {
    return {
        id: incident._id.toString(),
        provider: incident.provider,
        service: incident.service,
        operation: incident.operation,
        errorKind: incident.errorKind,
        severity: incident.severity,
        status: incident.status,
        retryable: incident.retryable,
        httpStatus: incident.httpStatus,
        dedupeKey: incident.dedupeKey,
        message: incident.message,
        firstSeenAt: incident.firstSeenAt.toISOString(),
        lastSeenAt: incident.lastSeenAt.toISOString(),
        occurrenceCount: incident.occurrenceCount,
        cooldownUntil: incident.cooldownUntil.toISOString(),
        sentryEventId: incident.sentryEventId,
        sampleContext: incident.sampleContext,
        resolvedAt: incident.resolvedAt?.toISOString(),
        staleAt: incident.staleAt?.toISOString(),
        createdAt: incident.createdAt.toISOString(),
        updatedAt: incident.updatedAt.toISOString(),
    };
}

async function notifyAdminsAboutIncident(incident: ExternalServiceIncident): Promise<void> {
    const db = await getMongoDb();
    const admins = await db
        .collection<User>(Collections.USERS)
        .find({ role: 'admin' }, { projection: { _id: 1, email: 1, firstName: 1, name: 1 } })
        .toArray();

    if (admins.length === 0) {
        return;
    }

    const severityLabel = incident.severity === 'down' ? 'down' : 'degraded';
    const title = `${incident.service} ${severityLabel}`;
    const message = `${incident.operation.replace(/_/g, ' ')} is failing (${incident.errorKind}). ${incident.message.slice(0, 180)}`;
    const escapedService = escapeHtml(incident.service);
    const escapedOperation = escapeHtml(incident.operation.replace(/_/g, ' '));
    const escapedErrorKind = escapeHtml(incident.errorKind);
    const escapedMessage = escapeHtml(incident.message);
    const sampleContext = incident.sampleContext ? escapeHtml(JSON.stringify(incident.sampleContext, null, 2)) : '';

    const notificationJobs = admins.map((admin) =>
        createNotification(
            admin._id,
            incident.severity === 'down' ? 'error' : 'warning',
            title,
            message,
            '/admin'
        )
    );

    const emailJobs = admins
        .filter((admin) => Boolean(admin.email))
        .map((admin) =>
            sendEmail({
                to: admin.email,
                subject: `[vosift] Service incident: ${incident.service} ${severityLabel}`,
                html: `
                    <h2>Service incident detected</h2>
                    <p>Hello ${escapeHtml(admin.firstName || admin.name || 'Admin')},</p>
                    <p>An external service incident was recorded in vosift.</p>
                    <ul>
                        <li><strong>Service:</strong> ${escapedService}</li>
                        <li><strong>Operation:</strong> ${escapedOperation}</li>
                        <li><strong>Severity:</strong> ${escapeHtml(severityLabel)}</li>
                        <li><strong>Error kind:</strong> ${escapedErrorKind}</li>
                        <li><strong>First seen:</strong> ${incident.firstSeenAt.toISOString()}</li>
                        <li><strong>Last seen:</strong> ${incident.lastSeenAt.toISOString()}</li>
                        <li><strong>Occurrences:</strong> ${incident.occurrenceCount}</li>
                    </ul>
                    <p><strong>Message:</strong> ${escapedMessage}</p>
                    ${sampleContext ? `<p><strong>Context:</strong></p><pre>${sampleContext}</pre>` : ''}
                    <p>Open the admin dashboard to monitor or clear the incident.</p>
                `,
            })
        );

    await Promise.allSettled(notificationJobs);
    await Promise.allSettled(emailJobs);
}

function shouldEscalateSeverity(
    classification: IncidentClassification,
    occurrenceCount: number
): ExternalServiceIncidentSeverity {
    if (classification.severity === 'down') {
        return 'down';
    }

    if (TRANSIENT_ERROR_KINDS.has(classification.errorKind) && occurrenceCount >= TRANSIENT_ESCALATION_THRESHOLD) {
        return 'down';
    }

    return classification.severity;
}

export async function reportExternalServiceIncident(
    input: ReportExternalServiceIncidentInput
): Promise<ExternalServiceIncidentResponse> {
    const classification = classifyExternalServiceError(input.error);
    const provider = input.provider;
    const service = input.service || input.provider;
    const operation = input.operation;
    const cooldownMs = input.cooldownMs ?? DEFAULT_INCIDENT_COOLDOWN_MS;
    const dedupeKey = buildDedupeKey(provider, operation, classification.errorKind);
    const now = new Date();
    const db = await getMongoDb();
    const incidents = db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS);
    const sentryEventId = captureIncidentInSentry(provider, service, operation, classification, input.error, input.context);

    const existing = await incidents.findOne({
        dedupeKey,
        status: 'open',
    });

    if (existing) {
        const nextOccurrenceCount = existing.occurrenceCount + 1;
        const nextSeverity = shouldEscalateSeverity(classification, nextOccurrenceCount);
        const shouldNotifyAdmins = Boolean(input.notifyAdmins) && existing.cooldownUntil.getTime() <= now.getTime();

        await incidents.updateOne(
            { _id: existing._id },
            {
                $set: {
                    provider,
                    service,
                    operation,
                    errorKind: classification.errorKind,
                    severity: nextSeverity,
                    retryable: classification.retryable,
                    httpStatus: classification.httpStatus,
                    message: classification.message,
                    lastSeenAt: now,
                    cooldownUntil: new Date(now.getTime() + cooldownMs),
                    sentryEventId,
                    sampleContext: input.context,
                    updatedAt: now,
                },
                $inc: {
                    occurrenceCount: 1,
                },
                $unset: {
                    resolvedAt: '',
                    staleAt: '',
                },
            }
        );

        const updated = await incidents.findOne({ _id: existing._id });
        if (!updated) {
            throw new Error('Failed to reload updated external service incident');
        }

        if (shouldNotifyAdmins) {
            await notifyAdminsAboutIncident(updated);
        }

        return toExternalServiceIncidentResponse(updated);
    }

    const incident: ExternalServiceIncident = {
        _id: new ObjectId(),
        provider,
        service,
        operation,
        errorKind: classification.errorKind,
        severity: classification.severity,
        status: 'open',
        retryable: classification.retryable,
        httpStatus: classification.httpStatus,
        dedupeKey,
        message: classification.message,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrenceCount: 1,
        cooldownUntil: new Date(now.getTime() + cooldownMs),
        sentryEventId,
        sampleContext: input.context,
        createdAt: now,
        updatedAt: now,
    };

    await incidents.insertOne(incident);

    if (input.notifyAdmins) {
        await notifyAdminsAboutIncident(incident);
    }

    return toExternalServiceIncidentResponse(incident);
}

export async function resolveExternalServiceIncident(
    input: ResolveExternalServiceIncidentInput
): Promise<void> {
    const now = new Date();
    const db = await getMongoDb();

    await db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS).updateMany(
        {
            provider: input.provider,
            operation: input.operation,
            status: 'open',
        },
        {
            $set: {
                status: 'resolved',
                resolvedAt: now,
                updatedAt: now,
            },
            $unset: {
                staleAt: '',
            },
        }
    );
}

export async function resolveExternalServiceIncidentById(incidentId: string): Promise<boolean> {
    if (!ObjectId.isValid(incidentId)) {
        return false;
    }

    const now = new Date();
    const db = await getMongoDb();
    const result = await db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS).updateOne(
        {
            _id: new ObjectId(incidentId),
            status: 'open',
        },
        {
            $set: {
                status: 'resolved',
                resolvedAt: now,
                updatedAt: now,
            },
            $unset: {
                staleAt: '',
            },
        }
    );

    return result.modifiedCount > 0;
}

export async function resolveAllOpenExternalServiceIncidents(): Promise<number> {
    const now = new Date();
    const db = await getMongoDb();
    const result = await db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS).updateMany(
        { status: 'open' },
        {
            $set: {
                status: 'resolved',
                resolvedAt: now,
                updatedAt: now,
            },
            $unset: {
                staleAt: '',
            },
        }
    );

    return result.modifiedCount;
}

export async function markStaleExternalServiceIncidents(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_INCIDENT_AFTER_MS);
    const db = await getMongoDb();

    await db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS).updateMany(
        {
            status: 'open',
            lastSeenAt: { $lt: staleBefore },
        },
        {
            $set: {
                status: 'stale',
                staleAt: now,
                updatedAt: now,
            },
        }
    );
}

export async function getOpenExternalServiceIncidents(
    limit: number = 6
): Promise<ExternalServiceIncidentResponse[]> {
    await markStaleExternalServiceIncidents();

    const db = await getMongoDb();
    const incidents = await db
        .collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS)
        .find({ status: 'open' })
        .sort({ severity: -1, lastSeenAt: -1 })
        .limit(limit)
        .toArray();

    return incidents.map(toExternalServiceIncidentResponse);
}

export async function getOpenExternalServiceIncidentCount(): Promise<number> {
    await markStaleExternalServiceIncidents();

    const db = await getMongoDb();
    return db.collection<ExternalServiceIncident>(Collections.EXTERNAL_SERVICE_INCIDENTS).countDocuments({ status: 'open' });
}

export async function safelyReportExternalServiceIncident(
    input: ReportExternalServiceIncidentInput
): Promise<void> {
    try {
        await reportExternalServiceIncident(input);
    } catch (error) {
        logger.error('[ExternalIncident] Failed to record incident:', error);
    }
}
