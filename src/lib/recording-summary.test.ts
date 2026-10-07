import test from 'node:test';
import assert from 'node:assert/strict';
import { recordingPreview, summaryPlainText } from './recording-summary';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryContent } from '@/components/recording-view/summary-content';

test('previews clean generated Markdown without changing the stored summary', () => {
    const recording = { summary: '**Summary:** A **delivery** call about [directions](https://example.com).\n\nNext _steps_ and `times`.' };
    assert.equal(recordingPreview(recording), 'A delivery call about directions. Next steps and times.');
    assert.ok(recording.summary.startsWith('**Summary:**'));
    assert.equal(summaryPlainText('## Notes\n> A **short** note'), 'Notes\nA short note');
});

test('preview falls back to transcript text and supports missing content', () => {
    assert.equal(recordingPreview({ fullTranscript: [{ text: 'Hello\nthere' }] }), 'Hello there');
    assert.equal(recordingPreview({}), '');
    assert.equal(recordingPreview({ summary: 'Pay invoice_123 this week.' }), 'Pay invoice_123 this week.');
    assert.equal(recordingPreview({ summary: 'Compare sender_name and file_name.' }), 'Compare sender_name and file_name.');
});

test('full summaries format emphasis and lists while escaping arbitrary HTML', () => {
    const html = renderToStaticMarkup(createElement(SummaryContent, { text: '**Decision:** ship\n\nA **delivery** call with `times`.\n\n- Review\n- Confirm\n\n<script>alert(1)</script>' }));
    assert.match(html, /<strong>Decision:<\/strong>/);
    assert.match(html, /<li>Review<\/li>/);
    assert.match(html, /<p class="whitespace-pre-wrap">A <strong>delivery<\/strong> call with <code>times<\/code>\.<\/p>/);
    assert.ok(!html.includes('<script>'));
    assert.match(html, /&lt;script&gt;/);
});
