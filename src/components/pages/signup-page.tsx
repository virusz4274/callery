
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GoogleIcon } from '@/components/icons/google-icon';
import { AppleIcon } from '@/components/icons/apple-icon';
import Link from 'next/link';
import { Separator } from '../ui/separator';

export function SignupPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Create an Account</CardTitle>
          <CardDescription>Get started with your smart call organizer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="space-y-2">
                <Button variant="outline" className="w-full">
                    <GoogleIcon className="mr-2 h-5 w-5" />
                    Sign up with Google
                </Button>
                <Button variant="outline" className="w-full">
                    <AppleIcon className="mr-2 h-5 w-5" />
                    Sign up with Apple
                </Button>
            </div>
          <div className="flex items-center gap-4">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">OR</span>
            <Separator className="flex-1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" placeholder="Create a password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input id="confirm-password" type="password" placeholder="Confirm your password" />
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button className="w-full">Create Account</Button>
           <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
