
'use client';

import { useSyncExternalStore } from 'react';

type ClientOnlyProps = {
  children: React.ReactNode;
};

export function ClientOnly({ children }: ClientOnlyProps) {
  const hasMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  if (!hasMounted) {
    return null;
  }

  return <>{children}</>;
}
