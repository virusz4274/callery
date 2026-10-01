'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { useToast } from '@/components/toast-provider';
import { useAuthActions, useUser } from '@/lib/auth/client';

export function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const actions = useAuthActions();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  React.useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await actions.requestPasswordReset(email);
      setSent(true);
    } catch (error: unknown) {
      // Don't leak account existence: Firebase throws auth/user-not-found for
      // unknown emails, but the UI must look identical either way.
      const code = (error as { code?: string }).code;
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') {
        setSent(true);
        return;
      }
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({ title: 'Request Failed', description: errorMessage, status: 'danger' });
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

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
      </div>

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
        <Card.Header className="flex flex-col items-center text-center pb-0">
          <h1 className="text-2xl font-bold tracking-tight">Reset Password</h1>
          <p className="text-small text-default-500 mt-2">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </Card.Header>
        <Card.Content className="pt-6">
          {sent ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-default-600">
                If an account exists for <strong>{email}</strong>, a password reset link is on its way.
              </p>
              <Link href="/login" className="font-medium text-primary hover:underline text-sm">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField value={email} onChange={setEmail} isRequired className="group">
                <Label className="group-focus-within:text-primary transition-colors">Email</Label>
                <Input type="email" placeholder="you@company.com" className="bg-default-50/50" />
              </TextField>
              <Button
                className="w-full font-semibold shadow-lg shadow-primary/20"
                variant="primary"
                size="lg"
                type="submit"
                isPending={isLoading}
                isDisabled={isLoading}
              >
                {isLoading ? <Spinner color="current" size="sm" /> : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </Card.Content>
        <Card.Footer className="flex-col gap-4 pt-0 pb-6">
          <p className="text-small text-center text-default-500">
            Remembered it?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}
