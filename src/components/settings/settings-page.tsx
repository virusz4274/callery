
import { cn } from "@/lib/utils";

interface SettingsPageProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsPage({ title, description, children, className }: SettingsPageProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}
