'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Input, Label, Modal, Spinner, TextField } from '@heroui/react';
import { deleteOwnAccount } from '@/app/actions/delete-account';
import { useAuthActions } from '@/lib/auth/client';
import { authClient } from '@/lib/auth/auth-client';
import type { AppUser } from '@/lib/auth/types';
import { buildLoginRedirectHref } from '@/lib/auth-redirect';
import { finishAccountClosure } from '@/lib/account-closure-client';
import { publicEnv } from '@/lib/public-env';
import { useTeamPolicyState } from '@/hooks/use-team-policy';
import { SettingsSection } from './settings-section';

/** Mount with an account-specific key so a confirmation never follows an account switch. */
export function AccountClosureSettings({ user }: { user: AppUser }) {
    const auth = useAuthActions();
    const policy = useTeamPolicyState();
    const [open, setOpen] = useState(false);
    const [confirmationEmail, setConfirmationEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [reauthRequired, setReauthRequired] = useState(false);
    const [pending, setPending] = useState(false);
    const busy = useRef(false);
    const navigating = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    const close = () => {
        if (busy.current) return;
        setOpen(false);
        setConfirmationEmail('');
        setError(null);
        setReauthRequired(false);
    };

    const confirm = async () => {
        if (busy.current || confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()) return;
        busy.current = true;
        setPending(true);
        setError(null);
        try {
            const result = await deleteOwnAccount({ expectedAuthSubject: user.id, confirmationEmail });
            if (result.status === 'deleted' || result.status === 'cleanup_pending') {
                navigating.current = true;
                const left = await finishAccountClosure(user.id, result.status, {
                    currentSubject: async () => {
                        const session = await authClient.getSession();
                        if (session.error) throw new Error('Session lookup unavailable');
                        return session.data?.user.id ?? null;
                    },
                    signOut: () => auth.signOut(),
                    navigate: href => window.location.replace(href),
                });
                if (!left) {
                    navigating.current = false;
                    if (mounted.current) setError('The signed-in account changed. Refresh the page to continue.');
                }
                return;
            }
            if (!mounted.current) return;
            setError(result.message);
            setReauthRequired(result.status === 'reauth_required');
        } catch {
            if (mounted.current) setError('We could not confirm the result. Refresh the page before trying again.');
        } finally {
            if (!navigating.current) {
                busy.current = false;
                if (mounted.current) setPending(false);
            }
        }
    };

    const signInAgain = async () => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        try {
            await auth.signOut();
            // Signing out may unmount Settings; this navigation must still run.
            window.location.replace(buildLoginRedirectHref('/settings?tab=profile'));
        } catch {
            if (mounted.current) setError('We could not sign you out. Try signing in again once your connection is restored.');
        } finally {
            busy.current = false;
            if (mounted.current) setPending(false);
        }
    };

    return <SettingsSection title="Delete account">
        <Card className="gap-0 rounded-xl border border-danger/25 bg-surface p-0 shadow-none">
            <Card.Content className="space-y-4 p-5 sm:p-6">
                {policy.isLoading ? <div role="status" className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />Checking account policy…</div>
                    : policy.error ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Account policy unavailable</Alert.Title>
                        <Alert.Description>Refresh the account policy before deleting your account.</Alert.Description>
                        <Button variant="secondary" className="mt-3 min-h-11" onPress={() => { void policy.retry().catch(() => undefined); }}>Try again</Button>
                    </Alert.Content></Alert>
                        : policy.team?.enabled ? <p className="text-sm leading-6 text-muted">Contact your administrator to remove your access. Company recordings are retained under the company policy.</p>
                            : <>
                                <p className="text-sm leading-6 text-muted">Permanently delete your account, recordings, transcripts, contacts, and exports. This cannot be undone.</p>
                                <Link href="/settings?tab=export" className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">Export your recordings first</Link>
                                <div><Button variant="danger-soft" className="min-h-11" onPress={() => setOpen(true)}>Delete account</Button></div>
                            </>}
            </Card.Content>
        </Card>
        {open && !policy.isLoading && !policy.error && !policy.team?.enabled && <Modal.Backdrop isOpen onOpenChange={next => { if (!next) close(); }} isDismissable={!pending}>
            <Modal.Container size="md" scroll="inside"><Modal.Dialog className="p-0">
                <Modal.CloseTrigger className="size-11" isDisabled={pending} aria-label="Cancel account deletion" />
                <Modal.Header className="px-5 py-4 pr-16"><Modal.Heading>Permanently delete account?</Modal.Heading></Modal.Header>
                <Modal.Body className="space-y-4 px-5 py-4">
                    <p className="text-sm leading-6">Your account and library will be permanently deleted. Access stops immediately; storage cleanup may continue in the background. There is no recovery window.</p>
                    {publicEnv.NEXT_PUBLIC_ENABLE_BILLING && <p className="text-sm leading-6 text-muted">Outstanding charges remain payable. Subscription cancellation follows the existing billing period; deleting your account does not issue a refund.</p>}
                    <Link href="/settings?tab=export" className="inline-flex min-h-11 items-center text-sm text-accent hover:underline">Export your recordings first</Link>
                    <TextField value={confirmationEmail} onChange={setConfirmationEmail} isDisabled={pending || reauthRequired}>
                        <Label>Type your email to confirm</Label>
                        <Input type="email" autoComplete="off" spellCheck={false} aria-describedby="closure-email-hint" className="min-h-11 text-base" />
                    </TextField>
                    <p id="closure-email-hint" className="break-all text-sm text-muted">Enter {user.email}.</p>
                    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                </Modal.Body>
                <Modal.Footer className="flex-wrap gap-2 border-t border-border px-5 py-4">
                    <Button variant="secondary" className="min-h-11" isDisabled={pending} onPress={close}>Cancel</Button>
                    {reauthRequired ? <Button className="min-h-11" isPending={pending} onPress={signInAgain}>Sign in again</Button>
                        : <Button variant="danger" className="min-h-11" isPending={pending} isDisabled={pending || confirmationEmail.trim().toLowerCase() !== user.email.toLowerCase()} onPress={confirm}>Permanently delete account</Button>}
                </Modal.Footer>
            </Modal.Dialog></Modal.Container>
        </Modal.Backdrop>}
    </SettingsSection>;
}
