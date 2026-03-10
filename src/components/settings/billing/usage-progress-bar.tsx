import React from 'react';

type UsageProgressBarProps = {
    label: string;
    usedLabel: string;
    percent: number;
};

export function UsageProgressBar({ label, usedLabel, percent }: UsageProgressBarProps) {
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-default-500">{label}</span>
                <span className="font-medium">{usedLabel}</span>
            </div>
            <div className="h-2 w-full bg-default-100 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-300 ${percent > 90 ? 'bg-danger' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}
