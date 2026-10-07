import { Chip, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    statusLabel?: string;
    icon: LucideIcon;
    tone?: 'accent' | 'success' | 'warning' | 'default';
}

export function StatsCard({
    title,
    value,
    subtitle,
    statusLabel,
    icon: Icon,
    tone = 'default',
}: StatsCardProps) {
    const toneClasses = {
        accent: {
            icon: 'bg-accent/10 text-accent',
            chip: 'accent' as const,
        },
        success: {
            icon: 'bg-success/10 text-success',
            chip: 'success' as const,
        },
        warning: {
            icon: 'bg-warning/10 text-warning',
            chip: 'warning' as const,
        },
        default: {
            icon: 'bg-default-100 text-default-500',
            chip: 'default' as const,
        },
    }[tone];

    return (
        <Surface
            variant="secondary"
            className="rounded-xl border border-border p-4"
        >
            <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                        <p className="text-sm font-medium text-muted">{title}</p>
                        <div className="break-words text-2xl font-semibold tabular-nums tracking-tight text-foreground md:text-3xl">{value}</div>
                        {subtitle && <p className="text-sm leading-6 text-default-500">{subtitle}</p>}
                    </div>

                    <div
                        className={cn(
                            'hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex',
                            toneClasses.icon
                        )}
                    >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                </div>

                {statusLabel && (
                    <div className="pt-1">
                        <Chip size="sm" variant="soft" color={toneClasses.chip} className="rounded-full">
                            {statusLabel}
                        </Chip>
                    </div>
                )}
            </div>
        </Surface>
    );
}
