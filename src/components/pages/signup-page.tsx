'use client';

import { useToast } from '@/components/toast-provider';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input, Label, Separator, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AuthShell } from '@/components/auth/auth-shell';
import { ensureUserProfile } from '@/hooks/firebase/use-user-profile';
import { useAuth, useUser } from '@/lib/firebase/provider';
import { isGoogleSignInCancelledError, signInWithGoogle } from '@/lib/firebase/google-sign-in';
import { syncFirebaseSession } from '@/lib/firebase/session-sync';
import {
  buildAuthPageHref,
  getAuthRedirectCopy,
  resolvePostAuthRedirect,
} from '@/lib/auth-redirect';

export function SignupPage() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setGoogleLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isCompletingSignup, setIsCompletingSignup] = useState(false);

  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const authCopy = getAuthRedirectCopy(redirectParam);
  const postAuthPath = resolvePostAuthRedirect(redirectParam);
  const loginHref = buildAuthPageHref('/login', redirectParam);

  useEffect(() => {
    if (user && !isCompletingSignup) {
      router.replace(postAuthPath);
    }
  }, [isCompletingSignup, postAuthPath, user, router]);

  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordError('Passwords do not match');
    } else {
      setPasswordError('');
    }
  }, [password, confirmPassword]);

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      return;
    }
    setIsLoading(true);
    setIsCompletingSignup(true);
    setAuthMessage(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const ensured = await ensureUserProfile(userCredential.user, { firstName, lastName });
      if (!ensured.success) {
        await signOut(auth);
        const message = ensured.error || 'We could not finish setting up your account.';
        setAuthMessage(message);
        toast({ title: 'Sign Up Failed', description: message, status: 'danger' });
        return;
      }

      const sessionResult = await syncFirebaseSession(userCredential.user, {
        auth,
        signOutOnFailure: true,
      });
      if (!sessionResult.ok) {
        setAuthMessage(sessionResult.message);
        toast({ title: 'Sign Up Failed', description: sessionResult.message, status: 'danger' });
        return;
      }

      if (sessionResult.profileEnsureFailed) {
        toast({
          title: 'Workspace sync issue',
          description: 'Your session is active, but some account setup details will retry in the background.',
          status: 'warning',
        });
      }

      router.replace(postAuthPath);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setAuthMessage(errorMessage);
      toast({ title: 'Sign Up Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
      setIsCompletingSignup(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setIsCompletingSignup(true);
    setAuthMessage(null);

    try {
      const result = await signInWithGoogle(auth);
      const sessionResult = await syncFirebaseSession(result.user, {
        auth,
        signOutOnFailure: true,
      });

      if (!sessionResult.ok) {
        setAuthMessage(sessionResult.message);
        toast({
          title: 'Google Sign-In Failed',
          description: sessionResult.message,
          status: 'danger',
        });
        return;
      }

      if (sessionResult.profileEnsureFailed) {
        toast({
          title: 'Workspace sync issue',
          description: 'Your session is active, but some account setup details will retry in the background.',
          status: 'warning',
        });
      }

      router.replace(postAuthPath);
    } catch (error: unknown) {
      const firebaseError = error as { message?: string };
      if (!isGoogleSignInCancelledError(error)) {
        setAuthMessage(firebaseError.message || 'Could not sign in with Google.');
        toast({
          title: 'Google Sign-In Failed',
          description: firebaseError.message || 'Could not sign in with Google.',
          status: 'danger',
        });
      }
    } finally {
      setGoogleLoading(false);
      setIsCompletingSignup(false);
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
      badge="Create Workspace"
      title="Create your account"
      description={authCopy.signupDescription}
      footer={
        <p className="text-sm text-default-500">
          Already have an account?{' '}
          <Link href={loginHref} className="font-semibold text-primary transition-colors hover:text-primary/80">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSignUp} className="space-y-5">
        {authMessage && (
          <div className="rounded-[1.25rem] border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
            {authMessage}
          </div>
        )}

        <div className="grid gap-3">
          <Button
            type="button"
            variant="ghost"
            className="h-12 justify-center rounded-2xl border border-default-200 bg-background/70 text-foreground transition-colors hover:border-primary/20 hover:bg-primary/5"
            onPress={handleGoogleSignIn}
            isDisabled={isGoogleLoading || isLoading || isCompletingSignup}
          >
            {isGoogleLoading ? (
              <Spinner color="current" size="sm" />
            ) : (
              <GoogleIcon className="mr-2 h-5 w-5" />
            )}
            Sign up with Google
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
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField value={firstName} onChange={setFirstName} isRequired className="gap-2">
              <Label className="text-sm font-medium text-default-600">First name</Label>
              <Input
                autoComplete="given-name"
                placeholder="John"
                className="bg-default-50/60"
              />
            </TextField>

            <TextField value={lastName} onChange={setLastName} isRequired className="gap-2">
              <Label className="text-sm font-medium text-default-600">Last name</Label>
              <Input
                autoComplete="family-name"
                placeholder="Doe"
                className="bg-default-50/60"
              />
            </TextField>
          </div>

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

          <TextField value={password} onChange={setPassword} isRequired className="gap-2">
            <Label className="text-sm font-medium text-default-600">Password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              className="bg-default-50/60"
            />
          </TextField>

          <TextField value={confirmPassword} onChange={setConfirmPassword} isRequired isInvalid={!!passwordError} className="gap-2">
            <Label className="text-sm font-medium text-default-600">Confirm password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              className="bg-default-50/60"
            />
            {passwordError ? <p className="text-tiny text-danger">{passwordError}</p> : null}
          </TextField>
        </div>

        <Button
          className="h-12 w-full rounded-full font-semibold shadow-lg shadow-primary/20"
          variant="primary"
          size="lg"
          type="submit"
          isPending={isLoading}
          isDisabled={isLoading || isGoogleLoading || isCompletingSignup || !!passwordError}
        >
          {isLoading ? <Spinner color="current" size="sm" /> : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
