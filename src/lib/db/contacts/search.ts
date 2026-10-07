import type { Filter } from 'mongodb';
import type { Contact } from '../types';

/** Listing and counting must search the same fields within the same owner. */
export function buildContactSearchFilter(authSubject: string, search?: string): Filter<Contact> {
    const query = search?.trim();
    if (!query) return { authSubject };

    const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
        authSubject,
        $or: ['name', 'phoneNumbers', 'company', 'jobTitle'].map(field => ({
            [field]: { $regex: pattern, $options: 'i' },
        })),
    };
}
