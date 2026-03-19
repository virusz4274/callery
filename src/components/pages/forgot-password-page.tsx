'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuth, useUser } from '@/lib/firebase/provider';
import { useToast } from '@/components/toast-provider';
import { buildAuthPageHref, resolvePostAuthRedirect } from '@/lib/auth-redirect';

export function ForgotPasswordPage() {
  const { toast } = useToast();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const loginHref = buildAuthPageHref('/login', redirectParam);
  const postAuthPath = resolvePostAuthRedirect(redirectParam);

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    if (user) {
      router.push(postAuthPath);
    }
  }, [postAuthPath, router, user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setIsSent(true);
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code === 'auth/user-not-found') {
        setIsSent(true);
      } else {
        toast({
          title: 'Reset Failed',
          description: firebaseError.message || 'Failed to send reset email',
          status: 'danger',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isUserLoading || user) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <AuthShell
      badge="Password Recovery"
      title="Reset your password"
      description="Enter the email tied to your workspace and we will send a reset link if an account exists."
      footer={
        <p className="text-sm text-default-500">
          Remembered it?{' '}
          <Link href={loginHref} className="font-semibold text-primary transition-colors hover:text-primary/80">
            Back to sign in
          </Link>
        </p>
      }
    >
      {isSent ? (
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-success/20 bg-success/10 px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              If an account exists for <span className="font-semibold">{email}</span>, a reset link has been sent.
            </p>
            <p className="mt-2 text-sm text-default-500">
              Check spam or promotions if it does not appear in your inbox within a few minutes.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href={loginHref} className="block">
              <Button variant="primary" className="h-12 w-full rounded-full font-semibold">
                Back to Sign In
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="h-12 rounded-full border border-default-200 bg-background/60"
              onPress={() => {
                setIsSent(false);
              }}
            >
              Try another email
            </Button>
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <TextField value={email} onChange={setEmail} isRequired className="gap-2">
            <Label className="text-sm font-medium text-default-600">Email</Label>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              className="bg-default-50/60"
            />
          </TextField>

          <Button
            type="submit"
            variant="primary"
            className="h-12 w-full rounded-full font-semibold shadow-lg shadow-primary/20"
            isDisabled={isSubmitting || !email.trim()}
            isPending={isSubmitting}
          >
            {isSubmitting ? <Spinner color="current" size="sm" /> : 'Send Reset Link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
