'use client';

import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast-provider';
import type { UsagePricePresentation } from '@/lib/stripe/usage-presentation';
import { UsagePriceExamples } from '@/components/usage-price-examples';

type AutoTopup = { enabled: boolean; thresholdMinor: number; amountMinor: number; dailyCapMinor: number; monthlyCapMinor: number };
type Status = { prepaid: { availableMicros: number; reservedMicros: number; autoTopup?: AutoTopup }; operation?: { id: string; state: string; targetPlanKey: string; paymentUrl?: string; error?: string; sourcePlanUsable?: boolean }; scheduledChange?: { id: string; targetPlanKey: string; effectiveAt?: string }; processing?: { ready: boolean; code?: string }; billingSyncPending?: boolean; usageReady?: boolean; automaticTopupIssue?: string; usagePricing?: UsagePricePresentation; scheduledUsagePricing?: { effectiveAt: string; pricing: UsagePricePresentation }; fundingHeld?: boolean };
const usd = (micros: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(micros / 1_000_000);
export function PrepaidUsageCard() {
    const { toast } = useToast();
    const [status, setStatus] = useState<Status | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [amount, setAmount] = useState('10');
    const [auto, setAuto] = useState<AutoTopup>({ enabled: false, thresholdMinor: 200, amountMinor: 1000, dailyCapMinor: 2000, monthlyCapMinor: 5000 });
    const lifetime = status?.usagePricing?.tier === 'lifetime';
    useEffect(() => {
        const controller = new AbortController();
        void authFetch('/api/stripe/billing/status', { signal: controller.signal }).then(async response => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not load prepaid balance.');
            setStatus(data); if (data.prepaid.autoTopup) setAuto(data.prepaid.autoTopup);
        }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load prepaid balance.'); });
        return () => controller.abort();
    }, []);
    const topup = async () => {
        setBusy(true);
        try {
            const response = await authFetch('/api/stripe/usage-topup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountMinor: Math.round(Number(amount) * 100), currency: 'usd' }) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not start top-up.');
            window.location.href = data.url;
        } catch (error) { toast({ title: 'Top-up needs attention', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' }); setBusy(false); }
    };
    const saveAuto = async () => {
        setBusy(true);
        try {
            const response = await authFetch('/api/stripe/usage-topup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auto) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not update automatic top-ups.');
            toast({ title: auto.enabled ? 'Automatic top-ups enabled with your limits' : 'Automatic top-ups disabled', status: 'success' });
        } catch (error) { toast({ title: 'Could not save top-up limits', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' }); }
        finally { setBusy(false); }
    };
    const cancelPending = async (id?: string) => {
        if (!id) return;
        setBusy(true);
        try {
            const response = await authFetch('/api/stripe/plan-change', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ previewId: id }) });
            const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not cancel this pending change.');
            window.location.reload();
        } catch (error) { toast({ title: 'Plan change needs attention', description: error instanceof Error ? error.message : 'Please try again.', status: 'danger' }); setBusy(false); }
    };
    return <div className="space-y-4 rounded-xl border border-border p-5">
        <h4 className="font-semibold">Prepaid usage credit</h4>
        {error ? <p role="status">{error}</p> : <p>{status ? `${usd(status.prepaid.availableMicros)} available · ${usd(status.prepaid.reservedMicros)} reserved for accepted work` : 'Loading balance…'}</p>}
        <p className="text-sm text-muted">Credit pays for usage beyond included allowances and all Lifetime usage. Credit is added after payment confirmation. Base plan fees are separate.</p>
        {status?.usagePricing && <UsagePriceExamples pricing={status.usagePricing} />}
        <p className="text-xs text-muted">Audio rounds up to 15 seconds before provider weighting. {lifetime ? 'Lifetime has no included usage or per-recording minimum. ' : 'Your included allowance is used first; the displayed minimum applies only to successful recordings with positive overage. '}Enrichment retries reuse the original transcription charge. Invoice lines round to cents at settlement. Deleting files does not reduce the current period’s storage peak.</p>
        {status?.scheduledUsagePricing && <div className="space-y-2 rounded border border-border p-3"><p className="text-sm">New usage prices start {new Date(status.scheduledUsagePricing.effectiveAt).toLocaleDateString()}.</p><UsagePriceExamples pricing={status.scheduledUsagePricing.pricing} /></div>}
        {status?.fundingHeld && <p role="status" className="text-sm">Usage funding is being reconciled. New paid processing will resume after verification.</p>}
        {status?.processing?.ready === false && <p role="status" className="text-sm">AI processing is temporarily paused by the operator. Saved recordings and your billing entitlement remain available.</p>}
        {status?.billingSyncPending && <p role="status" className="text-sm">Your scheduled billing change is being verified. Retry new usage shortly.</p>}
        {status?.scheduledChange && <div role="status" className="space-y-2 text-sm"><p>Downgrade to {status.scheduledChange.targetPlanKey} at renewal{status.scheduledChange.effectiveAt ? ` on ${new Date(status.scheduledChange.effectiveAt).toLocaleString()}` : ''}. Your current plan remains active until then.</p><Button variant="secondary" onPress={() => cancelPending(status.scheduledChange?.id)} isPending={busy}>Cancel scheduled downgrade</Button></div>}
        <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm">Top-up amount (USD)<input className="block w-28 rounded border border-border bg-background p-2" type="number" min="5" max="1000" step="1" value={amount} onChange={event => setAmount(event.target.value)} /></label><Button onPress={topup} isPending={busy} isDisabled={!Number.isFinite(Number(amount)) || Number(amount) < 5}>Add usage credit</Button></div>
        <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">Automatic top-up settings</summary>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={auto.enabled} onChange={event => setAuto({ ...auto, enabled: event.target.checked })} />I authorize charging my saved payment method when credit falls below my threshold, within the limits below.</label>
            <div className="grid grid-cols-2 gap-3">{(['thresholdMinor', 'amountMinor', 'dailyCapMinor', 'monthlyCapMinor'] as const).map((key, index) => <label className="text-sm" key={key}>{['Balance threshold (USD)', 'Top-up amount (USD)', 'Daily cap (USD)', 'Monthly cap (USD)'][index]}<input className="block w-full rounded border border-border bg-background p-2" type="number" min={key === 'thresholdMinor' ? 0 : 5} step="1" value={auto[key] / 100} onChange={event => setAuto({ ...auto, [key]: Math.round(Number(event.target.value) * 100) })} /></label>)}</div>
            <Button variant="secondary" onPress={saveAuto} isPending={busy}>Save automatic top-up settings</Button>
        </details>
        {status?.operation && <p role="status" className="text-sm">Change to {status.operation.targetPlanKey}: {status.operation.state.replaceAll('_', ' ')}. {status.operation.sourcePlanUsable ? 'Your current paid plan stays available while you confirm this change.' : 'New usage resumes after this change finishes.'}</p>}
        {status?.operation && (['draining', 'quoted'].includes(status.operation.state) || status.operation.state === 'awaiting_payment' && status.operation.sourcePlanUsable) && <Button variant="secondary" onPress={() => cancelPending(status.operation?.id)} isPending={busy}>Cancel pending plan change</Button>}
        {status?.operation?.paymentUrl && <a className="text-sm underline" href={status.operation.paymentUrl}>Complete your pending plan payment</a>}
        {status?.operation?.error && <p role="status" className="text-sm">{status.operation.error}</p>}
        {status?.automaticTopupIssue && <p role="status" className="text-sm">{status.automaticTopupIssue}</p>}
    </div>;
}
