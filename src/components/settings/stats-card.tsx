import { Chip, Surface } from '@heroui/react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
    title: string;
    value: string | number;
    subtitle: string;
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
            className="rounded-[1.5rem] border border-default-200/80 p-4 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.45)]"
        >
            <div className="flex h-full flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-default-400">{title}</p>
                        <div className="text-3xl font-bold tracking-[-0.03em] text-foreground">{value}</div>
                        <p className="text-sm leading-6 text-default-500">{subtitle}</p>
                    </div>

                    <div
                        className={cn(
                            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
                            toneClasses.icon
                        )}
                    >
                        <Icon className="h-5 w-5" />
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
