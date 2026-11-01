'use client';

import { useState, useTransition } from 'react';
import { Button, Card } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { importBillingCatalog, publishBillingCatalog, refreshBillingCatalogAcceptance, setBillingOfferPaused, getBillingCatalogValidation, type getBillingCatalogReview } from '@/app/actions/admin-billing-catalog';
import { BillingCatalogReview } from './billing-catalog-review';
import { installationCatalogImportTemplate } from '@/lib/installation-defaults';

type Review = Awaited<ReturnType<typeof getBillingCatalogReview>>;
const template = JSON.stringify(installationCatalogImportTemplate(), null, 2);

export function BillingCatalogPanel({ initial }: { initial: Review }) {
    const router = useRouter(), [pending, startTransition] = useTransition();
    const [input, setInput] = useState(template), [evidence, setEvidence] = useState(''), [selected, setSelected] = useState<Review['drafts'][number] | undefined>(initial.drafts[0]);
    const [validation, setValidation] = useState(initial.validation);
    const [reviewed, setReviewed] = useState(false), [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
    if (!initial.enabled) return null;
    const run = (action: () => Promise<void>) => { setError(null); setMessage(null); startTransition(async () => {
        try { await action(); router.refresh(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'The catalog could not be updated.'); }
    }); };
    return <Card className="space-y-5 p-5 sm:p-6">
        <div><h2 className="text-lg font-semibold">Stripe catalog</h2><p className="mt-2 max-w-3xl text-sm text-muted">Import your Stripe prices, review the complete offer, then publish it. Draft plan edits do not change customer prices. Existing base subscriptions retain their purchased price; usage changes require notice and take effect at a later monthly renewal.</p></div>
        <form onSubmit={event => { event.preventDefault(); run(async () => { const draft = await importBillingCatalog(input); setSelected(draft); setReviewed(false); setValidation(await getBillingCatalogValidation(draft.id)); setMessage('Draft imported. Review every price and allowance before publishing.'); }); }} className="space-y-3">
            <label htmlFor="catalog-import" className="block text-sm font-medium">Stripe price IDs and allowances</label>
            <textarea id="catalog-import" rows={12} value={input} onChange={event => setInput(event.target.value)} className="w-full rounded-xl border border-border bg-default p-3 font-mono text-xs" spellCheck={false} disabled={pending} />
            <Button type="submit" variant="secondary" isDisabled={pending}>Import from Stripe</Button>
        </form>
        {initial.drafts.length > 0 && <div className="flex flex-wrap items-center gap-3"><label htmlFor="catalog-draft" className="text-sm font-medium">Review a catalog</label><select id="catalog-draft" value={selected?.id || ''} disabled={pending} className="max-w-full rounded-lg border border-border bg-default p-2 text-sm" onChange={event => { const draft = initial.drafts.find(draft => draft.id === event.target.value); setSelected(draft); setReviewed(false); setValidation(null); if (draft) run(async () => { setValidation(await getBillingCatalogValidation(draft.id)); }); }}>
            {initial.drafts.map(draft => <option key={draft.id} value={draft.id}>{draft.id.slice(0, 12)} · {draft.state}{initial.activeId === draft.id ? ' · Active' : ''}</option>)}
        </select></div>}
        {selected && <div className="space-y-4">
            <p className="break-all text-sm text-muted">{selected.livemode ? 'Live' : 'Sandbox'} · {selected.stripeAccountId} · Catalog: {selected.id}</p>
            {validation?.targetBundleId === selected.id && <BillingCatalogReview review={validation} />}
            <Button variant="secondary" isDisabled={pending} onPress={() => run(async () => { setValidation(await getBillingCatalogValidation(selected.id)); setReviewed(false); })}>Refresh validation preview</Button>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Offer</th><th className="p-2">Base</th><th className="p-2">Monthly allowance</th><th className="p-2">Audio block / storage milliGiB</th><th className="p-2">Sales</th></tr></thead><tbody>
                {selected.plans.map(plan => <tr key={plan.key} className="border-t border-border"><td className="p-2">{plan.name}</td><td className="p-2">${plan.price} / {plan.interval}</td><td className="p-2">{plan.weightedMinutes} weighted min + {plan.storageBytes / 1024 ** 3} GiB</td><td className="p-2">{plan.blockUnitCents}¢ / {plan.storageUnitCents}¢</td><td className="p-2">{initial.activeId === selected.id ? <Button size="sm" variant="secondary" isDisabled={pending} onPress={() => run(async () => { await setBillingOfferPaused(plan.key, !initial.pausedPlanKeys.includes(plan.key)); setMessage('New-sales availability updated. Existing purchases are preserved.'); })}>{initial.pausedPlanKeys.includes(plan.key) ? 'Resume sales' : 'Pause sales'}</Button> : selected.state}</td></tr>)}
            </tbody></table></div>
            {(selected.livemode || selected.state === 'published') && <div className="space-y-2"><label htmlFor="catalog-acceptance" className="block text-sm font-medium">Verified sandbox acceptance evidence</label><textarea id="catalog-acceptance" rows={5} value={evidence} onChange={event => setEvidence(event.target.value)} className="w-full rounded-xl border border-border bg-default p-3 font-mono text-xs" placeholder="Paste the verified payment, metering and processing acceptance record for this catalog, account and mode. Do not enter credentials." disabled={pending} />{selected.acceptanceVerifiedAt && <p className="text-xs text-muted">Acceptance verified {selected.acceptanceVerifiedAt}.</p>}</div>}
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} disabled={pending} className="mt-1" /><span>I reviewed the Stripe amounts, allowances, usage rates, bounded cost evidence and advisory estimates for this catalog.</span></label>
            <Button variant="primary" isDisabled={pending || !reviewed || initial.activeId === selected.id || validation?.targetBundleId !== selected.id || !validation.validation.passed} onPress={() => run(async () => { const published = await publishBillingCatalog(selected.id, reviewed, evidence); setSelected(published); setValidation(await getBillingCatalogValidation(published.id)); setReviewed(false); setMessage('Catalog published. Existing usage-rate notices will be scheduled by reconciliation.'); })}>Publish reviewed catalog</Button>
            {selected.state === 'published' && <Button variant="secondary" isDisabled={pending || !reviewed || !evidence.trim()} onPress={() => run(async () => { const refreshed = await refreshBillingCatalogAcceptance(selected.id, reviewed, evidence); setSelected(refreshed); setReviewed(false); setMessage('Acceptance evidence refreshed. Published prices and customer renewal dates are preserved.'); })}>Refresh acceptance evidence</Button>}
        </div>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}{message && <p role="status" className="text-sm text-success">{message}</p>}
    </Card>;
}
