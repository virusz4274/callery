'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label, Spinner, TextField } from '@heroui/react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth, useUser } from '@/lib/firebase/provider';
import { useToast } from '@/components/toast-provider';

export function ForgotPasswordPage() {
    const { toast } = useToast();
    const auth = useAuth();
    const { user, isUserLoading } = useUser();
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSent, setIsSent] = useState(false);

    useEffect(() => {
        if (user) {
            router.push('/recordings');
        }
    }, [router, user]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            await sendPasswordResetEmail(auth, email.trim());
            setIsSent(true);
        } catch (error) {
            const firebaseError = error as { code?: string; message?: string };
            if (firebaseError.code === 'auth/user-not-found') {
                // Keep UX generic to avoid user enumeration.
                setIsSent(true);
            } else {
                toast({
                    title: 'Reset Failed',
                    description: firebaseError.message || 'Failed to send reset email',
                    status: 'danger',
                });
            }
        } finally {
            setIsSubmitting(false);
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
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
            <Card className="w-full max-w-md bg-card/80 backdrop-blur-xl border border-default-200 shadow-xl">
                <Card.Header className="flex flex-col items-start gap-1">
                    <h1 className="text-2xl font-bold">Reset Password</h1>
                    <p className="text-small text-default-500">
                        Enter your account email and we&apos;ll send a reset link.
                    </p>
                </Card.Header>

                <Card.Content>
                    {isSent ? (
                        <div className="space-y-3">
                            <p className="text-sm text-default-700">
                                If an account exists for <span className="font-medium">{email}</span>, a reset link has been sent.
                            </p>
                            <p className="text-xs text-default-500">
                                Check spam/promotions folders if you don&apos;t see it in your inbox.
                            </p>
                            <Link href="/login" className="block">
                                <Button variant="primary" className="w-full">
                                    Back to Sign In
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <TextField value={email} onChange={setEmail} isRequired>
                                <Label>Email</Label>
                                <Input type="email" placeholder="you@company.com" />
                            </TextField>

                            <Button
                                type="submit"
                                variant="primary"
                                className="w-full"
                                isDisabled={isSubmitting || !email.trim()}
                                isPending={isSubmitting}
                            >
                                {isSubmitting ? <Spinner color="current" size="sm" /> : 'Send Reset Link'}
                            </Button>
                        </form>
                    )}
                </Card.Content>

                <Card.Footer>
                    <p className="text-small text-default-500">
                        Remembered your password?{' '}
                        <Link href="/login" className="text-primary font-medium hover:underline">
                            Sign in
                        </Link>
                    </p>
                </Card.Footer>
            </Card>
        </div>
    );
}
