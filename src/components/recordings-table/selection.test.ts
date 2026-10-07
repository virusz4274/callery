import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Recording } from '@/lib/types';
import type { TableSelectionState } from './types';
import { RecordingsTableMobile } from './recordings-table-mobile';
import { RecordingsTableDesktop } from './recordings-table-desktop';
import { NotificationsSettings } from '@/components/settings/notifications-settings';
import { ToastProvider } from '@/components/toast-provider';

const recording: Recording = {
    id: 'recording-selection-fixture', authSubject: 'fixture', contactId: null, contactName: 'Fixture recording',
    phoneNumber: '', r2Key: 'fixture.wav', fileName: 'Fixture recording', standardizedDisplayName: 'Fixture recording',
    fileSize: 44, mimeType: 'audio/wav', duration: 60, recordedAt: '2026-10-07T00:00:00Z',
    createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T00:00:00Z',
    transcriptionStatus: 'pending', tags: [], isStarred: false, isArchived: false,
};
const noop = () => {};
function selection(selected: boolean): TableSelectionState {
    return {
        selectedIds: new Set(selected ? [recording.id] : []), selectedCount: selected ? 1 : 0,
        isAllSelected: selected, isSelected: () => selected, toggleSelect: noop, toggleSelectAll: noop,
        clearSelection: noop, getSelectedItems: () => selected ? [recording] : [],
    };
}
const inputs = (html: string) => html.match(/<input\b[^>]*>/g) || [];

test('mobile selection renders a focusable native checkbox with its controlled checked state', () => {
    for (const selected of [false, true]) {
        const html = renderToStaticMarkup(createElement(RecordingsTableMobile, {
            recordings: [recording], contacts: [], selection: selection(selected), isSelectionMode: true,
            toggleSelectionMode: noop, onOpenDialog: noop, onDeleteRequest: noop,
        }));
        const checkboxes = inputs(html).filter((input) => input.includes('type="checkbox"'));
        assert.equal(checkboxes.length, 1);
        assert.match(checkboxes[0], /aria-label="Select Fixture recording"/);
        assert.match(checkboxes[0], /tabindex="0"/);
        assert.equal(checkboxes[0].includes('checked=""'), selected);
    }
});

test('mobile browsing keeps checkboxes out of the normal recording-opening flow', () => {
    const html = renderToStaticMarkup(createElement(RecordingsTableMobile, {
        recordings: [recording], contacts: [], selection: selection(false), isSelectionMode: false,
        toggleSelectionMode: noop, onOpenDialog: noop, onDeleteRequest: noop,
    }));
    assert.equal(inputs(html).filter((input) => input.includes('type="checkbox"')).length, 0);
    assert.match(html, /<button[^>]*aria-label="Fixture recording"/);
});

test('desktop exposes working native inputs for select-all and individual rows', () => {
    for (const selected of [false, true]) {
        const html = renderToStaticMarkup(createElement(RecordingsTableDesktop, {
            recordings: [recording], selection: selection(selected), onOpenDialog: noop, onDeleteRequest: noop,
        }));
        const checkboxes = inputs(html).filter((input) => input.includes('type="checkbox"'));
        assert.equal(checkboxes.length, 2);
        assert.match(checkboxes[0], /aria-label="Select all"/);
        assert.match(checkboxes[1], /aria-label="Select Fixture recording"/);
        for (const input of checkboxes) {
            assert.match(input, /tabindex="0"/);
            assert.equal(input.includes('checked=""'), selected);
        }
    }
});

test('notification preferences render native toggle and radio inputs matching saved settings', () => {
    const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement(NotificationsSettings, {
        settings: { activityDigest: 'monthly', ingestSuccess: true, ingestFail: false },
        onSettingsChange: noop, onSave: async () => {}, isSaving: false,
    })));
    const controls = inputs(html);
    const switches = controls.filter((input) => input.includes('role="switch"'));
    const radios = controls.filter((input) => input.includes('type="radio"'));
    assert.equal(switches.length, 2);
    assert.equal(switches[0].includes('checked=""'), true);
    assert.equal(switches[1].includes('checked=""'), false);
    assert.equal(radios.length, 3);
    assert.match(radios.find((input) => input.includes('checked=""')) || '', /value="monthly"/);
});
