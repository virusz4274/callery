import type { ManagedCostPolicy } from './economics';

/** Internal expenses remain observable when customer pricing cannot be published.
 * This never authorizes customer spending or turns estimates into actual charges. */
export function internalCostEstimate(): { policy?: Partial<ManagedCostPolicy>; version?: string; stale: boolean } {
    try {
        const policy = JSON.parse(process.env.MANAGED_COST_POLICY_JSON || '') as Partial<ManagedCostPolicy>;
        if (!policy || typeof policy !== 'object') return { stale: true };
        const expiry = Date.parse(policy.expiresAt || '');
        return { policy, version: typeof policy.version === 'string' ? policy.version : undefined,
            stale: !Number.isFinite(expiry) || expiry <= Date.now() };
    } catch { return { stale: true }; }
}

export function knownCostRate(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
