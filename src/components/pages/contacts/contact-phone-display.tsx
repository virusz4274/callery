'use client';

import { useState } from 'react';
import { Chip } from '@heroui/react';
import { Phone } from 'lucide-react';

type ContactPhoneDisplayProps = {
    phoneNumbers?: string[];
};

export function ContactPhoneDisplay({ phoneNumbers }: ContactPhoneDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!phoneNumbers || phoneNumbers.length === 0) {
        return null;
    }

    return (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <Chip size="sm" variant="soft" color="default" className="max-w-full">
                <Phone className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{phoneNumbers[0]}</span>
            </Chip>

            {isExpanded &&
                phoneNumbers.slice(1).map((number, index) => (
                    <Chip key={index} size="sm" variant="soft" color="default" className="max-w-full">
                        <Phone className="mr-1 h-3 w-3 shrink-0" />
                        <span className="truncate">{number}</span>
                    </Chip>
                ))}

            {!isExpanded && phoneNumbers.length > 1 && (
                <div
                    onClick={(event) => {
                        event.stopPropagation();
                        setIsExpanded(true);
                    }}
                    role="button"
                    className="cursor-pointer"
                >
                    <Chip size="sm" variant="soft" className="cursor-pointer hover:bg-default-200 transition-colors">
                        +{phoneNumbers.length - 1} more
                    </Chip>
                </div>
            )}
        </div>
    );
}
