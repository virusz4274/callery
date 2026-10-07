'use client';

import useSWR from 'swr';
import type { Contact } from '@/lib/types';
import { authFetch } from '@/lib/api-client';

/** List links seed this cache; direct links resolve against the existing paginated API. */
export function useContactDetails(userId: string | undefined, contactId: string | undefined) {
  return useSWR(userId && contactId ? ['contact-detail', userId, contactId] : null, async () => {
    const limit = 100;
    for (let skip = 0; ; skip += limit) {
      const response = await authFetch(`/api/contacts?limit=${limit}&skip=${skip}`);
      if (!response.ok) throw new Error('Contact details could not be loaded.');
      const result = await response.json() as { contacts: Contact[]; totalCount: number };
      const contact = result.contacts.find(item => item.id === contactId);
      if (contact) return contact;
      if (!result.contacts.length || skip + limit >= result.totalCount) return null;
    }
  }, { revalidateIfStale: true, revalidateOnFocus: true, revalidateOnReconnect: true, shouldRetryOnError: false });
}
