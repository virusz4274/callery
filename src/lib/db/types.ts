import { ObjectId } from 'mongodb';

/**
 * User document stored in MongoDB.
 * Links to Firebase Auth via firebaseUid.
 */
export interface User {
    _id: ObjectId;
    firebaseUid: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string;
    phoneNumber: string;
    createdAt: Date;
    updatedAt: Date;
    role: 'user' | 'admin';
    plan: 'Free' | 'Pro';
    timezone: string;
    notificationSettings: {
        activityDigest: 'off' | 'weekly' | 'monthly';
        ingestSuccess: boolean;
        ingestFail: boolean;
    };
    storageSettings: {
        deletionPolicy: 'never' | '3m' | '6m' | '1y';
    };
    storageUsed: number;
    storageAllocation: number;
    transcriptionUsed: number;
    transcriptionAllocation: number;
    totalContacts?: number;
    totalRecordings?: number;
    totalDuration?: number;
}

/**
 * Recording document stored in MongoDB.
 */
export interface Recording {
    _id: ObjectId;
    firebaseUid: string;
    contactId: ObjectId | null;
    contactName: string | null;
    phoneNumber: string;

    // File metadata
    r2Key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;

    // Additional file metadata (new)
    originalFileName?: string; // Original filename from upload
    standardizedDisplayName?: string; // Cached display name for UI

    // Timestamps
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;

    // Transcription
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    transcriptSnippet: string;
    transcript: string;

    // Vector embedding for semantic search (optional, populated when transcription is done)
    transcriptEmbedding?: number[];

    // Metadata
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
}

/**
 * Contact document stored in MongoDB.
 */
export interface Contact {
    _id: ObjectId;
    firebaseUid: string;
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    phoneNumber?: string;
    email: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    company?: string;
    createdAt: Date;
    updatedAt: Date;

    // Stats
    totalRecordings: number;
    lastRecordingAt: Date | null;
}

// Input types for creating new documents (without _id and timestamps)

export type CreateUserInput = Omit<User, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Omit<User, '_id' | 'firebaseUid' | 'createdAt'>>;

export type CreateRecordingInput = Omit<Recording, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateRecordingInput = Partial<Omit<Recording, '_id' | 'firebaseUid' | 'createdAt'>>;

export type CreateContactInput = Omit<Contact, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateContactInput = Partial<Omit<Contact, '_id' | 'firebaseUid' | 'createdAt'>>;

// API response types (with string _id for JSON serialization)

export interface RecordingResponse {
    id: string;
    firebaseUid: string;
    contactId: string | null;
    contactName: string | null;
    phoneNumber: string;
    r2Key: string;
    fileName: string;
    originalFileName?: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    recordedAt: string;
    createdAt: string;
    updatedAt: string;
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    transcriptSnippet: string;
    tags: string[];
    isStarred: boolean;
    isArchived: boolean;
    // Signed URL for playback (generated on request)
    playbackUrl?: string;
}

export interface ContactResponse {
    id: string;
    firebaseUid: string;
    googleContactId?: string;
    name: string;
    phoneNumbers: string[];
    phoneNumber?: string;
    email: string;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    company?: string;
    createdAt: string;
    updatedAt: string;
    totalRecordings: number;
    lastRecordingAt: string | null;
}
