
'use client';

import { useToast } from '@/components/toast-provider';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField, Separator } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AppleIcon } from '@/components/icons/apple-icon';
import Link from 'next/link';
import { useAuthActions, useUser } from '@/lib/auth/client';
import { ensureUserProfile } from '@/hooks/firebase/use-user-profile';

export function SignupPage() {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setGoogleLoading] = useState(false);
  const passwordError = confirmPassword && password !== confirmPassword ? 'Passwords do not match' : '';

  const actions = useAuthActions();
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return;
    }
    setIsLoading(true);
    try {
      const newUser = await actions.signUpEmail(`${firstName} ${lastName}`.trim(), email, password);
      await ensureUserProfile(newUser, { firstName, lastName });
      router.push('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: 'Sign Up Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);

    try {
      const newUser = await actions.signInGoogle();
      // Local Google sign-in redirects away (null here); Firebase returns the user.
      if (newUser) {
        await ensureUserProfile(newUser);
      }
      router.push('/');
    } catch (error: unknown) {
      const authError = error as { code?: string; message?: string };
      if (authError.code !== 'auth/popup-closed-by-user') {
        toast({ title: 'Google Sign-In Failed', description: authError.message || "Could not sign in with Google.", status: 'danger' });
      }
    } finally {
      setGoogleLoading(false);
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
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-primary/10 blur-3xl opacity-40 animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full bg-secondary/10 blur-3xl opacity-40" />
      </div>

      <Card className="w-full max-w-md bg-card/70 backdrop-blur-xl border border-default-200 shadow-2xl">
        <Card.Header className="flex flex-col items-center text-center pb-0">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4 p-2 shadow-inner">
            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create an Account</h1>
          <p className="text-small text-default-500 mt-2">Enter your details to get started.</p>
        </Card.Header>
        <Card.Content className="pt-6">
          <form onSubmit={handleSignUp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {actions.googleEnabled && (
                <Button
                  variant="ghost"
                  className="w-full border border-default-200 hover:bg-default-100 transition-colors h-11"
                  onPress={handleGoogleSignIn}
                  isDisabled={isGoogleLoading || isLoading}
                >
                  {isGoogleLoading ? <Spinner color="current" size="sm" /> : <GoogleIcon className="mr-2 h-5 w-5" />}
                  Sign up with Google
                </Button>
              )}
              <span title="Apple sign-in is coming soon" className="w-full">
                <Button
                  variant="ghost"
                  className="w-full border border-default-200 hover:bg-default-100 transition-colors h-11 opacity-70"
                  isDisabled
                >
                  <AppleIcon className="mr-2 h-5 w-5" />
                  Sign up with Apple
                </Button>
              </span>
            </div>

            <div className="flex items-center gap-4 my-2">
              <Separator className="flex-1" />
              <span className="text-xs text-default-400 font-medium uppercase tracking-wider">Or continue with</span>
              <Separator className="flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <TextField value={firstName} onChange={setFirstName} isRequired className="group">
                <Label className="group-focus-within:text-primary transition-colors">First Name</Label>
                <Input placeholder="John" className="bg-default-50/50" />
              </TextField>
              <TextField value={lastName} onChange={setLastName} isRequired className="group">
                <Label className="group-focus-within:text-primary transition-colors">Last Name</Label>
                <Input placeholder="Doe" className="bg-default-50/50" />
              </TextField>
            </div>
            <TextField value={email} onChange={setEmail} isRequired className="group">
              <Label className="group-focus-within:text-primary transition-colors">Email</Label>
              <Input type="email" placeholder="you@company.com" className="bg-default-50/50" />
            </TextField>
            <TextField value={password} onChange={setPassword} isRequired className="group">
              <Label className="group-focus-within:text-primary transition-colors">Password</Label>
              <Input type="password" placeholder="Create a password" className="bg-default-50/50" />
            </TextField>
            <TextField value={confirmPassword} onChange={setConfirmPassword} isRequired isInvalid={!!passwordError} className="group">
              <Label className="group-focus-within:text-primary transition-colors">Confirm Password</Label>
              <Input type="password" placeholder="Confirm your password" className="bg-default-50/50" />
              {passwordError && <p className="text-tiny text-danger mt-1">{passwordError}</p>}
            </TextField>

            <Button
              className="w-full font-semibold shadow-lg shadow-primary/20"
              variant="primary"
              size="lg"
              type="submit"
              isPending={isLoading}
              isDisabled={isLoading || isGoogleLoading || !!passwordError}
            >
              {isLoading ? <Spinner color="current" size="sm" /> : "Sign Up"}
            </Button>
          </form>
        </Card.Content>
        <Card.Footer className="flex-col gap-4 pt-0 pb-6">
          <p className="text-small text-center text-default-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}
