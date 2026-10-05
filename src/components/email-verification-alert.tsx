
"use client";

import { useState } from 'react';
import type { AppUser as User } from '@/lib/auth/types';
import { Alert, Button, Spinner } from '@heroui/react';

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

  const isEmailPasswordProvider = user?.canChangePassword;

  // Only show the alert if the user is logged in, their email is not verified,
  // and they used email/password to sign up.
  if (!user || user.emailVerified || !isEmailPasswordProvider) {
    return null;
  }

  return (
    <div className="mb-6">
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Verify Your Email Address</Alert.Title>
          <Alert.Description className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <span>
              Your account is not verified. Please check your inbox for a verification link.
            </span>
            <Button onPress={handleResend} isDisabled={isSending} size="sm" variant="secondary" className="mt-2 sm:mt-0">
              {isSending ? <Spinner size="sm" color="current" /> : null}
              Resend Verification Email
            </Button>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
