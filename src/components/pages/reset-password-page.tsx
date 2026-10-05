'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuthActions } from '@/lib/auth/client';
import { useToast } from '@/components/toast-provider';

export function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const auth = useAuthActions();
  const { toast } = useToast();

  const initialCode = useMemo(() => searchParams.get('token') || searchParams.get('oobCode') || '', [searchParams]);

  const [editedCode, setResetCode] = useState<string | null>(null);
  const resetCode = editedCode ?? initialCode;
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedCode = resetCode.trim();
    if (!trimmedCode) {
      toast({ title: 'Missing Reset Code', description: 'Reset code is required.', status: 'danger' });
      return;
    }

    if (password.length < 8) {
      toast({ title: 'Weak Password', description: 'Password must be at least 8 characters.', status: 'danger' });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: 'Mismatch', description: 'Passwords do not match.', status: 'danger' });
      return;
    }

    setIsSubmitting(true);
    try {
      await auth.confirmPasswordReset(trimmedCode, password);
      setIsSuccess(true);
    } catch (error) {
      const firebaseError = error as { code?: string; message?: string };
      toast({
        title: 'Reset Failed',
        description: firebaseError.message || 'Failed to reset password',
        status: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      badge="Set New Password"
      title="Create a new password"
      description="Use the reset code from your email to set a new password and return to your workspace securely."
      footer={
        <p className="text-sm text-default-500">
          Need a new code?{' '}
          <Link href="/forgot-password" className="font-semibold text-primary transition-colors hover:text-primary/80">
            Request another reset email
          </Link>
        </p>
      }
    >
      {isSuccess ? (
        <div className="space-y-4">
          <div className="rounded-[1.5rem] border border-success/20 bg-success/10 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">Password updated successfully.</p>
            <p className="mt-2 text-sm text-default-500">
              Sign in with your new password to continue where you left off.
            </p>
          </div>

          <Link href="/login" className="block">
            <Button variant="primary" className="h-12 w-full rounded-full font-semibold">
              Sign In
            </Button>
          </Link>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <TextField value={resetCode} onChange={setResetCode} isRequired className="gap-2">
            <Label className="text-sm font-medium text-default-600">Reset code</Label>
            <Input
              autoComplete="one-time-code"
              placeholder="Reset token from your email link"
              className="bg-default-50/60"
            />
          </TextField>

          {searchParams.get('error') ? (
            <div className="rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              Reset code is invalid or expired. Request a new reset email to continue.
            </div>
          ) : null}

          <TextField value={password} onChange={setPassword} isRequired className="gap-2">
            <Label className="text-sm font-medium text-default-600">New password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              className="bg-default-50/60"
            />
          </TextField>

          <TextField value={confirmPassword} onChange={setConfirmPassword} isRequired className="gap-2">
            <Label className="text-sm font-medium text-default-600">Confirm password</Label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              className="bg-default-50/60"
            />
          </TextField>

          <Button
            type="submit"
            variant="primary"
            className="h-12 w-full rounded-full font-semibold shadow-lg shadow-primary/20"
            isDisabled={isSubmitting}
            isPending={isSubmitting}
          >
            {isSubmitting ? <Spinner color="current" size="sm" /> : 'Update Password'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
