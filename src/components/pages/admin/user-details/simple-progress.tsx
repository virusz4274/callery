import React from 'react';

type SimpleProgressProps = {
    value: number;
};

export function SimpleProgress({ value }: SimpleProgressProps) {
    const clampedValue = Math.min(Math.max(value, 0), 100);
    const tone = clampedValue >= 90 ? 'from-danger to-danger/80' : 'from-primary to-primary/70';

    return (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-default-100">
            <div
                className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-300`}
                style={{ width: `${clampedValue}%` }}
            />
        </div>
    );
}
