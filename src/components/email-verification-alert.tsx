
'use client';

import React, { useState } from 'react';
import { useUser } from '@/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { sendEmailVerification } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertCircle } from 'lucide-react';

export function EmailVerificationAlert() {
  const { user } = useUser();
  const [isSending, setIsSending] = useState(false);
  const { toast } = useToast();

  const handleResendVerification = async () => {
    if (!user) return;
    
    setIsSending(true);
    try {
      await sendEmailVerification(user);
      toast({
        title: 'Verification Email Sent',
        description: 'Please check your inbox for the verification link.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Sending Email',
        description: error.message || 'Failed to send verification email. Please try again.',
      });
    } finally {
      setIsSending(false);
    }
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
        <Button onClick={handleResendVerification} disabled={isSending} size="sm" variant="secondary" className="mt-2 sm:mt-0">
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Resend Verification Email
        </Button>
      </AlertDescription>
    </Alert>
  );
}
