import { Label, Meter } from '@heroui/react';

type UsageProgressBarProps = {
    label: string;
    usedLabel: string;
    percent: number;
};

export function UsageProgressBar({ label, usedLabel, percent }: UsageProgressBarProps) {
    const color = percent > 90 ? 'danger' : 'default';
    return (
        <Meter
            value={percent}
            minValue={0}
            maxValue={100}
            color={color}
            className="w-full"
            aria-label={label}
            valueLabel={usedLabel}
        >
            <div className="flex justify-between text-sm mb-1">
                <Label className="text-muted">{label}</Label>
                <Meter.Output className="font-medium" />
            </div>
            <Meter.Track>
                <Meter.Fill />
            </Meter.Track>
        </Meter>
    );
}
