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
            <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
            {description ? (
                <p className="max-w-2xl text-sm leading-6 text-default-500">{description}</p>
            ) : null}
            {children}
        </section>
    );
}
