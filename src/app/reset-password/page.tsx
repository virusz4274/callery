import { Suspense } from 'react';
import { ResetPasswordPage } from '@/components/pages/reset-password-page';

export default function ResetPassword() {
    return (
        <Suspense fallback={<div className="p-8 text-center">Loading reset form...</div>}>
            <ResetPasswordPage />
        </Suspense>
    );
}
