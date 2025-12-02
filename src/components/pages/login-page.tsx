
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AppleIcon } from '@/components/icons/apple-icon';
import Link from 'next/link';
import { Separator } from '../ui/separator';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, User, UserCredential, linkWithCredential } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';


async function ensureUserProfile(firestore: any, user: User) {
    const userRef = doc(firestore, 'users', user.uid);
    const userDocSnap = await getDoc(userRef);

    if (!userDocSnap.exists()) {
        const [firstName, ...lastName] = user.displayName?.split(' ') || [];
        const userProfile = {
            id: user.uid,
            email: user.email,
            firstName: firstName || '',
            lastName: lastName.join(' ') || '',
            createdAt: serverTimestamp(),
            role: 'user',
            plan: 'Free',
            storageUsed: 0,
            storageAllocation: 0.1, // Free tier
            transcriptionUsed: 0,
            transcriptionAllocation: 15, // Free tier
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            notificationSettings: {
                activityDigest: 'weekly',
                ingestSuccess: true,
                ingestFail: true,
            },
            storageSettings: {
                deletionPolicy: 'never',
            }
        };
        await setDoc(userRef, userProfile, { merge: true });
        return true; // Profile was created
    }
    return false; // Profile already existed
}


export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setGoogleLoading] = useState(false);
  
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

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
      await ensureUserProfile(firestore, userCredential.user);
      
      toast({
        title: "Sign In Successful",
        description: "Welcome back!",
      });
      router.push('/');
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign In Failed",
        description: error.message || "An unknown error occurred.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const wasProfileCreated = await ensureUserProfile(firestore, result.user);
      
      if (wasProfileCreated) {
         toast({
          title: "Account Created",
          description: "Welcome! Your profile has been created.",
        });
      } else {
         toast({
          title: "Sign In Successful",
          description: "Welcome back!",
        });
      }
      router.push('/');
    } catch (error: any) {
      if (error.code === 'auth/account-exists-with-different-credential' && auth.currentUser) {
          const credential = GoogleAuthProvider.credentialFromError(error);
          if (credential) {
              try {
                  await linkWithCredential(auth.currentUser, credential);
                  toast({
                      title: "Account Linked",
                      description: "Your Google account has been successfully linked.",
                  });
                   router.push('/');
              } catch (linkError: any) {
                   toast({
                      variant: "destructive",
                      title: "Account Linking Failed",
                      description: linkError.message || "Could not link Google account.",
                  });
              }
          }
      } else {
          toast({
              variant: "destructive",
              title: "Google Sign-In Failed",
              description: error.message || "Could not sign in with Google.",
          });
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  if (isUserLoading || user) {
     return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
        <Loader2 className="h-16 w-16 animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Welcome Back</CardTitle>
          <CardDescription>Sign in to access your call recordings.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignIn}>
          <CardContent className="space-y-4">
              <div className="space-y-2">
                  <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn} disabled={isGoogleLoading || isLoading}>
                      {isGoogleLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <GoogleIcon className="mr-2 h-5 w-5" />}
                      Sign in with Google
                  </Button>
                  <Button variant="outline" className="w-full" disabled>
                      <AppleIcon className="mr-2 h-5 w-5" />
                      Sign in with Apple
                  </Button>
              </div>
            <div className="flex items-center gap-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">OR</span>
              <Separator className="flex-1" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="#" className="text-sm font-medium text-primary hover:underline">
                      Forgot password?
                  </Link>
              </div>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4">
            <Button className="w-full" type="submit" disabled={isLoading || isGoogleLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
            <p className="text-sm text-center text-muted-foreground">
                Don't have an account?{' '}
                <Link href="/signup" className="font-medium text-primary hover:underline">
                  Sign up
                </Link>
              </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
