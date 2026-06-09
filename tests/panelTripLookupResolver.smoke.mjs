import assert from 'node:assert/strict';

import { findPanelTripByKey } from '../src/features/panel/panelTripLookupResolver.js';

const timetableByLineId = new Map([
    ['main-line', [
        { id: 'trip-a.Weekday', t: 'trip-a' },
        { id: 'trip-a.SaturdayHoliday', t: 'trip-a' }
    ]],
    ['group-line', [
        { id: 'group-trip.Weekday', t: 'group-trip' }
    ]],
    ['ref-line', [
        { id: 'ref-trip.Weekday', t: 'ref-trip' }
    ]]
]);

const baseOptions = {
    currentLineGroupByMainId: new Map([
        ['display-line', ['group-line']]
    ]),
    getRefLineId: (key) => key === 'ref-trip' ? 'ref-line' : '',
    loadTimetableForLineId: async (lineId) => timetableByLineId.get(lineId) || [],
    parseTripServiceDayFromId: (tripId) => {
        const text = String(tripId || '');
        if (text.includes('SaturdayHoliday')) return 'SaturdayHoliday';
        if (text.includes('Weekday')) return 'Weekday';
        return '';
    }
};

assert.deepEqual(
    await findPanelTripByKey({
        ...baseOptions,
        lineId: 'main-line',
        tripKey: 'trip-a',
        currentServiceDay: 'SaturdayHoliday'
    }),
    { id: 'trip-a.SaturdayHoliday', t: 'trip-a' }
);

assert.deepEqual(
    await findPanelTripByKey({
        ...baseOptions,
        lineId: 'display-line',
        tripKey: 'group-trip',
        currentServiceDay: 'SaturdayHoliday'
    }),
    { id: 'group-trip.Weekday', t: 'group-trip' }
);

assert.deepEqual(
    await findPanelTripByKey({
        ...baseOptions,
        lineId: 'unknown-line',
        tripKey: 'ref-trip',
        currentServiceDay: 'Weekday'
    }),
    { id: 'ref-trip.Weekday', t: 'ref-trip' }
);

assert.equal(
    await findPanelTripByKey({
        ...baseOptions,
        lineId: 'main-line',
        tripKey: '',
        currentServiceDay: 'Weekday'
    }),
    null
);

console.log('panel trip lookup resolver smoke ok');
