
import { Suspense } from 'react';
import { SettingsPage } from '@/components/pages/settings-page';
import { SettingsLoadingState } from '@/components/pages/settings/settings-loading-state';

export default function Settings() {
  return (
    <Suspense fallback={<SettingsLoadingState />}>
      <SettingsPage />
    </Suspense>
  );
}
