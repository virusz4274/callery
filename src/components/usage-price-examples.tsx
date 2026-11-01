import type { UsagePricePresentation } from '@/lib/stripe/usage-presentation';

const usd = (value: string) => `$${value.includes('.') ? value : `${value}.00`}`;

export function UsagePriceExamples({ pricing }: { pricing: UsagePricePresentation }) {
    if (!pricing.ready) return <p className="text-sm text-muted">Usage prices are awaiting verification.</p>;
    return <ul className="space-y-1 text-sm text-muted">
        {pricing.providers.map(provider => <li key={provider.id}>{provider.name}: {usd(provider.usdPerMinute)}/audio minute ({provider.multiplier}× allowance weight).</li>)}
        <li>Storage: {usd(pricing.storageUsdPerGiB || '0')}/GiB of monthly peak above your allowance.</li>
        <li>{pricing.minimumRecordingUsd === '0' ? 'No per-recording minimum.' : `Minimum positive-overage recording charge: ${usd(pricing.minimumRecordingUsd)}.`}</li>
    </ul>;
}
