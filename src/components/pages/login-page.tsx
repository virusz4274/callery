
'use client';

import { useToast } from '@/components/toast-provider';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField, Separator } from '@heroui/react';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AppleIcon } from '@/components/icons/apple-icon';
import Link from 'next/link';
import { useAuth, useUser } from '@/lib/firebase/provider';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { ensureUserProfile } from '@/hooks/firebase/use-user-profile';

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
      router.push('/');
    }
  }, [user, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Session and profile syncing is now handled by FirebaseProvider
      router.push('/');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      toast({ title: 'Sign In Failed', description: errorMessage, status: 'danger' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
      const result = await signInWithPopup(auth, provider);
      // Session and profile syncing is now handled by FirebaseProvider
      router.push('/');
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      if (firebaseError.code !== 'auth/popup-closed-by-user') {
        toast({ title: 'Google Sign-In Failed', description: firebaseError.message || "Could not sign in with Google.", status: 'danger' });
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
            {/* Inline Logo or icon since we might not have the import handy everywhere, but using Lucide for safety if Logo isn't available, or simple text */}
            <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 8.5l-2.5 1.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" /></svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-small text-default-500 mt-2">Sign in to access your call intelligence.</p>
        </Card.Header>
        <Card.Content className="pt-6">
          <form onSubmit={handleSignIn} className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Button
                variant="ghost"
                className="w-full border border-default-200 hover:bg-default-100 transition-colors h-11"
                onPress={handleGoogleSignIn}
                isDisabled={isGoogleLoading || isLoading}
              >
                {isGoogleLoading ? <Spinner color="current" size="sm" /> : <GoogleIcon className="mr-2 h-5 w-5" />}
                Continue with Google
              </Button>
              <Button
                variant="ghost"
                className="w-full border border-default-200 hover:bg-default-100 transition-colors h-11 opacity-70"
                isDisabled
              >
                <AppleIcon className="mr-2 h-5 w-5" />
                Continue with Apple
              </Button>
            </div>

            <div className="flex items-center gap-4 my-2">
              <Separator className="flex-1" />
              <span className="text-xs text-default-400 font-medium uppercase tracking-wider">Or continue with</span>
              <Separator className="flex-1" />
            </div>

            <TextField value={email} onChange={setEmail} isRequired className="group">
              <Label className="group-focus-within:text-primary transition-colors">Email</Label>
              <Input type="email" placeholder="you@company.com" className="bg-default-50/50" />
            </TextField>
            <div className="space-y-2 group">
              <TextField value={password} onChange={setPassword} isRequired>
                <Label className="group-focus-within:text-primary transition-colors">Password</Label>
                <Input type="password" placeholder="••••••••" className="bg-default-50/50" />
              </TextField>
              <div className="flex justify-end">
                <Link href="#" className="font-medium text-primary hover:text-primary/80 transition-colors text-sm">
                  Forgot password?
                </Link>
              </div>
            </div>
            <Button
              className="w-full font-semibold shadow-lg shadow-primary/20"
              variant="primary"
              size="lg"
              type="submit"
              isPending={isLoading}
              isDisabled={isLoading || isGoogleLoading}
            >
              {isLoading ? <Spinner color="current" size="sm" /> : "Sign In"}
            </Button>
          </form>
        </Card.Content>
        <Card.Footer className="flex-col gap-4 pt-0 pb-6">
          <p className="text-small text-center text-default-500">
            Don't have an account?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </Card.Footer>
      </Card>
    </div>
  );
}
