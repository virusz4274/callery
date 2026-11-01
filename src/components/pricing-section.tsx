'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LoaderCircle } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import {
  formatMarketingPrice,
  formatMarketingStorage,
  type MarketingPlan,
  type MarketingPricing,
} from '@/lib/marketing-pricing';
import styles from '@/components/marketing/pricing.module.css';

type PricingSectionProps = {
  pricing: MarketingPricing;
  salesEmail: string;
};

const count = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
const dollars = (value: string) => `$${value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value}`;
const cadence = (interval: MarketingPlan['interval']) => interval === 'lifetime' ? 'once' : interval === 'yearly' ? '/ year' : '/ month';

function storageAllowance(plan: MarketingPlan) {
  if (plan.storageBytes === null) return 'Contact us for details';
  if (plan.interval === 'lifetime' && plan.storageBytes === 0) return 'Storage paid as you use it';
  return `${formatMarketingStorage(plan.storageBytes)} storage included`;
}

function transcriptionAllowance(plan: MarketingPlan) {
  if (plan.weightedMinutes === null) return 'Contact us for details';
  if (plan.interval === 'lifetime' && plan.weightedMinutes === 0) return 'Transcription paid as you use it';
  return `${count(plan.weightedMinutes)} transcription minutes per month`;
}

export function PricingSection({ pricing, salesEmail }: PricingSectionProps) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<{ key: string; message: string } | null>(null);
  const usagePlans = pricing.plans.filter(plan => plan.usage);
  const planCount = pricing.plans.length + (pricing.trial ? 1 : 0);

  const handleSubscribe = async (plan: MarketingPlan) => {
    if (!plan.checkout) return;
    setLoadingPlan(plan.key);
    setCheckoutError(null);

    try {
      const response = await authFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planKey: plan.key,
          priceId: plan.checkout.stripePriceId,
          catalogVersion: plan.checkout.catalogVersion,
          successUrl: '/settings?tab=billing&success=true',
          cancelUrl: '/pricing?canceled=true',
        }),
      });
      if (response.status === 401) {
        router.push('/login?redirect=/pricing');
        return;
      }
      if (!response.ok) throw new Error('checkout-unavailable');
      const result: { url?: unknown } = await response.json();
      if (typeof result.url !== 'string' || !result.url) throw new Error('checkout-unavailable');
      window.location.assign(result.url);
    } catch {
      setCheckoutError({ key: plan.key, message: 'Checkout could not be opened. Please try again, or contact us for help.' });
      setLoadingPlan(null);
    }
  };

  return (
    <div className={styles.pricing}>
      {planCount > 0 ? (
        <div className={styles.planBoard} style={{ '--plan-count': planCount } as CSSProperties}>
          {pricing.trial && (
            <article className={styles.plan} aria-labelledby="plan-free-trial-name" data-plan-key="free-trial">
              <div className={styles.planIntro}>
                <h2 id="plan-free-trial-name">{pricing.trial.name}</h2>
                <p>{pricing.trial.description}</p>
              </div>
              <div className={styles.price}>{formatMarketingPrice(0, pricing.trial.currency)}<span>for {pricing.trial.durationDays} days</span></div>
              <Link className={styles.secondaryButton} href="/signup">Start free trial</Link>
              <ul className={styles.allowances}>
                <li><Check aria-hidden="true" /><span>{formatMarketingStorage(pricing.trial.storageBytes)} storage included</span></li>
                <li><Check aria-hidden="true" /><span>{count(pricing.trial.weightedMinutes)} transcription minutes included</span></li>
                <li><Check aria-hidden="true" /><span>No credit card needed</span></li>
              </ul>
            </article>
          )}
          {pricing.plans.map(plan => (
            <article key={plan.key} className={`${styles.plan} ${plan.key === 'pro' ? styles.proPlan : ''}`}
              aria-labelledby={`plan-${plan.key}-name`} data-plan-key={plan.key}>
              <div className={styles.planIntro}>
                <h2 id={`plan-${plan.key}-name`}>{plan.name}</h2>
                <p>{plan.description}</p>
              </div>
              <div className={styles.price}>{formatMarketingPrice(plan.price, plan.currency)}<span>{cadence(plan.interval)}</span></div>
              {plan.checkout ? (
                <button className={plan.key === 'pro' ? styles.primaryButton : styles.secondaryButton}
                  type="button" onClick={() => void handleSubscribe(plan)} disabled={loadingPlan !== null}
                  aria-busy={loadingPlan === plan.key}>
                  {loadingPlan === plan.key ? <><LoaderCircle className={styles.loading} aria-hidden="true" />Opening checkout…</> : `Choose ${plan.name}`}
                </button>
              ) : (
                <a className={styles.secondaryButton} href={`mailto:${salesEmail}?subject=${encodeURIComponent(`${plan.name} plan availability`)}`}>Ask about availability</a>
              )}
              <ul className={styles.allowances}>
                <li><Check aria-hidden="true" /><span>{storageAllowance(plan)}</span></li>
                <li><Check aria-hidden="true" /><span>{transcriptionAllowance(plan)}</span></li>
                <li><Check aria-hidden="true" /><span>{plan.interval === 'lifetime' ? 'No monthly hosting minimum' : 'Add prepaid credit for extra usage'}</span></li>
              </ul>
              {checkoutError?.key === plan.key && <p className={styles.checkoutError} role="alert">{checkoutError.message}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>We can help you find the right plan.</h2>
          <p>Pricing is temporarily unavailable. Contact us for current options.</p>
          <a className={styles.primaryButton} href={`mailto:${salesEmail}`}>Contact us</a>
        </div>
      )}
      {planCount > 0 && <p className={styles.planFootnote}>Every plan gives you one place for original audio, transcripts, summaries, and search. Transcription options can use included minutes at different rates.</p>}

      {planCount > 1 && (
        <section className={styles.comparison} aria-labelledby="compare-plans-heading">
          <div className={styles.sectionHeading}>
            <h2 id="compare-plans-heading">The details, side by side.</h2>
            <p>Choose by the space and transcription you need.</p>
          </div>
          <p className={styles.tableHint}>Scroll sideways to compare all plans.</p>
          <div className={styles.tableScroll} role="region" aria-label="Plan comparison" tabIndex={0}>
            <table className={styles.comparisonTable}>
              <caption className={styles.srOnly}>Compare Callery plans</caption>
              <thead><tr><th scope="col">Included with your plan</th>{pricing.trial && <th scope="col">Free trial</th>}{pricing.plans.map(plan => <th scope="col" key={plan.key}>{plan.name}</th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">Storage</th>{pricing.trial && <td>{formatMarketingStorage(pricing.trial.storageBytes)}</td>}{pricing.plans.map(plan => <td key={plan.key}>{plan.storageBytes === null ? 'Contact us' : plan.interval === 'lifetime' && plan.storageBytes === 0 ? 'Paid as you use it' : formatMarketingStorage(plan.storageBytes)}</td>)}</tr>
                <tr><th scope="row">Transcription minutes</th>{pricing.trial && <td>{count(pricing.trial.weightedMinutes)} for the trial</td>}{pricing.plans.map(plan => <td key={plan.key}>{plan.weightedMinutes === null ? 'Contact us' : plan.interval === 'lifetime' && plan.weightedMinutes === 0 ? 'Paid as you use it' : `${count(plan.weightedMinutes)} per month`}</td>)}</tr>
                <tr><th scope="row">Extra usage</th>{pricing.trial && <td>Choose a paid plan</td>}{pricing.plans.map(plan => <td key={plan.key}>Prepaid credit</td>)}</tr>
                <tr><th scope="row">Payment</th>{pricing.trial && <td>Free for {pricing.trial.durationDays} days</td>}{pricing.plans.map(plan => <td key={plan.key}>{plan.interval === 'lifetime' ? 'One-time access purchase' : plan.interval === 'yearly' ? 'Yearly' : 'Monthly'}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pricing.plans.length > 0 && (
        <section className={styles.usage} aria-labelledby="usage-heading">
          <div className={styles.sectionHeading}>
            <h2 id="usage-heading">Understand what you use.</h2>
            <p>Paid plans use their included allowances first. Extra storage and transcription are paid from prepaid credit. Lifetime includes access, with storage and transcription paid separately.</p>
          </div>
          <div className={styles.usageExplanation}>
            <p>Audio time is rounded up to the next 15 seconds. Your transcription choice changes how quickly included minutes are used.</p>
            <p>Storage charges use the most space your recordings occupied during the month, above any included allowance.</p>
          </div>
          {usagePlans.length > 0 && (
            <div className={styles.rateList}>
              {usagePlans.map(plan => (
                <details key={plan.key} className={styles.rateDetail}>
                  <summary>{plan.name} usage rates<span aria-hidden="true">+</span></summary>
                  <div className={styles.rateContent}>
                    <div className={styles.tableScroll} role="region" aria-label={`${plan.name} transcription rates`} tabIndex={0}>
                      <table className={styles.ratesTable}>
                        <caption className={styles.srOnly}>{plan.name} additional transcription prices</caption>
                        <thead><tr><th scope="col">Transcription option</th><th scope="col">Per audio minute</th><th scope="col">Included minutes used</th></tr></thead>
                        <tbody>{plan.usage!.providers.map(provider => <tr key={provider.id}><th scope="row">{provider.name}</th><td>{dollars(provider.usdPerMinute)}</td><td>{count(provider.multiplier)}× audio length</td></tr>)}</tbody>
                      </table>
                    </div>
                    <p>Extra storage: {dollars(plan.usage!.storageUsdPerGiB)} per GiB of monthly peak storage above your allowance.</p>
                    <p>{Number(plan.usage!.minimumRecordingUsd) === 0 ? 'No minimum charge per recording.' : `Minimum charge for a recording with extra usage: ${dollars(plan.usage!.minimumRecordingUsd)}.`}</p>
                  </div>
                </details>
              ))}
            </div>
          )}
          <p className={styles.usageFootnote}>New rates apply to future usage. A recording already accepted for processing keeps its original rate.</p>
        </section>
      )}

      <section className={styles.selfHost} aria-labelledby="self-host-heading">
        <div>
          <h2 id="self-host-heading">Your archive. Your server, if you prefer.</h2>
          <p>Callery is free to self-host under the AGPL-3.0 license. Bring your own storage and integrations. Company archives are available in the self-hosted version; hosted plans are for individual accounts.</p>
        </div>
        <a className={styles.secondaryButton} href="https://github.com/virusz4274/callery/blob/main/docs/setup-guide.md">Read the self-hosting guide</a>
      </section>
    </div>
  );
}
