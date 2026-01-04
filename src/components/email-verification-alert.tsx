
'use client';

import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';

type EmailVerificationAlertProps = {
  user: User | null;
  onResend: () => Promise<void>;
};

export function EmailVerificationAlert({ user, onResend }: EmailVerificationAlertProps) {
  const [isSending, setIsSending] = useState(false);

  const handleResend = async () => {
    setIsSending(true);
    await onResend();
    setIsSending(false);
  };
  
  const isEmailPasswordProvider = user?.providerData.some(
    (provider) => provider.providerId === 'password'
  );

  // Only show the alert if the user is logged in, their email is not verified,
  // and they used email/password to sign up.
  if (!user || user.emailVerified || !isEmailPasswordProvider) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-6">
        <AlertCircle className="h-4 w-4" />
      <AlertTitle>Verify Your Email Address</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <span>
          Your account is not verified. Please check your inbox for a verification link.
        </span>
        <Button onClick={handleResend} disabled={isSending} size="sm" variant="secondary" className="mt-2 sm:mt-0">
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Resend Verification Email
        </Button>
      </AlertDescription>
    </Alert>
  );
}
