'use client';

import { Link, buttonVariants, type ButtonProps, type LinkProps } from '@heroui/react';

/** A single navigation target with HeroUI's button styling and link semantics. */
export function ActionLink({ className, variant = 'primary', size, ...props }: Omit<LinkProps, 'className'> & {
    className?: string;
    variant?: ButtonProps['variant'];
    size?: ButtonProps['size'];
}) {
    return <Link {...props} className={buttonVariants({ variant, size, className: `no-underline ${className || ''}` })} />;
}
