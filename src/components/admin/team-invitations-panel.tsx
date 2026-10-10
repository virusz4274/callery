'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Label } from '@heroui/react';
import { inviteTeamMember, revokeTeamInvitation, type getTeamAdministration } from '@/app/actions/team';
import { ActionLink } from '@/components/action-link';
import { ClientFormattedDate } from '@/components/client-formatted-date';

type Administration = NonNullable<Awaited<ReturnType<typeof getTeamAdministration>>>;
export function TeamInvitationsPanel({ data }: { data: Administration }) {
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();
    const router = useRouter();
    const run = (action: () => Promise<unknown>, success: string) => startTransition(async () => {
        setError(null); setMessage(null);
        try { await action(); setMessage(success); router.refresh(); }
        catch (e) { setError(e instanceof Error ? e.message : 'Please retry.'); }
    });
    return <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Invite employees to {data.team.companyName}</h2><ActionLink href="/admin/recordings" variant="secondary">Company recordings</ActionLink></div>
        <p className="text-sm text-muted">Invitations last seven days. Each employee must verify the invited email address.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); run(() => inviteTeamMember(email), 'Invitation sent.'); }}>
            <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="invite-email">Employee email</Label><Input id="invite-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="min-h-11" /></div>
            <Button variant="primary" type="submit" isPending={pending} className="min-h-11">Send invitation</Button>
        </form>
        {error && <p role="alert" className="text-danger">{error}</p>}{message && <p role="status">{message}</p>}
        <ul className="divide-y divide-border">{data.invitations.map(i => <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="break-all font-medium">{i.email}</p><p className="text-sm text-muted">{i.status === 'revoked' ? 'Revoked' : <>Valid until <ClientFormattedDate date={i.expiresAt} formatString="PPp" /></>}</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" isDisabled={pending} onPress={() => run(() => inviteTeamMember(i.email), 'Invitation resent.')} className="min-h-11">Resend</Button>{i.status === 'pending' && <Button variant="danger-soft" isDisabled={pending} onPress={() => run(() => revokeTeamInvitation(i.id), 'Invitation revoked.')} className="min-h-11">Revoke</Button>}</div>
        </li>)}</ul>
        {!data.invitations.length && <p className="text-sm text-muted">No pending invitations.</p>}
        <p className="text-sm text-muted">Total audio storage: {(data.storageUsed / 1024 ** 3).toFixed(2)} GB, including former employees. Usage is informational; no quotas are enforced.</p>
    </Card>;
}
