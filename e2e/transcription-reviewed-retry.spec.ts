import { expect, test } from '@playwright/test';
import { mockRecordings, recording } from './fixtures/recordings';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 390]) {
    test(`ordinary uncertain transcription requires a fresh checked acknowledgment at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const failedRecording = { ...recording, transcriptionStatus: 'failed' as const };
        const unexpected = await mockRecordings(page, { recording: failedRecording });
        const requests: Array<{ provider: string; acknowledgeProviderOutcome?: boolean }> = [];
        // The fixture intercepts every API/action. Override only this action's
        // argument shape; no request can reach the shared database or provider.
        await page.route('**/recordings*', async route => {
            const request = route.request();
            if (request.method() !== 'POST' || !request.headers()['next-action']) return route.fallback();
            const args = request.postDataJSON();
            if (args[0] !== recording.id || typeof args[1]?.provider !== 'string') return route.fallback();
            requests.push(args[1]);
            const result = args[1].acknowledgeProviderOutcome
                ? { success: true }
                : { error: 'The provider outcome is uncertain. Review before retrying.', requiresReview: true };
            return route.fulfill({ contentType: 'text/x-component', body: `0:${JSON.stringify({ a: result, f: '' })}\n` });
        });

        const chooseProvider = async () => {
            await page.getByRole('button', { name: 'Transcribe', exact: true }).click();
            await page.getByRole('button', { name: 'Use Gemini', exact: true }).click();
        };
        await chooseProvider();
        const review = page.getByRole('dialog', { name: 'Review provider outcome', exact: true });
        const acknowledgment = review.getByRole('checkbox', { name: 'I checked the provider outcome. Retrying may incur another charge.', exact: true });
        await expect(review).toBeVisible();
        await expect(acknowledgment).not.toBeChecked();
        await expect(review.getByRole('button', { name: 'Retry transcription', exact: true })).toBeDisabled();
        expect(requests).toEqual([{ provider: 'gemini' }]);

        await acknowledgment.check();
        await review.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(review).not.toBeVisible();
        expect(requests).toHaveLength(1);
        await chooseProvider();
        await expect(review).toBeVisible();
        await expect(acknowledgment).not.toBeChecked();
        const retry = review.getByRole('button', { name: 'Retry transcription', exact: true });
        await expect(retry).toBeDisabled();
        await acknowledgment.check();
        expect(requests).toHaveLength(2);
        await retry.click();
        await expect.poll(() => requests.length).toBe(3);
        expect(requests).toEqual([{ provider: 'gemini' }, { provider: 'gemini' }, { provider: 'gemini', acknowledgeProviderOutcome: true }]);
        await expect(review).not.toBeVisible();
        expect(unexpected).toEqual([]);
    });
}
