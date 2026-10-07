import { Fragment } from 'react';
import { summaryPlainText } from '@/lib/recording-summary';

function inline(text: string) {
    return text.split(/(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`)/g).map((part, index) => {
        if (/^(\*\*|__)/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith('`')) return <code key={index}>{part.slice(1, -1)}</code>;
        return <Fragment key={index}>{summaryPlainText(part, false)}</Fragment>;
    });
}

/** A small safe Markdown subset rendered as React text, never arbitrary HTML. */
export function SummaryContent({ text }: { text: string }) {
    return <div className="space-y-3 break-words leading-relaxed">
        {text.trim().split(/\n\s*\n/).map((block, index) => {
            const lines = block.split('\n');
            if (lines.every(line => /^\s*[-*+]\s+/.test(line))) {
                return <ul key={index} className="list-disc space-y-1 pl-5">{lines.map((line, i) => <li key={i}>{inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>)}</ul>;
            }
            return <p key={index} className="whitespace-pre-wrap">{inline(block)}</p>;
        })}
    </div>;
}
