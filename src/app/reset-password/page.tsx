import { Suspense } from 'react';
import { ResetPasswordPage } from '@/components/pages/reset-password-page';

export default function ResetPassword() {
  return (
    <Suspense>
      <ResetPasswordPage />
    </Suspense>
  );
}
