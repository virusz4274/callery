'use client';

import { ActionLink } from '@/components/action-link';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Input, Label, Spinner, TextField } from '@heroui/react';
import { AuthShell } from '@/components/auth/auth-shell';
import { useAuthActions } from '@/lib/auth/client';
import { useToast } from '@/components/toast-provider';
import { buildAuthPageHref, resolvePostAuthRedirect } from '@/lib/auth-redirect';

export function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const auth = useAuthActions();
  const { toast } = useToast();
  const destination = resolvePostAuthRedirect(searchParams.get('redirect'));
  const loginHref = buildAuthPageHref('/login', destination);
  const recoveryHref = buildAuthPageHref('/forgot-password', destination);

  const initialCode = useMemo(() => searchParams.get('token') || '', [searchParams]);

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
      const authError = error as { code?: string; message?: string };
      toast({
        title: 'Reset Failed',
        description: authError.message || 'Failed to reset password',
        status: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell

      title="Create a new password"
      description="Enter your reset code and new password."
      footer={
        <p className="text-sm text-default-500">
          Need a new code?{' '}
          <Link href={recoveryHref} className="font-semibold text-primary transition-colors hover:text-primary/80">
            Request another reset email
          </Link>
        </p>
      }
    >
      {isSuccess ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-success/20 bg-success/10 px-5 py-4">
            <p className="text-sm font-semibold text-foreground">Password updated successfully.</p>
            <p className="mt-2 text-sm text-default-500">
              Sign in with your new password to continue where you left off.
            </p>
          </div>

          <ActionLink href={loginHref} variant="primary" className="h-12 w-full font-medium">
              Sign In
            </ActionLink>
        </div>
      ) : !auth.passwordResetEnabled ? (
        <p className="text-sm text-default-600">Password recovery is unavailable on this instance. Contact its administrator.</p>
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
            className="h-12 w-full rounded-lg font-medium"
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
