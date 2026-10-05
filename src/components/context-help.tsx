'use client';

import { Button, Popover, Tooltip } from '@heroui/react';
import { CircleHelp } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type ContextHelpProps = {
    title: string;
    description: string;
    points?: string[];
    placement?: 'top' | 'bottom' | 'left' | 'right';
    triggerLabel?: string;
};

function HelpContent({
    title,
    description,
    points,
}: Pick<ContextHelpProps, 'title' | 'description' | 'points'>) {
    return (
        <div className="max-w-xs space-y-2 px-1 py-1">
            <div className="text-sm font-semibold text-foreground">{title}</div>
            <p className="text-sm leading-6 text-default-600">{description}</p>
            {points && points.length > 0 && (
                <ul className="space-y-1 text-sm text-default-500">
                    {points.map((point) => (
                        <li key={point} className="flex gap-2">
                            <span className="mt-[0.45rem] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
                            <span>{point}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function ContextHelp({
    title,
    description,
    points,
    placement = 'top',
    triggerLabel,
}: ContextHelpProps) {
    const isMobile = useIsMobile();
    const button = (
        <Button
            isIconOnly
            size="sm"
            variant="ghost"
            aria-label={triggerLabel || `More information about ${title}`}
            className="h-8 w-8 min-w-8 rounded-full text-default-400 hover:bg-default-100 hover:text-foreground"
        >
            <CircleHelp className="h-4 w-4" />
        </Button>
    );

    if (isMobile) {
        return (
            <Popover>
                <Popover.Trigger>{button}</Popover.Trigger>
                <Popover.Content placement="bottom" offset={10} className="max-w-[18rem]">
                    <Popover.Dialog className="p-3">
                        <Popover.Arrow />
                        <HelpContent title={title} description={description} points={points} />
                    </Popover.Dialog>
                </Popover.Content>
            </Popover>
        );
    }

    return (
        <Tooltip delay={150}>
            <Tooltip.Trigger aria-label={triggerLabel || `More information about ${title}`}>
                {button}
            </Tooltip.Trigger>
            <Tooltip.Content placement={placement} offset={10} showArrow className="max-w-[18rem]">
                <Tooltip.Arrow />
                <HelpContent title={title} description={description} points={points} />
            </Tooltip.Content>
        </Tooltip>
    );
}
