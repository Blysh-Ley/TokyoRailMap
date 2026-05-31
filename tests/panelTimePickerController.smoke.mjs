import assert from 'node:assert/strict';

import {
    formatTimePickerTwoDigits,
    normalizeTimePickerHHMM,
    parseTimePickerSeed
} from '../src/features/panel/panelTimePickerController.js';

{
    assert.equal(formatTimePickerTwoDigits(0), '00');
    assert.equal(formatTimePickerTwoDigits(7), '07');
    assert.equal(formatTimePickerTwoDigits(23), '23');
}

{
    assert.equal(normalizeTimePickerHHMM('7:5'), '07:05');
    assert.equal(normalizeTimePickerHHMM('23:59'), '23:59');
    assert.equal(normalizeTimePickerHHMM('24:00'), '');
    assert.equal(normalizeTimePickerHHMM('12:60'), '');
    assert.equal(normalizeTimePickerHHMM('abc'), '');
}

{
    assert.deepEqual(parseTimePickerSeed('6:03'), { hour: 6, minute: 3 });
    assert.deepEqual(
        parseTimePickerSeed('', { now: new Date('2026-05-31T09:42:00') }),
        { hour: 9, minute: 42 }
    );
    assert.deepEqual(
        parseTimePickerSeed('bad', { now: new Date('invalid') }),
        { hour: 0, minute: 0 }
    );
}

console.log('panel time picker controller smoke ok');
