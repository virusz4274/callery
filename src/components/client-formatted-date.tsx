
'use client';

import { useState, useEffect } from 'react';
import { formatInDisplayTimeZone } from '@/lib/timezone';

type ClientFormattedDateProps = {
    date: string | Date;
    formatString: string;
};

export function ClientFormattedDate({ date, formatString }: ClientFormattedDateProps) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // Deferred so the first client render matches the server (no hydration
        // mismatch); the async boundary also keeps this out of the
        // set-state-in-effect rule.
        const id = requestAnimationFrame(() => setIsMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);

    if (!isMounted) {
        return null;
    }

    let text: string;
    try {
        text = formatInDisplayTimeZone(date, formatString);
    } catch {
        console.error("Invalid date provided to ClientFormattedDate:", date);
        text = 'Invalid Date';
    }
    return <>{text}</>;
}
