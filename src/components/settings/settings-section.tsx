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
            <h3 className="text-lg font-bold tracking-[-0.03em] text-foreground">{title}</h3>
            {description ? (
                <p className="max-w-2xl text-sm leading-6 text-default-500">{description}</p>
            ) : null}
            {children}
        </section>
    );
}
