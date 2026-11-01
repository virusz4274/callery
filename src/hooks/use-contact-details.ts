'use client';

import useSWR from 'swr';
import type { Contact } from '@/lib/types';
import { authFetch } from '@/lib/api-client';

/** List links seed this cache; direct links load the owned contact in one request. */
export function useContactDetails(userId: string | undefined, contactId: string | undefined) {
  return useSWR(userId && contactId ? ['contact-detail', userId, contactId] : null, async () => {
    const response = await authFetch(`/api/contacts/${encodeURIComponent(contactId!)}`);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error('Contact details could not be loaded.');
    return (await response.json() as { contact: Contact }).contact;
  }, { revalidateIfStale: true, revalidateOnFocus: true, revalidateOnReconnect: true, shouldRetryOnError: false });
}
