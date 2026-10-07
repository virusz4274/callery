import { useMemo } from 'react';
import type { Contact } from '@/lib/types';

export function useContactGroups(allContacts: Contact[]) {
    const sortedContacts = useMemo(() => {
        return [...allContacts].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }, [allContacts]);

    const groupedContacts = useMemo(() => {
        return sortedContacts.reduce((accumulator, contact) => {
            const firstLetter = contact.name[0]?.toUpperCase() || '#';
            if (!accumulator[firstLetter]) {
                accumulator[firstLetter] = [];
            }
            accumulator[firstLetter].push(contact);
            return accumulator;
        }, {} as Record<string, Contact[]>);
    }, [sortedContacts]);

    return {
        groupedContacts,
    };
}
