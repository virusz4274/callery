'use server';

import { z } from 'zod';
import { getMongoDb } from '@/lib/mongodb';
import {
    getOpenExternalServiceIncidentCount,
    getOpenExternalServiceIncidents,
    resolveAllOpenExternalServiceIncidents,
    resolveExternalServiceIncidentById,
} from '@/lib/external-service-incidents';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { getStorageClient, storageBucket } from '@/lib/r2';
import { aiProvider, compatTextConfig, geminiApiKey } from '@/lib/config';
import { TranscriptionFactory } from '@/services/transcription/factory';
import { requireCurrentAdmin } from '@/lib/admin-auth';
import type {
    ExternalServiceIncidentResponse,
} from '@/lib/db/types';
import { logAdminAction } from '@/app/actions/audit-log';
import { sendEmail } from '@/lib/email';

type ServiceStatus = {
    name: string;
    status: 'operational' | 'degraded' | 'down' | 'configured' | 'disabled';
    latency: number; // in ms
    message?: string;
};

export type SystemHealthResponse = {
    checkedAt: number;
    services: ServiceStatus[];
    incidents: {
        openCount: number;
        recent: ExternalServiceIncidentResponse[];
    };
};

const IncidentIdSchema = z.string().trim().min(1);
const TestEmailSchema = z.string().trim().email();

export async function checkSystemHealth(): Promise<SystemHealthResponse> {
    await requireCurrentAdmin();

    const results: ServiceStatus[] = [];

    // 1. MongoDB Check
    const mongoStart = performance.now();
    try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        results.push({
            name: 'MongoDB',
            status: 'operational',
            latency: Math.round(performance.now() - mongoStart)
        });
    } catch (e) {
        results.push({
            name: 'MongoDB',
            status: 'down',
            latency: 0,
            message: (e as Error).message
        });
    }

    const storageStart = performance.now();
    try {
        await getStorageClient().send(new HeadBucketCommand({ Bucket: storageBucket() }), { abortSignal: AbortSignal.timeout(5000) });
        results.push({ name: 'S3 storage', status: 'operational', latency: Math.round(performance.now() - storageStart) });
    } catch (error) {
        results.push({ name: 'S3 storage', status: 'down', latency: Math.round(performance.now() - storageStart), message: error instanceof Error ? error.message : 'Storage check failed' });
    }

    const ai = aiProvider();
    const aiConfigured = ai === 'gemini' ? !!geminiApiKey() : !!compatTextConfig();
    results.push({ name: `Text AI (${ai})`, status: aiConfigured ? 'configured' : 'disabled', latency: 0,
        message: aiConfigured ? 'Configuration present; live provider requests are not tested here.' : 'Optional text AI is not configured.' });
    for (const provider of TranscriptionFactory.getAvailableProviders()) {
        results.push({ name: `Transcription (${provider.name})`, status: 'configured', latency: 0,
            message: 'Configuration present; speech requests are not tested here.' });
    }

    const [openCount, recentIncidents] = await Promise.all([
        getOpenExternalServiceIncidentCount(),
        getOpenExternalServiceIncidents(),
    ]);

    return {
        checkedAt: Date.now(),
        services: results,
        incidents: {
            openCount,
            recent: recentIncidents,
        },
    };
}

export async function clearServiceIncident(incidentId: string) {
    const admin = await requireCurrentAdmin();
    const parsed = IncidentIdSchema.safeParse(incidentId);

    if (!parsed.success) {
        return { success: false, error: 'Invalid incident ID' };
    }

    const cleared = await resolveExternalServiceIncidentById(parsed.data);
    if (!cleared) {
        return { success: false, error: 'Incident not found or already cleared' };
    }

    await logAdminAction(
        admin._id.toString(),
        'INCIDENT_CLEAR',
        { incidentId: parsed.data },
        parsed.data,
        'SYSTEM'
    );

    return { success: true };
}

export async function clearAllServiceIncidents() {
    const admin = await requireCurrentAdmin();
    const clearedCount = await resolveAllOpenExternalServiceIncidents();

    await logAdminAction(
        admin._id.toString(),
        'INCIDENT_CLEAR_ALL',
        { clearedCount },
        undefined,
        'SYSTEM'
    );

    return { success: true, clearedCount };
}

export async function sendAdminTestEmail(recipient?: string) {
    const admin = await requireCurrentAdmin();
    const targetEmail = recipient?.trim() || admin.email;
    const parsed = TestEmailSchema.safeParse(targetEmail);

    if (!parsed.success) {
        return { success: false, error: 'Enter a valid email address' };
    }

    const sentAt = new Date();
    const response = await sendEmail({
        to: parsed.data,
        subject: '[Callery] Admin test email',
        html: `
            <h2>Admin test email</h2>
            <p>This email confirms SMTP notifications are working from the Callery admin console.</p>
            <ul>
                <li><strong>Triggered by:</strong> ${admin.email}</li>
                <li><strong>Sent to:</strong> ${parsed.data}</li>
                <li><strong>Sent at:</strong> ${sentAt.toISOString()}</li>
            </ul>
            <p>If you received this, admin email delivery is configured correctly.</p>
        `,
    });

    if (!response.success) {
        const errorMessage = response.error instanceof Error
            ? response.error.message
            : typeof response.error === 'string'
                ? response.error
                : 'Failed to send test email';

        return { success: false, error: errorMessage };
    }

    await logAdminAction(
        admin._id.toString(),
        'TEST_EMAIL_SEND',
        { recipient: parsed.data, messageId: response.messageId },
        undefined,
        'SYSTEM'
    );

    return {
        success: true,
        recipient: parsed.data,
        messageId: response.messageId,
    };
}
