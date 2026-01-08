
'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';

type ClientFormattedDateProps = {
    date: string | Date;
    formatString: string;
};

export function ClientFormattedDate({ date, formatString }: ClientFormattedDateProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        // To prevent hydration mismatch, we can return a placeholder or null on the server.
        // Returning the unformatted string might be acceptable if it doesn't break layout.
        return null;
    }

    try {
        return <>{format(new Date(date), formatString)}</>;
    } catch {
        console.error("Invalid date provided to ClientFormattedDate:", date);
        return <>Invalid Date</>;
    }
}
