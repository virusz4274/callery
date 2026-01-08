/**
 * Calculate the billed duration for a given audio duration in seconds.
 * Rounds up to the nearest 15-second block.
 * 
 * Examples:
 * - 10s -> 15s
 * - 15s -> 15s
 * - 16s -> 30s
 * - 77s -> 90s
 */
export function calculateBilledDuration(seconds: number): number {
    if (seconds <= 0) return 0;
    return Math.ceil(seconds / 15) * 15;
}
