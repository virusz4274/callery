import { ObjectId } from 'mongodb';

/**
 * Contact document stored in MongoDB.
 */
export interface Contact {
    _id: ObjectId;
    firebaseUid: string;
    googleContactId: string;
    name: string;
    normalizedName: string;
    phoneNumbers: string[];
    normalizedPhoneNumbers: string[];

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

export type CreateContactInput = Omit<Contact, '_id' | 'createdAt' | 'updatedAt'>;
export type UpdateContactInput = Partial<Omit<Contact, '_id' | 'firebaseUid' | 'createdAt'>>;

export interface ContactResponse {
    id: string;
    firebaseUid: string;
    googleContactId: string;
    name: string;
    phoneNumbers: string[];
    email: string | null;
    firstName: string;
    lastName: string;
    jobTitle?: string;
    company?: string;
    createdAt: string;
    updatedAt: string;
    totalRecordings: number;
    lastRecordingAt: string | null;
}
