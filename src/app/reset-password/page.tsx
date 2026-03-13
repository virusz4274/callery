import { Suspense } from 'react';
import { ResetPasswordPage } from '@/components/pages/reset-password-page';
import { AuthLoadingState } from '@/components/loading-shells';

export default function ResetPassword() {
    return (
        <Suspense fallback={
            <AuthLoadingState
                badge="Set New Password"
                title="Create a new password"
                description="Preparing your reset flow and validating the recovery code from your email."
            />
        }>
            <ResetPasswordPage />
        </Suspense>
    );
}
