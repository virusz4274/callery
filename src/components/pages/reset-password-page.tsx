'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField } from '@heroui/react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useAuth } from '@/lib/firebase/provider';
import { useToast } from '@/components/toast-provider';

export function ResetPasswordPage() {
    const searchParams = useSearchParams();
    const auth = useAuth();
    const { toast } = useToast();

    const initialCode = useMemo(() => searchParams.get('oobCode') || '', [searchParams]);

    const [resetCode, setResetCode] = useState(initialCode);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [codeVerified, setCodeVerified] = useState<boolean | null>(null);

    useEffect(() => {
        setResetCode(initialCode);
    }, [initialCode]);

    useEffect(() => {
        let isActive = true;

        const verifyCode = async () => {
            const trimmedCode = resetCode.trim();

            if (!trimmedCode) {
                setCodeVerified(null);
                return;
            }

            try {
                await verifyPasswordResetCode(auth, trimmedCode);
                if (isActive) {
                    setCodeVerified(true);
                }
            } catch {
                if (isActive) {
                    setCodeVerified(false);
                }
            }
        };

        void verifyCode();

        return () => {
            isActive = false;
        };
    }, [auth, resetCode]);

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
            await confirmPasswordReset(auth, trimmedCode, password);
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
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
            <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-default-200 shadow-xl">
                <Card.Header className="flex flex-col items-start gap-1">
                    <h1 className="text-2xl font-bold">Set New Password</h1>
                    <p className="text-small text-default-500">
                        Use the reset code from your email to set a new password.
                    </p>
                </Card.Header>

                <Card.Content>
                    {isSuccess ? (
                        <div className="space-y-3">
                            <p className="text-sm text-success-700 font-medium">Password updated successfully.</p>
                            <Link href="/login" className="block">
                                <Button variant="primary" className="w-full">
                                    Sign In
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <TextField value={resetCode} onChange={setResetCode} isRequired>
                                <Label>Reset Code</Label>
                                <Input placeholder="Paste oobCode from reset link" />
                            </TextField>

                            {codeVerified === false ? (
                                <p className="text-xs text-danger">
                                    Reset code is invalid or expired. Request a new reset email.
                                </p>
                            ) : null}

                            <TextField value={password} onChange={setPassword} isRequired>
                                <Label>New Password</Label>
                                <Input type="password" placeholder="Minimum 8 characters" />
                            </TextField>

                            <TextField value={confirmPassword} onChange={setConfirmPassword} isRequired>
                                <Label>Confirm Password</Label>
                                <Input type="password" placeholder="Repeat password" />
                            </TextField>

                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full"
                                isDisabled={isSubmitting || codeVerified === false}
                                isPending={isSubmitting}
                            >
                                {isSubmitting ? <Spinner color="current" size="sm" /> : 'Update Password'}
                            </Button>
                        </form>
                    )}
                </Card.Content>

                <Card.Footer>
                    <p className="text-small text-default-500">
                        Need a new code?{' '}
                        <Link href="/forgot-password" className="text-primary font-medium hover:underline">
                            Request reset email
                        </Link>
                    </p>
                </Card.Footer>
            </Card>
        </div>
    );
}
