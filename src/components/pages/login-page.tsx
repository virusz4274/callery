'use client';

import { useToast } from '@/components/toast-provider';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, Separator, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AppleIcon } from '@/components/icons/apple-icon';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuth, useUser } from '@/lib/firebase/provider';
import { isGoogleSignInCancelledError, signInWithGoogle } from '@/lib/firebase/google-sign-in';

export function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setGoogleLoading] = useState(false);

  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/recordings');
    }
  }, [user, router]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/recordings');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({ title: 'Sign In Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);

    try {
      await signInWithGoogle(auth);
      router.replace('/recordings');
    } catch (error: unknown) {
      const firebaseError = error as { message?: string };
      if (!isGoogleSignInCancelledError(error)) {
        toast({
          title: 'Google Sign-In Failed',
          description: firebaseError.message || 'Could not sign in with Google.',
          status: 'danger',
        });
      }
    } finally {
      setGoogleLoading(false);
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
      badge="Sign In"
      title="Welcome back"
      description="Sign in to open your recordings workspace, search transcripts, and continue review without losing context."
      footer={
        <p className="text-sm text-default-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-primary transition-colors hover:text-primary/80">
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSignIn} className="space-y-5">
        <div className="grid gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-12 justify-center rounded-2xl border border-default-200 bg-background/70 text-foreground transition-colors hover:border-primary/20 hover:bg-primary/5"
            onPress={handleGoogleSignIn}
            isDisabled={isGoogleLoading || isLoading}
          >
            {isGoogleLoading ? (
              <Spinner color="current" size="sm" />
            ) : (
              <GoogleIcon className="mr-2 h-5 w-5" />
            )}
            Continue with Google
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="h-12 justify-center rounded-2xl border border-dashed border-default-200 bg-background/50 text-default-500"
            isDisabled
          >
            <AppleIcon className="mr-2 h-5 w-5" />
            Apple sign in coming soon
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-default-400">
            Or use email
          </span>
          <Separator className="flex-1" />
        </div>

        <div className="grid gap-4">
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

          <div className="grid gap-2">
            <TextField value={password} onChange={setPassword} isRequired className="gap-2">
              <Label className="text-sm font-medium text-default-600">Password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                className="bg-default-50/60"
              />
            </TextField>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        </div>

        <Button
          className="h-12 w-full rounded-full font-semibold shadow-lg shadow-primary/20"
          variant="primary"
          size="lg"
          type="submit"
          isPending={isLoading}
          isDisabled={isLoading || isGoogleLoading}
        >
          {isLoading ? <Spinner color="current" size="sm" /> : 'Sign In'}
        </Button>
      </form>
    </AuthShell>
  );
}
