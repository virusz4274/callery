import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
}

export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
    return (
        <section className={cn('space-y-3', className)}>
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">{title}</h3>
                <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                    {title}
                </Chip>
            </div>
            {description ? (
                <p className="max-w-2xl text-sm leading-6 text-default-500">{description}</p>
            ) : null}
            {children}
        </section>
    );
}
