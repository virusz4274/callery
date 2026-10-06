'use client';

import { useToast } from '@/components/toast-provider';
import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Input, Label, Separator, Spinner, TextField } from '@heroui/react';
import Link from 'next/link';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuthActions, useUser } from '@/lib/auth/client';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  buildAuthPageHref,
  getAuthRedirectCopy,
  resolvePostAuthRedirect,
} from '@/lib/auth-redirect';

export function LoginPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setGoogleLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isCompletingSignIn, setIsCompletingSignIn] = useState(false);

  const auth = useAuthActions();
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const preferCompactLogin = isMobile && auth.googleEnabled;
  const redirectParam = searchParams.get('redirect');
  const authCopy = getAuthRedirectCopy(redirectParam);
  const postAuthPath = resolvePostAuthRedirect(redirectParam);
  const signupHref = buildAuthPageHref('/signup', redirectParam);
  const forgotPasswordHref = buildAuthPageHref('/forgot-password', redirectParam);

  useEffect(() => {
    if (user && !isCompletingSignIn) {
      router.replace(postAuthPath);
    }
  }, [isCompletingSignIn, postAuthPath, user, router]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setIsCompletingSignIn(true);
    setAuthMessage(null);
    try {
      await auth.signInEmail(email, password);

      router.replace(postAuthPath);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      setAuthMessage(errorMessage);
      toast({ title: 'Sign In Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
      setIsCompletingSignIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setIsCompletingSignIn(true);
    setAuthMessage(null);

    try {
      await auth.signInGoogle(postAuthPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not sign in with Google.';
      setAuthMessage(message);
      toast({ title: 'Google Sign-In Failed', description: message, status: 'danger' });
    } finally {
      setGoogleLoading(false);
      setIsCompletingSignIn(false);
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
      description={authCopy.loginDescription}
      compactOnMobile
      footer={
        <p className="text-sm text-default-500">
          Don&apos;t have an account?{' '}
          <Link href={signupHref} className="font-semibold text-primary transition-colors hover:text-primary/80">
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSignIn} className="space-y-5">
        {(authMessage || userError?.message || searchParams.get('error')) && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{authMessage || userError?.message || 'Google sign-in could not be completed. Please try again.'}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {preferCompactLogin && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-default-600">
            On mobile, start with Google or use email below.
          </div>
        )}

        {auth.googleEnabled && <div className="grid gap-3">
          <Button
            type="button"
            variant={preferCompactLogin ? 'primary' : 'ghost'}
            className={`justify-center rounded-2xl transition-colors ${
              preferCompactLogin
                ? 'h-14 border border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'h-12 border border-default-200 bg-background/70 text-foreground hover:border-primary/20 hover:bg-primary/5'
            }`}
            onPress={handleGoogleSignIn}
            isDisabled={!auth.googleEnabled || isGoogleLoading || isLoading || isCompletingSignIn}
          >
            {isGoogleLoading ? (
              <Spinner color="current" size="sm" />
            ) : (
              <GoogleIcon className="mr-2 h-5 w-5" />
            )}
            Sign in with Google
          </Button>

        </div>}

        {preferCompactLogin ? (
          <div className="space-y-4 rounded-xl border border-default-200/80 bg-default-50/60 p-4">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-default-400">
                Or use email
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Email and password</div>
                <p className="text-sm text-default-500">Use this when Google is not the right account.</p>
              </div>
            </div>

            <div className="space-y-4">
              <TextField value={email} onChange={setEmail} isRequired className="gap-2">
                <Label className="text-sm font-medium text-default-600">Email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  className="bg-field text-base"
                />
              </TextField>

              <div className="grid gap-2">
                <TextField value={password} onChange={setPassword} isRequired className="gap-2">
                  <Label className="text-sm font-medium text-default-600">Password</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="bg-field text-base"
                  />
                </TextField>

                <div className="flex justify-end">
                  <Link
                    href={forgotPasswordHref}
                    className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button
                className="h-12 w-full rounded-lg font-medium"
                variant="primary"
                size="lg"
                type="submit"
                isPending={isLoading}
                isDisabled={isLoading || isGoogleLoading || isCompletingSignIn}
              >
                {isLoading ? <Spinner color="current" size="sm" /> : 'Sign In with email'}
              </Button>
            </div>
          </div>
        ) : (
          <>
{auth.googleEnabled && (
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-default-400">
                Or use email
              </span>
              <Separator className="flex-1" />
            </div>
            )}

            <div className="grid gap-4">
              <TextField value={email} onChange={setEmail} isRequired className="gap-2">
                <Label className="text-sm font-medium text-default-600">Email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@company.com"
                  className="bg-field text-base"
                />
              </TextField>

              <div className="grid gap-2">
                <TextField value={password} onChange={setPassword} isRequired className="gap-2">
                  <Label className="text-sm font-medium text-default-600">Password</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="bg-field text-base"
                  />
                </TextField>

                <div className="flex justify-end">
                  <Link
                    href={forgotPasswordHref}
                    className="text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>
            </div>

            <Button
              className="h-12 w-full rounded-lg font-medium"
              variant="primary"
              size="lg"
              type="submit"
              isPending={isLoading}
              isDisabled={isLoading || isGoogleLoading || isCompletingSignIn}
            >
              {isLoading ? <Spinner color="current" size="sm" /> : 'Sign In'}
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
