import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { mockRecordings, profile, recording } from './fixtures/recordings';
import type { ContactResponse, RecordingResponse } from '../src/lib/db/types';

test.use({ serviceWorkers: 'block' });

const completed: RecordingResponse = {
  ...recording,
  contactName: 'A long recording title for a discussion about schedules, decisions, and follow-up work',
  fileName: 'A long recording title for a discussion about schedules, decisions, and follow-up work',
  standardizedDisplayName: 'A long recording title for a discussion about schedules, decisions, and follow-up work',
  transcriptionStatus: 'completed',
  transcriptionProvider: 'gemini',
  transcriptionModel: 'gemini-3.8-flash',
  transcriptionCostMultiplier: 5,
  summary: 'A useful summary. '.repeat(30),
  fullTranscript: Array.from({ length: 65 }, (_, index) => ({
    speakerId: `spk:${index % 2}`, start: index + 0.299999, end: index + 1,
    text: `Segment ${index}. A long readable transcript paragraph with enough text to wrap naturally on a small phone.`,
    transliteratedText: `Transliterated segment ${index}.`, words: [],
  })),
};

for (const [width, height, theme] of [[320, 720, 'light'], [390, 844, 'dark'], [430, 932, 'light'], [667, 375, 'dark'], [768, 1024, 'light'], [1280, 900, 'dark']] as const) {
  test(`reading workspace fits ${width}x${height} in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    const unexpected = await mockRecordings(page, { recording: completed, open: false });
    const open = page.getByRole('button', { name: completed.fileName, exact: true });
    await expect(open).toBeVisible();
    await expect(page.getByLabel('Transcription provider: Gemini', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/5[×x]/)).toHaveCount(0);
    await open.click();
    const dialog = page.getByRole('dialog', { name: width < 768 ? completed.fileName : completed.contactName!, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Transcribe again', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/id=recording-fixture/);
    await expect(dialog.getByText('Speaker 1', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('0:00', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('DIARIZED')).toHaveCount(0);
    await expect(dialog.getByLabel('Transcription provider: Gemini', { exact: true })).toBeVisible();
    await expect(dialog.getByText(/5[×x]/)).toHaveCount(0);
    const speakerIcons = dialog.locator('[data-slot="avatar-fallback"]');
    await expect(speakerIcons.first()).toHaveText('S1');
    await expect(speakerIcons.nth(1)).toHaveText('S2');
    const speakerColors = await speakerIcons.evaluateAll(elements => elements.slice(0, 2).map(element => getComputedStyle(element).backgroundColor));
    expect(speakerColors[0]).not.toBe(speakerColors[1]);
    const audio = await page.locator('audio').elementHandle();
    const playbackSupported = testInfo.project.name === 'chrome';
    // Windows Playwright WebKit has no working audio playback backend.
    if (playbackSupported) {
      await audio!.evaluate(async element => { const player = element as HTMLAudioElement; player.muted = true; await player.play(); });
      await expect.poll(() => audio!.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
    }
    const dimensions = await dialog.evaluate(element => ({ width: element.clientWidth, height: element.clientHeight, overflow: element.scrollWidth > element.clientWidth }));
    expect(dimensions.overflow).toBe(false);
    if (width < 768) {
      expect(dimensions.width).toBe(width);
      expect(dimensions.height).toBe(height);
      const scroll = page.getByTestId('recording-scroll');
      await expect.poll(() => scroll.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
      const scrollers = await dialog.evaluate(element => [...element.querySelectorAll('*')].filter(node => {
        const style = getComputedStyle(node);
        return ['auto', 'scroll'].includes(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
      }).length);
      expect(scrollers).toBe(1);
      await dialog.getByRole('button', { name: 'Transliteration', exact: true }).click();
      await expect(dialog.getByText('Transliterated segment 0.', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: 'Original', exact: true }).click();
      await scroll.evaluate(element => { element.scrollTop = 700; });
      const position = await scroll.evaluate(element => element.scrollTop);
      await page.locator('audio').evaluate(element => { element.dataset.identity = 'retained'; });
      await dialog.getByRole('tab', { name: 'Summary', exact: true }).click();
      await expect(dialog.getByRole('tabpanel', { name: 'Summary' })).toContainText('A useful summary');
      await dialog.getByRole('tab', { name: 'Transcript', exact: true }).click();
      expect(await scroll.evaluate(element => element.scrollTop)).toBe(position);
      expect(await page.locator('audio').getAttribute('data-identity')).toBe('retained');
      if (playbackSupported) expect(await audio!.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
      await page.getByTestId('recording-audio').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('recording-audio')).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath('mobile-transcript.png') });
      await dialog.getByRole('button', { name: 'Share recording', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Share recording', exact: true })).toBeVisible();
      await page.getByText('Share a clip', { exact: true }).click();
      await expect(page.getByLabel('Clip start seconds')).toBeVisible();
      await page.goBack();
      await expect(dialog).toBeVisible();
      expect(await scroll.evaluate(element => element.scrollTop)).toBe(position);
      expect(await page.locator('audio').getAttribute('data-identity')).toBe('retained');
      if (playbackSupported) expect(await audio!.evaluate(element => (element as HTMLAudioElement).paused)).toBe(false);
      await page.goForward();
      await expect(page.getByRole('dialog', { name: 'Share recording', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Back to recording', exact: true }).click();
      await dialog.getByRole('button', { name: 'Back to list', exact: true }).click();
    } else {
      expect(dimensions.width).toBeLessThan(width);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await audio!.evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
    await expect(open).toBeFocused();
    expect(unexpected).toEqual([]);
  });
}

test('selection and filter drafts preserve list and browser history', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { recording: completed, url: '/recordings?q=fixture', open: false });
  let documentNavigations = 0;
  page.on('request', request => { if (request.isNavigationRequest() && request.resourceType() === 'document') documentNavigations++; });
  await page.getByRole('button', { name: 'Select items', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: `Select ${completed.fileName}`, exact: true });
  // HeroUI hides the native input; users click its full-size associated label.
  await page.locator('label').filter({ has: checkbox }).click();
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('region', { name: 'Recording selection' })).toContainText('1 selected');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: `Toggle selection for ${completed.fileName}`, exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole('region', { name: 'Recording selection' })).toContainText('1 selected');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: /Sort order/ }).click();
  await page.getByRole('option', { name: 'Longest first', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('sortBy')).toBeNull();
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', { name: /Sort order/ }).click();
  await page.getByRole('option', { name: 'Longest first', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/sortBy=duration/);
  await expect(page.getByRole('button', { name: 'Remove Longest first filter' })).toBeVisible();
  const openRecording = page.getByRole('button', { name: completed.fileName, exact: true });
  await openRecording.scrollIntoViewIfNeeded();
  const listPosition = await page.evaluate(() => window.scrollY);
  await openRecording.click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('q')).toBe('fixture');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(listPosition);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: completed.fileName, exact: true })).toBeVisible();
  expect(documentNavigations).toBe(0);
  expect(unexpected).toEqual([]);
});

test('direct links close locally and unavailable links allow recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { url: '/recordings?q=fixture&id=missing', open: false, unavailable: true });
  await expect(page.getByRole('dialog', { name: 'Recording unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recording unavailable' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/recordings\?q=fixture$/);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Recording unavailable' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/recordings\?q=fixture$/);
  expect(unexpected).toEqual([]);
});

test('pasted subview links have local Back and Forward destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { recording: completed, url: '/recordings?q=fixture&id=recording-fixture&recordingView=share', open: false });
  await expect(page.getByRole('dialog', { name: 'Share recording', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: completed.fileName, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/recordings\?q=fixture$/);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: completed.fileName, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Share recording', exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('folders retain location when opening and closing recordings', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const unexpected = await mockRecordings(page, { recording: completed, url: '/files', open: false });
  await page.getByRole('button', { name: 'Open Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Open 2026', exact: true }).click();
  await page.getByRole('button', { name: `Open ${completed.fileName}`, exact: true }).click();
  await expect(page.getByRole('dialog', { name: completed.fileName, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to list', exact: true }).click();
  await expect(page.getByRole('heading', { name: '2026', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parent folder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('settings section links and browser Back work on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { url: '/settings?tab=notifications', open: false });
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: /^Notifications/ }).click();
  await page.goBack();
  await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('sharing fields remain usable in a keyboard-sized viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { recording: completed, open: false });
  await page.getByRole('button', { name: completed.fileName, exact: true }).click();
  await page.getByRole('button', { name: 'Share recording', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 420 });
  await page.getByText('Share a clip', { exact: true }).click();
  const start = page.getByLabel('Clip start seconds');
  await start.fill('12');
  await expect(start).toBeFocused();
  await expect(start).toBeInViewport();
  await expect(page.getByTestId('recording-audio')).toBeInViewport();
  const dialog = page.getByRole('dialog', { name: 'Share recording', exact: true });
  expect(await dialog.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Clip end seconds')).toBeFocused();
  await page.getByRole('button', { name: 'Back to recording', exact: true }).click();
  await expect(page.getByRole('dialog', { name: completed.fileName, exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('enlarged text keeps content and mobile navigation within bounds', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const unexpected = await mockRecordings(page, { recording: completed, open: false });
  await page.addStyleTag({ content: 'html { font-size: 20px !important; }' });
  await expect(page.getByRole('navigation', { name: 'Mobile workspace' }).getByRole('link', { name: 'Files', exact: true })).toBeVisible();
  const sizing = await page.evaluate(() => ({ fits: document.documentElement.scrollWidth <= window.innerWidth,
    overflow: [...document.querySelectorAll('*')].filter(element => element.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 12).map(element => `${element.tagName}.${element.className}`) }));
  expect(sizing, JSON.stringify(sizing.overflow)).toMatchObject({ fits: true });
  await page.getByRole('button', { name: completed.fileName, exact: true }).click();
  await expect(page.getByTestId('recording-audio')).toBeInViewport();
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(unexpected).toEqual([]);
});

test('contact links beyond page one return to the search and reading position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const contacts: ContactResponse[] = Array.from({ length: 35 }, (_, index) => ({
    id: `person-${index}`, authSubject: profile.id, googleContactId: `people/${index}`,
    name: `Person ${String(index).padStart(2, '0')}`, firstName: 'Person', lastName: String(index),
    phoneNumbers: ['123456789', '987654321'], email: null, createdAt: profile.createdAt, updatedAt: profile.createdAt,
    totalRecordings: 1, lastRecordingAt: profile.createdAt,
  }));
  const unexpected = await mockRecordings(page, { contacts, recording: completed, url: '/contacts?q=Person', open: false });
  const rows = page.getByRole('link', { name: /^Open Person/ });
  await expect(rows).toHaveCount(20);
  await rows.last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await expect(rows).toHaveCount(35);
  const person = page.getByRole('link', { name: 'Open Person 24', exact: true });
  await person.scrollIntoViewIfNeeded();
  const position = await page.evaluate(() => window.scrollY);
  await person.click();
  await expect(page.getByRole('heading', { name: 'Person 24', level: 1, exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to contacts', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search contacts' })).toHaveValue('Person');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(position);
  await page.goto('/contacts/person-24');
  await expect(page.getByRole('heading', { name: 'Person 24', level: 1, exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('upload queue actions stay reachable and retain failures and duplicates', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const unexpected = await mockRecordings(page, { url: '/upload', open: false, failUploads: true });
  const file = testInfo.outputPath('A long audio recording filename for mobile queue checks.mp3');
  await writeFile(file, Buffer.from('fixture'));
  await page.getByLabel('Audio files', { exact: true }).setInputFiles(file);
  await page.getByLabel('Audio files', { exact: true }).setInputFiles(file);
  await expect(page.getByText('Duplicate', { exact: true })).toBeVisible();
  const bar = page.getByTestId('upload-action-bar');
  await expect(bar).toBeInViewport();
  const navigation = page.getByRole('navigation', { name: 'Mobile workspace' });
  const barBox = await bar.boundingBox();
  const navBox = await navigation.boundingBox();
  expect(barBox!.y + barBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  await bar.getByRole('button', { name: 'Upload All', exact: true }).click();
  await expect(page.getByRole('list').getByText('Failed', { exact: true })).toBeVisible();
  await expect(page.getByRole('list').getByText(/Fixture storage unavailable/)).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Upload All', exact: true })).toBeEnabled();
  await bar.getByRole('button', { name: 'Clear All', exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(unexpected).toEqual([]);
});
