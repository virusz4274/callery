'use client';

import { useId, useState } from 'react';
import { Button } from '@heroui/react';

type ContactPhoneDisplayProps = {
    phoneNumbers?: string[];
    contactName: string;
};

export function ContactPhoneDisplay({ phoneNumbers, contactName }: ContactPhoneDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const numbersId = useId();

    if (!phoneNumbers || phoneNumbers.length === 0) {
        return <span className="flex min-h-6 items-center text-sm text-muted lg:min-h-11">No phone number</span>;
    }

    return (
        <div className="min-w-0 text-sm text-muted">
            <span className="flex min-h-6 items-center break-all tabular-nums lg:min-h-11">{phoneNumbers[0]}</span>
            <div id={numbersId} hidden={!isExpanded} className="space-y-2 break-all tabular-nums">
                {phoneNumbers.slice(1).map((number, index) => <p key={index}>{number}</p>)}
            </div>
            {phoneNumbers.length > 1 && (
                <Button variant="ghost" size="sm" type="button" aria-expanded={isExpanded} aria-controls={numbersId}
                    aria-label={`${isExpanded ? 'Show fewer' : 'Show all'} phone numbers for ${contactName}`}
                    onPress={() => setIsExpanded(!isExpanded)}
                    className="min-h-11 text-accent lg:min-h-8">
                    {isExpanded ? 'Show fewer' : `+${phoneNumbers.length - 1} more`}
                </Button>
            )}
        </div>
    );
}
