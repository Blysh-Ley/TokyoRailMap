import assert from 'node:assert/strict';

import {
    choosePanelHourWindow,
    formatPanelServiceHourLabel,
    toPanelServiceHourIndex
} from '../src/features/panel/panelTimetableHourWindow.js';

assert.equal(toPanelServiceHourIndex(5 * 3600000, 3 * 3600000), 2);
assert.equal(toPanelServiceHourIndex('bad', 3 * 3600000), null);

assert.equal(formatPanelServiceHourLabel(0, { serviceDayBoundaryHour: 3 }), '03');
assert.equal(formatPanelServiceHourLabel(22, { serviceDayBoundaryHour: 3 }), '01');
assert.equal(formatPanelServiceHourLabel('bad', { serviceDayBoundaryHour: 3 }), '');

assert.deepEqual(
    choosePanelHourWindow({ minHour: 2, maxHour: 6, currentHour: 4, expanded: false }),
    [4, 5, 6]
);

assert.deepEqual(
    choosePanelHourWindow({ minHour: 2, maxHour: 6, currentHour: 9, expanded: false }),
    [6]
);

assert.deepEqual(
    choosePanelHourWindow({ minHour: 2, maxHour: 14, currentHour: 7, expanded: true }),
    [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
);

assert.deepEqual(
    choosePanelHourWindow({ minHour: 2, maxHour: 14, currentHour: 99, expanded: true }),
    [5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
);

assert.deepEqual(
    choosePanelHourWindow({ minHour: 7, maxHour: 2, currentHour: 4, expanded: true }),
    []
);

console.log('panel timetable hour window smoke ok');
