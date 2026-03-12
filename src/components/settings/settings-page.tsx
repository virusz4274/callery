import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

interface SettingsPageProps {
    title: string;
    description: string;
    children: React.ReactNode;
    className?: string;
}

export function SettingsPage({ title, description, children, className }: SettingsPageProps) {
    return (
        <section className={cn('space-y-4', className)}>
            <div className="space-y-2">
                <Chip variant="soft" color="default" className="rounded-full px-3 py-1 text-[11px] font-semibold">
                    {title}
                </Chip>
                <div className="space-y-1">
                    <h3 className="text-xl font-bold tracking-[-0.03em] text-foreground">{title}</h3>
                    <p className="max-w-2xl text-sm leading-6 text-default-500">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}
