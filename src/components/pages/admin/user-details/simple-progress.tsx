import React from 'react';

type SimpleProgressProps = {
    value: number;
};

export function SimpleProgress({ value }: SimpleProgressProps) {
    return (
        <div className="h-2 w-full rounded-full bg-default-200">
            <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
            />
        </div>
    );
}
