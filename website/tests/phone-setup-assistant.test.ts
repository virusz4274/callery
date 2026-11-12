import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhoneSetupPrompt, phoneSetupAssistantPath } from '../src/lib/phone-setup-assistant';

const context = {
    title: 'Xiaomi and HyperOS call recording',
    manufacturer: 'Xiaomi / Redmi / POCO',
    guideUrl: 'https://guide.fixture-callery.com/guides/enable-call-recording-xiaomi-hyperos',
    assistantGuideUrl: `https://guide.fixture-callery.com${phoneSetupAssistantPath}`,
    archiveWorkflow: 'conditional' as const,
};

test('copied setup instructions retain device-specific context and hard stopping conditions', () => {
    const prompt = buildPhoneSetupPrompt(context);
    assert.ok(prompt.includes(context.title));
    assert.ok(prompt.includes(context.manufacturer));
    assert.ok(prompt.includes(context.guideUrl));
    assert.ok(prompt.includes(context.assistantGuideUrl));
    assert.match(prompt, /cannot retrieve either page, ask me to paste its contents/);
    assert.match(prompt, /one bounded stage at a time, then wait for the actual result/);
    assert.match(prompt, /exactly one connected, authorized device/);
    assert.match(prompt, /plain adb commands without a serial placeholder/);
    assert.match(prompt, /Stop on multiple devices, unauthorized\/offline status/);
    assert.match(prompt, /current Android user other than 0/);
    assert.match(prompt, /Before each package, default-app, or overlay change.*get my explicit approval/);
    assert.match(prompt, /package is absent, install-existing fails, or the restored app crashes, stop/);
    assert.match(prompt, /current firmware is incompatible with this Callery setup route/);
    assert.match(prompt, /Do not claim that the hardware can never work/);
    const contacts = 'adb shell pm install-existing --user 0 com.android.contacts';
    const incallui = 'adb shell pm install-existing --user 0 com.android.incallui';
    assert.ok(prompt.includes(contacts));
    assert.ok(prompt.indexOf(contacts) < prompt.indexOf(incallui));
    assert.match(prompt, /stop immediately on the first failure/);
    assert.match(prompt, /Both must succeed before enabling apps, selecting a different default dialer, or changing an overlay/);
    assert.match(prompt, /Package \.\.\. doesn't exist.*leave Google Dialer, Google Contacts, their data, their default selection, and the overlay untouched/);
});

test('every workflow keeps restrictions, original files, and complete verification in the copied text', () => {
    for (const archiveWorkflow of ['folder-copy', 'conditional', 'unsupported'] as const) {
        const prompt = buildPhoneSetupPrompt({ ...context, archiveWorkflow });
        assert.match(prompt, /Do not instruct me to root the phone, install Magisk\/KernelSU\/APatch/);
        assert.match(prompt, /unlock the bootloader, flash or replace a ROM, factory-reset/);
        assert.match(prompt, /bypass private app storage, or relax hidden-API\/security enforcement/);
        assert.match(prompt, /Do not download, sideload, or install external APKs/);
        assert.match(prompt, /official store route explicitly linked by the applicable Callery guide/);
        assert.match(prompt, /Keep Google Phone, Google Contacts, their data, and Google's communications overlay installed/);
        assert.match(prompt, /Do not run a bulk removal script/);
        assert.match(prompt, /normal permissions to read and copy/);
        assert.match(prompt, /does not need unrestricted write access to the phone or all-files access/);
        assert.match(prompt, /incoming and outgoing calls work/);
        assert.match(prompt, /contains both voices/);
        assert.match(prompt, /several files can be copied together with unchanged filenames/);
        assert.match(prompt, /small Callery import recognizes the caller and original call date/);
        assert.match(prompt, /Do not ask for private call audio, contact lists, transcripts, serial numbers, or full bug reports/);
    }
});

test('an unsupported sharing workflow cannot be presented as a compatible archive by the assistant', () => {
    const prompt = buildPhoneSetupPrompt({
        ...context,
        title: 'Google Phone individual sharing',
        manufacturer: 'Google Phone',
        guideUrl: 'https://guide.fixture-callery.com/guides/export-google-phone-call-recordings',
        archiveWorkflow: 'unsupported',
    });
    assert.match(prompt, /This guide describes an unsupported archive workflow/);
    assert.match(prompt, /do not present its sharing\/export steps as a compatible Callery archive/);
    assert.match(prompt, /For future recordings.*find an applicable manufacturer route before proposing setup changes/);
});

test('folder-copy and shared AI guides select an applicable route before package instructions', () => {
    const archive = buildPhoneSetupPrompt({ ...context, archiveWorkflow: 'folder-copy' });
    assert.match(archive,
        /do not introduce dialer restoration or package changes that it does not prescribe/);
    assert.match(archive, /without requiring the old phone or a new test call/);
    assert.match(archive, /Apply device-setup checks only when configuring a recording phone/);
    const shared = buildPhoneSetupPrompt({ ...context, guideUrl: context.assistantGuideUrl });
    assert.match(shared, /select the matching manufacturer guide before giving device-specific instructions/);
});

test('research instructions collect the device variant and require current attributable evidence', () => {
    const prompt = buildPhoneSetupPrompt({
        ...context,
        title: 'OnePlus, OPPO, and realme recording options',
        manufacturer: 'OnePlus / OPPO / realme',
        guideUrl: 'https://guide.fixture-callery.com/guides/enable-call-recording-oppo-odialer',
    });
    assert.match(prompt, /Brand and exact model\/model number: \[/);
    assert.match(prompt, /Country of purchase and country of use: \[/);
    assert.match(prompt, /Carrier and regional firmware variant: \[/);
    assert.match(prompt, /Android version, OS name\/version, and full build number: \[/);
    assert.match(prompt, /Current default Phone app, publisher\/package if shown, and app version: \[/);
    assert.match(prompt, /write "unknown" rather than guess/);
    assert.match(prompt, /Use live web search/);
    assert.match(prompt, /current manufacturer support pages, exact-model manuals\/release notes, and official app-store listings/);
    assert.match(prompt, /direct source links, source dates where available, and the date checked/);
    assert.match(prompt, /If web search is unavailable, say that current compatibility has not been researched/);
    assert.match(prompt, /"confirmed by primary source", "community report", or "unknown"/);
    assert.match(prompt, /manufacturer-hosted community is still a community report/);
    assert.match(prompt, /missing phone details do not block checking the original files/);
});

test('OEM route research separates recording claims from exact-device compatibility and code evidence', () => {
    const prompt = buildPhoneSetupPrompt(context);
    assert.match(prompt, /existing built-in OEM Phone app; official ODialer installation.*OEM dialer-enabling setting or code/);
    assert.match(prompt, /same brand can require different methods/);
    assert.match(prompt, /Do not transfer a code, app recommendation, or result from another manufacturer, model, regional firmware, or OS generation/);
    assert.match(prompt, /advertises manual and automatic recording and requires Android 12 or later/);
    assert.match(prompt, /do not prove install eligibility, recording controls, notification behavior, or original-folder access/);
    assert.match(prompt, /do not promise silent recording/);
    assert.match(prompt, /Before suggesting any dialer code, verify its exact purpose, applicable build, effect, and reversal from a readable source/);
    assert.match(prompt, /Do not infer instructions from an inaccessible link or guess a hidden\/service code/);
    assert.match(prompt, /No factory, engineering, reset, region-switch, or firmware-change codes/);
    assert.match(prompt, /Research is not permission to execute a code or modify the phone/);
    assert.match(prompt, /ODialer being unavailable does not establish that every OEM route is unavailable/);
    assert.match(prompt, /If none is established, report "no verified route for this build"/);
    assert.match(prompt, /stop the attempted route/);
});
