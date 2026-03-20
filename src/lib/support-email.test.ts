import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';

import { buildSupportMessageEmailHtml } from '@/lib/support-email';
import type { SupportMessageDocument } from '@/lib/db/support-messages';

function createSupportMessage(overrides: Partial<SupportMessageDocument> = {}): SupportMessageDocument {
    return {
        _id: new ObjectId(),
        firebaseUid: 'user-1',
        name: 'Support User',
        email: 'support@example.com',
        subject: 'Need help',
        message: 'Line one\nLine two',
        deliveryStatus: 'pending',
        deliveryAttempts: 0,
        createdAt: new Date('2026-03-19T00:00:00.000Z'),
        ...overrides,
    };
}

test('escapes support email fields and preserves message line breaks', () => {
    const html = buildSupportMessageEmailHtml(createSupportMessage({
        name: '<b>Unsafe</b>',
        subject: 'Need <help>',
        message: 'Hello <script>alert(1)</script>\nWorld',
        firebaseUid: null,
    }));

    assert.match(html, /&lt;b&gt;Unsafe&lt;\/b&gt;/);
    assert.match(html, /Need &lt;help&gt;/);
    assert.match(html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt;<br\/>World/);
    assert.match(html, /Anonymous/);
});
