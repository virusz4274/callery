/** Display-only cleanup: summaries remain unchanged in storage and search. */
export function summaryPlainText(text: string, trim = true): string {
    const plainText = text
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*>\s?/gm, '')
        .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, stars, underscores) => stars || underscores)
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
        .replace(/`([^`]+)`/g, '$1');
    return trim ? plainText.trim() : plainText;
}

export function recordingPreview(recording: { summary?: string; fullTranscript?: { text: string }[] }): string {
    return summaryPlainText(recording.summary || recording.fullTranscript?.[0]?.text || '')
        .replace(/^(?:summary|ai summary)\s*:\s*/i, '')
        .replace(/\s+/g, ' ');
}
