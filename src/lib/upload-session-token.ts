import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

import { featureSigningKey } from '@/lib/signing-key';


function getTokenSigningKey() {
    return featureSigningKey('UPLOAD_SESSION_SECRET', 'upload');
}

export interface UploadSessionPayload extends JWTPayload {
    authSubject: string;
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    googleContactId?: string;
    contactMatchSource?: 'phone' | 'name';
    recordedAtIso: string;
    standardizedDisplayName: string;
}

export async function createUploadSessionToken(payload: UploadSessionPayload): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setAudience('vosift:upload')
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(getTokenSigningKey());
}

export async function verifyUploadSessionToken(token: string): Promise<UploadSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getTokenSigningKey(), { algorithms: ['HS256'], audience: 'vosift:upload' });

        if (
            typeof payload.authSubject !== 'string' ||
            typeof payload.r2Key !== 'string' ||
            typeof payload.fileName !== 'string' ||
            typeof payload.fileSize !== 'number' ||
            typeof payload.mimeType !== 'string' ||
            typeof payload.phoneNumber !== 'string' ||
            typeof payload.recordedAtIso !== 'string' ||
            typeof payload.standardizedDisplayName !== 'string'
        ) {
            return null;
        }

        return {
            authSubject: payload.authSubject,
            r2Key: payload.r2Key,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            mimeType: payload.mimeType,
            contactId: typeof payload.contactId === 'string' ? payload.contactId : null,
            contactName: typeof payload.contactName === 'string' ? payload.contactName : null,
            phoneNumber: payload.phoneNumber,
            contactMatchSource: payload.contactMatchSource === 'phone' || payload.contactMatchSource === 'name' ? payload.contactMatchSource : undefined,
            googleContactId: typeof payload.googleContactId === 'string' ? payload.googleContactId : undefined,
            recordedAtIso: payload.recordedAtIso,
            standardizedDisplayName: payload.standardizedDisplayName,
        };
    } catch {
        return null;
    }
}
