'use client';

import React, { useState } from 'react';
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
        <div className="flex flex-wrap items-center gap-2 mt-2">
            <Chip size="sm" variant="soft" color="default">
                <Phone className="w-3 h-3 mr-1" />
                {phoneNumbers[0]}
            </Chip>

            {isExpanded &&
                phoneNumbers.slice(1).map((number, index) => (
                    <Chip key={index} size="sm" variant="soft" color="default">
                        <Phone className="w-3 h-3 mr-1" />
                        {number}
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
