'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { useToast } from '@/components/toast-provider';
import { clientAuthProvider, useAuthActions, useUser } from '@/lib/auth/client';

export function ResetPasswordPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const actions = useAuthActions();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const isLocal = clientAuthProvider() === 'local';

  React.useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', status: 'danger' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', status: 'danger' });
      return;
    }
    setIsLoading(true);
    try {
      await actions.confirmPasswordReset(token, password);
      toast({ title: 'Password reset', description: 'You can now sign in with your new password.', status: 'success' });
      router.push('/login');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({ title: 'Reset Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isUserLoading || user) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Spinner size="lg" />
      </div>
    );
  }

  // Firebase completes resets in its own email-link handler; this form is local-only.
  if (!isLocal) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl p-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-2">Check Your Email</h1>
          <p className="text-small text-default-500">
            Use the reset link in your email to finish resetting your password, then{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              sign in
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl p-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-2">Invalid Reset Link</h1>
          <p className="text-small text-default-500">
            This link is missing its token.{' '}
            <Link href="/forgot-password" className="font-medium text-primary hover:underline">
              Request a new one
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
      </div>

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
        <Card.Header className="flex flex-col items-center text-center pb-0">
          <h1 className="text-2xl font-bold tracking-tight">New Password</h1>
          <p className="text-small text-default-500 mt-2">Choose a new password for your account.</p>
        </Card.Header>
        <Card.Content className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <TextField value={password} onChange={setPassword} isRequired className="group">
              <Label className="group-focus-within:text-primary transition-colors">New Password</Label>
              <Input type="password" placeholder="••••••••" className="bg-default-50/50" />
            </TextField>
            <TextField value={confirmPassword} onChange={setConfirmPassword} isRequired className="group">
              <Label className="group-focus-within:text-primary transition-colors">Confirm Password</Label>
              <Input type="password" placeholder="••••••••" className="bg-default-50/50" />
            </TextField>
            <Button
              className="w-full font-semibold shadow-lg shadow-primary/20"
              variant="primary"
              size="lg"
              type="submit"
              isPending={isLoading}
              isDisabled={isLoading}
            >
              {isLoading ? <Spinner color="current" size="sm" /> : 'Reset Password'}
            </Button>
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
