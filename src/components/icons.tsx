import Image from 'next/image';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type LogoProps = Omit<ComponentProps<'span'>, 'children'> & { alt?: string };

export function Logo({ className, alt = '', ...props }: LogoProps) {
  return (
    <span
      {...props}
      className={cn('relative inline-block size-8 shrink-0 overflow-hidden align-middle', className)}
    >
      <Image
        src="/brand/callery-logo.png"
        alt={alt}
        fill
        sizes="72px"
        loading="eager"
        // Fill the icon slot using the mark inside the asset's transparent padding.
        className="scale-150 object-contain"
      />
    </span>
  );
}
