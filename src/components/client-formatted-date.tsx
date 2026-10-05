
'use client';

import { format } from 'date-fns';

type ClientFormattedDateProps = {
    date: string | Date;
    formatString: string;
};

export function ClientFormattedDate({ date, formatString }: ClientFormattedDateProps) {
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
        console.error('Invalid date provided to ClientFormattedDate:', date);
        return <>Invalid Date</>;
    }

    return <>{format(parsedDate, formatString)}</>;
}
