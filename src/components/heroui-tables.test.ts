import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserRecordingsPanel } from './pages/admin/user-details/user-recordings-panel';
import { UserPaymentHistoryPanel } from './pages/admin/user-details/user-payment-history-panel';
import { BillingHistoryCard } from './settings/billing/billing-history-card';
import type { Recording } from '@/lib/types';

test('admin recording table renders HeroUI cells and its empty state', () => {
    const empty = renderToStaticMarkup(createElement(UserRecordingsPanel, { recordings: [] }));
    assert.match(empty, /data-slot="table-content"/);
    assert.match(empty, /No recordings\./);
    const populated = renderToStaticMarkup(createElement(UserRecordingsPanel, { recordings: [{
        id: 'call', recordedAt: '2026-10-07T10:00:00Z', duration: 90,
        summary: 'Review the next steps',
    } as Recording] }));
    assert.match(populated, /Review the next steps/);
    assert.match(populated, /data-slot="table-row"/);
});

test('admin payment table retains amounts, statuses, and its empty state', () => {
    const empty = renderToStaticMarkup(createElement(UserPaymentHistoryPanel, { invoices: [] }));
    assert.match(empty, /No invoices\./);
    const populated = renderToStaticMarkup(createElement(UserPaymentHistoryPanel, { invoices: [{
        id: 'invoice', date: '2026-10-07', amount: 25, status: 'Paid',
    }] }));
    assert.match(populated, /data-slot="table-content"/);
    assert.match(populated, /\$25\.00/);
    assert.match(populated, /Paid/);
});

test('billing feedback uses the same card and never fabricates invoices', () => {
    for (const [props, expected] of [
        [{ isLoading: false, invoices: [] }, /No invoices yet/],
        [{ isLoading: false, invoices: [], error: 'Billing unavailable' }, /Billing unavailable/],
        [{ isLoading: true, invoices: [] }, /data-slot="spinner"/],
    ] as const) {
        const markup = renderToStaticMarkup(createElement(BillingHistoryCard, { ...props, invoices: [...props.invoices] }));
        assert.match(markup, /data-slot="card"/);
        assert.match(markup, expected);
        assert.doesNotMatch(markup, /data-slot="table-row"/);
    }
});

test('billing invoice layouts retain receipt links, values, and status', () => {
    const markup = renderToStaticMarkup(createElement(BillingHistoryCard, {
        isLoading: false, invoices: [{ id: 'receipt', date: '2026-10-07', amount: 25, status: 'Paid', url: 'https://example.com/receipt' }],
    }));
    assert.match(markup, /data-slot="table-content"/);
    assert.match(markup, /\$25\.00/);
    assert.match(markup, /Paid/);
    assert.match(markup, /href="https:\/\/example.com\/receipt"/);
    assert.doesNotMatch(markup, /<a[^>]*>\s*<button/);
});
