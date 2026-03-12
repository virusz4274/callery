import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const TOKEN_SECRET =
    process.env.UPLOAD_SESSION_SECRET ||
    process.env.SHARE_LINK_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'development' ? 'dev-upload-token-secret-change-in-prod' : '');

function getTokenSigningKey() {
    if (!TOKEN_SECRET) {
        throw new Error('Missing UPLOAD_SESSION_SECRET (or SHARE_LINK_SECRET/NEXTAUTH_SECRET)');
    }

    return new TextEncoder().encode(TOKEN_SECRET);
}

export interface UploadSessionPayload extends JWTPayload {
    firebaseUid: string;
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    googleContactId?: string;
    recordedAtIso: string;
    standardizedDisplayName: string;
}

export async function createUploadSessionToken(payload: UploadSessionPayload): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('2h')
        .sign(getTokenSigningKey());
}

export async function verifyUploadSessionToken(token: string): Promise<UploadSessionPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getTokenSigningKey());

        if (
            typeof payload.firebaseUid !== 'string' ||
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
            firebaseUid: payload.firebaseUid,
            r2Key: payload.r2Key,
            fileName: payload.fileName,
            fileSize: payload.fileSize,
            mimeType: payload.mimeType,
            contactId: typeof payload.contactId === 'string' ? payload.contactId : null,
            contactName: typeof payload.contactName === 'string' ? payload.contactName : null,
            phoneNumber: payload.phoneNumber,
            googleContactId: typeof payload.googleContactId === 'string' ? payload.googleContactId : undefined,
            recordedAtIso: payload.recordedAtIso,
            standardizedDisplayName: payload.standardizedDisplayName,
        };
    } catch {
        return null;
    }
}
