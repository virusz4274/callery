'use client';

import { useEffect, useState } from 'react';
import { Button, SearchField, Spinner } from '@heroui/react';
import { Check } from 'lucide-react';
import { useContacts } from '@/hooks/use-contacts';
import { useContactDetails } from '@/hooks/use-contact-details';
import { useUser } from '@/lib/auth/client';

export function ContactFilterPicker({ contactId, onChange }: { contactId?: string; onChange: (id?: string) => void }) {
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 250);
        return () => clearTimeout(timer);
    }, [search]);
    const { user } = useUser();
    const { data: selected, error: selectedError, mutate: retrySelected } = useContactDetails(user?.id, contactId);
    const { data, isLoading, error, refetch, hasMore, loadMore, isLoadingMore } = useContacts(debouncedSearch);
    const selectedName = selected?.name || selected?.phoneNumbers?.[0];
    const waiting = isLoading || search !== debouncedSearch;
    return <div className="space-y-2" role="group" aria-label="Filter by contact">
        <p className="text-sm font-medium">Contact</p>
        {contactId && <div className="text-sm text-muted" role="status">Selected: {selectedName || 'Contact'}{selectedError && <Button variant="ghost" size="sm" onPress={() => void retrySelected().catch(() => {})}>Retry contact</Button>}</div>}
        <SearchField aria-label="Search contacts" value={search} onChange={setSearch} variant="secondary">
            <SearchField.Group className="min-h-11"><SearchField.SearchIcon /><SearchField.Input placeholder="Name or phone number" className="text-base" /><SearchField.ClearButton aria-label="Clear contact search" /></SearchField.Group>
        </SearchField>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border" aria-label="Contact choices">
            <Button variant="ghost" className="min-h-11 w-full justify-between rounded-none px-3" aria-pressed={!contactId} onPress={() => onChange(undefined)}>All contacts{!contactId && <Check className="size-4" />}</Button>
            {waiting ? <div className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted" role="status"><Spinner size="sm" />Loading contacts…</div> : error ? <div className="p-3 text-sm" role="alert">Unable to load contacts.<Button variant="ghost" onPress={() => void refetch().catch(() => {})}>Try again</Button></div> : <>
                {data?.map(contact => <Button key={contact.id} variant="ghost" className="h-auto min-h-11 w-full justify-between rounded-none px-3 py-2 text-left" aria-pressed={contact.id === contactId} onPress={() => onChange(contact.id)}>
                    <span className="min-w-0 break-words whitespace-normal">{contact.name || contact.phoneNumbers?.[0] || 'Unknown contact'}</span>{contact.id === contactId && <Check className="size-4 shrink-0" />}
                </Button>)}
                {!data?.length && <p className="p-3 text-sm text-muted">No matching contacts</p>}
                {hasMore && <Button variant="secondary" className="min-h-11 w-full rounded-none" isPending={isLoadingMore} onPress={loadMore}>Load more contacts</Button>}
            </>}
        </div>
    </div>;
}
