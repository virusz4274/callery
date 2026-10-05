import { useMemo } from 'react';
import type { Contact } from '@/lib/types';

export function useContactGroups(allContacts: Contact[], searchQuery: string) {
    const sortedAndFilteredContacts = useMemo(() => {
        const searchLower = searchQuery.toLowerCase();

        return allContacts
            .filter(
                (contact) =>
                    contact.name.toLowerCase().includes(searchLower) ||
                    contact.phoneNumbers?.some((phone) => phone.includes(searchLower)) ||
                    contact.company?.toLowerCase().includes(searchLower) ||
                    contact.jobTitle?.toLowerCase().includes(searchLower)
            )
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allContacts, searchQuery]);

    const groupedContacts = useMemo(() => {
        return sortedAndFilteredContacts.reduce((accumulator, contact) => {
            const firstLetter = contact.name[0]?.toUpperCase() || '#';
            if (!accumulator[firstLetter]) {
                accumulator[firstLetter] = [];
            }
            accumulator[firstLetter].push(contact);
            return accumulator;
        }, {} as Record<string, Contact[]>);
    }, [sortedAndFilteredContacts]);

    return {
        groupedContacts,
        sortedAndFilteredContacts,
    };
}
