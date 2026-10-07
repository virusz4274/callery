import { ProgressBar } from '@heroui/react';

type SimpleProgressProps = {
    value: number;
    label: string;
};

export function SimpleProgress({ value, label }: SimpleProgressProps) {
    const clampedValue = Math.min(Math.max(value, 0), 100);
    const color = clampedValue >= 90 ? 'danger' : 'default';
    return (
        <ProgressBar
            aria-label={label}
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
