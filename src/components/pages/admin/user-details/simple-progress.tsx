import React from 'react';
import { ProgressBar } from '@heroui/react';

type SimpleProgressProps = {
    value: number;
};

export function SimpleProgress({ value }: SimpleProgressProps) {
    const clampedValue = Math.min(Math.max(value, 0), 100);
    const color = clampedValue >= 90 ? 'danger' : 'default';
    return (
        <ProgressBar
            aria-label="Usage"
            value={clampedValue}
            color={color}
            className="w-full"
        >
            <ProgressBar.Track>
                <ProgressBar.Fill />
            </ProgressBar.Track>
        </ProgressBar>
    );
}
