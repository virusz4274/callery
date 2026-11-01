/** A deliberate operational pause, independent of payment or customer credit. */
export class ProcessingPausedError extends Error {
    readonly code = 'processing_paused';
    constructor() {
        super('AI processing is temporarily paused. Saved recordings and completed results remain available.');
        this.name = 'ProcessingPausedError';
    }
}
