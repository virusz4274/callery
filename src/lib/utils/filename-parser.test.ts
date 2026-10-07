import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContactFromFilename, parseRecordingFilename, parseUploadContactFromFilename } from './filename-parser';

test('recognized recorder patterns extract callers and local calendar timestamps', () => {
    const cases = [
        ['Call John_Doe_260627_053508.M4A', 'samsung', 'John Doe', null, 5, 35, 8, 0],
        ['CALL RECORDING +91_(944)-6710273_260627_053508.mp3', 'samsung', null, '+91(944)-6710273', 5, 35, 8, 0],
        ['Call recording@+919446710273_20260627053508.mp3', 'miui', null, '+919446710273', 5, 35, 8, 0],
        ['Εγγραφή κλήσης@0030123456789_20260627053508.mp3', 'miui', null, '0030123456789', 5, 35, 8, 0],
        ['通话录音@13812345678_20260627053508.mp3', 'miui', null, '13812345678', 5, 35, 8, 0],
        ['John_Doe@+919446710273_20260627053508.m4a', 'huawei', 'John Doe', '+919446710273', 5, 35, 8, 0],
        ['John_Doe-2606270535.mp3', 'coloros', 'John Doe', null, 5, 35, 0, 0],
        ['1233-2606270535.mp3', 'coloros', null, '1233', 5, 35, 0, 0],
        ['CallRecord_20260627-053508_+919446710273.m4a', 'grapheneos', null, '+919446710273', 5, 35, 8, 0],
        ['+48123456789_260627_053508577.amr', 'lineageos', null, '+48123456789', 5, 35, 8, 577],
        ['09947555123_260627_053508.wav', 'lineageos', null, '09947555123', 5, 35, 8, 0],
    ] as const;
    for (const [filename, format, name, phone, hours, minutes, seconds, ms] of cases) {
        const result = parseRecordingFilename(filename);
        assert.equal(result.status, 'recognized', filename);
        assert.equal(result.format, format, filename);
        assert.equal(result.name, name, filename);
        assert.equal(result.phoneNumber, phone, filename);
        assert.deepEqual(result.issues, [], filename);
        assert.ok(result.date, filename);
        assert.deepEqual([result.date.getFullYear(), result.date.getMonth(), result.date.getDate(),
            result.date.getHours(), result.date.getMinutes(), result.date.getSeconds(), result.date.getMilliseconds()],
        [2026, 5, 27, hours, minutes, seconds, ms], filename);
    }
});

test('BCR offsets preserve the exact instant, milliseconds, direction and SIM', () => {
    const cases = [
        ['20260627_053508.088+0530_in_sim2_+919446710273_John_Doe.m4a', '2026-06-27T00:05:08.088Z', 330, 'in', 2, 'John Doe', '+919446710273'],
        ['20260627_053508.088-0400_out_00123456789.wav', '2026-06-27T09:35:08.088Z', -240, 'out', null, null, '00123456789'],
        ['20260627_053508.088+0000_conference.oga', '2026-06-27T05:35:08.088Z', 0, 'conference', null, null, null],
        ['20260627_053508.088+1400.m4a', '2026-06-26T15:35:08.088Z', 840, null, null, null, null],
        ['20260627_053508.088+0530_John_Doe.m4a', '2026-06-27T00:05:08.088Z', 330, null, null, 'John Doe', null],
    ] as const;
    for (const [filename, instant, offset, direction, sim, name, phone] of cases) {
        const result = parseRecordingFilename(filename);
        assert.equal(result.status, 'recognized', filename);
        assert.equal(result.format, 'bcr');
        assert.equal(result.date?.toISOString(), instant);
        assert.equal(result.timezoneOffsetMinutes, offset);
        assert.equal(result.direction, direction);
        assert.equal(result.simSlot, sim);
        assert.equal(result.name, name);
        assert.equal(result.phoneNumber, phone);
    }
});

test('impossible calendars, times and offsets never become trusted upload metadata', () => {
    const names = [
        'Call John_260230_053508.m4a', 'John-2604310535.mp3',
        'John@5551234_20260229053508.m4a', 'CallRecord_20261327-053508_5551234.wav',
        '5551234_260600_053508123.amr', 'Call John_260627_243508.mp3',
        'Call John_260627_056008.mp3', 'Call John_260627_053560.mp3',
        '20260627_053508.088+1460_5551234.m4a', '20260627_053508.088+1401_5551234.m4a',
        '20260627_053508.088-1500_5551234.m4a', 'John@5551234_19990627053508.m4a',
    ];
    for (const filename of names) {
        const result = parseRecordingFilename(filename);
        assert.equal(result.status, 'invalid', filename);
        assert.ok(result.issues.includes('invalid-date'), filename);
        assert.equal(result.date, null);
        assert.deepEqual(parseUploadContactFromFilename(filename), { name: null, phoneNumber: null, date: null });
    }
    assert.equal(parseRecordingFilename('Call John_240229_000000.wav').status, 'recognized');
    assert.equal(parseRecordingFilename('John@5551234_20000229235959.wav').status, 'recognized');
});

test('phone validation retains leading zeros and rejects malformed numbers', () => {
    for (const phone of ['++919446710273', '91+9446710273', '(5551234', '555)1234', '((555))1234', '12', '1234567890123456', '---']) {
        const result = parseRecordingFilename(`Call ${phone}_260627_053508.mp3`);
        assert.equal(result.status, 'invalid', phone);
        assert.ok(result.issues.includes('invalid-caller'), phone);
        assert.equal(result.phoneNumber, null);
    }
    const invalidRequiredPhone = parseRecordingFilename('John@not-a-number_20260627053508.wav');
    assert.equal(invalidRequiredPhone.status, 'invalid');
    assert.equal(parseRecordingFilename('Call 09947555123_260627_053508.mp3').phoneNumber, '09947555123');
});

test('unidentified callers and sequence numbers are never inferred as contact names or phones', () => {
    for (const filename of ['Call Unknown_260627_053508.m4a', 'Private number-2606270535.mp3',
        'CallRecord_20260627-053508_unknown.m4a', '20260627_053508.088+0530_in_unknown.m4a',
        '20260627_053508.088+0530_in_unknown_contact.m4a',
        'Call recording 1234.aac']) {
        const parsed = parseRecordingFilename(filename);
        assert.equal(parsed.status, 'recognized', filename);
        assert.equal(parsed.name, null);
        assert.equal(parsed.phoneNumber, null);
        assert.ok(parsed.issues.includes('missing-caller'));
    }
    assert.equal(parseRecordingFilename('Call recording 1234.aac').date, null);
    for (const filename of ['Meeting notes.mp3', 'Call planning notes.mp3', 'John_260627_053508.mp3',
        'call.mp3', 'John-06-27-2026.mp3', '5551234_260627_053508577-extra.wav']) {
        assert.equal(parseRecordingFilename(filename).status, 'unrecognized', filename);
        assert.deepEqual(parseUploadContactFromFilename(filename), { name: null, phoneNumber: null, date: null });
    }
});

test('unicode names, punctuation and optional recorder fields survive parsing', () => {
    for (const name of ['അച്ഛൻ', 'അച്ഛന്\u200d', '张三', 'أحمد', "Anne-Marie_O’Connor", 'John.Doe', 'Customer 2']) {
        const result = parseRecordingFilename(`Call ${name}_260627_053508.m4a`);
        assert.equal(result.status, 'recognized', name);
        assert.equal(result.name, name.replace(/_/g, ' '));
    }
    assert.equal(parseRecordingFilename('  call John_260627_053508.M4A  ').name, 'John');
});

test('unsafe or unreasonable filenames never yield metadata', () => {
    for (const filename of ['', '   ', '.mp3', '../Call John_260627_053508.mp3', 'C:\\Call John_260627_053508.mp3',
        'Call John\u0000_260627_053508.mp3', 'Call John\n_260627_053508.mp3',
        'Call John\u202e_260627_053508.mp3', `${'a'.repeat(1025)}.mp3`]) {
        const parsed = parseRecordingFilename(filename);
        assert.equal(parsed.status, 'invalid', filename);
        assert.deepEqual(parsed.issues, ['invalid-filename']);
        assert.equal(parsed.name, null);
        assert.equal(parsed.date, null);
    }
});

test('voice recorder end times are recognized but not used as call start dates', () => {
    const parsed = parseRecordingFilename('REC20190410134327.mp3');
    assert.equal(parsed.format, 'oppo-recorder');
    assert.equal(parsed.timestampMeaning, 'recording-end');
    assert.equal(parsed.date?.getFullYear(), 2019);
    assert.deepEqual(parseUploadContactFromFilename('REC20190410134327.mp3'), { name: null, phoneNumber: null, date: null });
});

test('the compatibility adapter preserves existing filename labels and invalid-date behavior', () => {
    assert.deepEqual(parseContactFromFilename('Meeting notes.mp3'), { name: 'Meeting notes', phoneNumber: null, date: null });
    assert.deepEqual(parseContactFromFilename('Call planning notes.mp3'), { name: 'Call planning notes', phoneNumber: null, date: null });
    assert.equal(parseContactFromFilename('Call achan_260230_053508.m4a').name, 'achan');
    assert.equal(parseContactFromFilename('Call achan_260230_053508.m4a').date, null);
});
