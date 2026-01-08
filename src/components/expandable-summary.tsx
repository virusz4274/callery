"use client";

import React, { useState } from 'react';
import { Button } from '@heroui/react';
import { cn } from '@/lib/utils';

interface ExpandableSummaryProps {
    text: string;
    compactMaxLength: number;
    className?: string;
    expandLabel?: string;
    collapseLabel?: string;
}

export function ExpandableSummary({
    text,
    compactMaxLength,
    className,
    expandLabel = "More",
    collapseLabel = "Less"
}: ExpandableSummaryProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!text) return null;

    if (text.length <= compactMaxLength) {
        return <div className={cn("text-sm text-default-600", className)}>{text}</div>;
    }

    const displayText = isExpanded ? text : `${text.slice(0, compactMaxLength)}...`;

    return (
        <div className={cn("text-sm text-default-600", className)}>
            <span className={isExpanded ? "" : "break-words"}>
                {displayText}
            </span>
            <div onClick={(e) => e.stopPropagation()} className="inline-block ml-1">
                <Button
                    size="sm"
                    variant="ghost"
                    onPress={() => {
                        setIsExpanded(!isExpanded);
                    }}
                    className="h-auto min-w-0 px-1 py-0 text-xs font-semibold data-[hover=true]:bg-transparent text-primary"
                >
                    {isExpanded ? collapseLabel : expandLabel}
                </Button>
            </div>
        </div>
    );
}

