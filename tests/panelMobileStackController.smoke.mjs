import assert from 'node:assert/strict';

import {
    createPanelMobileStackController,
    PANEL_MOBILE_STACK_SCREENS
} from '../src/features/panel/panelMobileStackController.js';

const changes = [];
const stack = createPanelMobileStackController({
    onChange: (event) => changes.push(event)
});

assert.deepEqual(stack.getState(), {
    isOpen: false,
    screen: PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW,
    stationId: '',
    stationName: '',
    lineId: '',
    tripKey: '',
    lockedHighlightKind: ''
});

stack.openStationOverview({
    stationId: 'tokyometro.hibiya.H08',
    stationName: '日比谷'
});
assert.equal(stack.getState().isOpen, true);
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW);
assert.equal(stack.getState().stationName, '日比谷');
assert.equal(stack.getState().lockedHighlightKind, '');

stack.openLineTimetable({
    lineId: 'tokyometro.hibiya'
});
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.LINE_TIMETABLE);
assert.equal(stack.getState().lineId, 'tokyometro.hibiya');
assert.equal(stack.getState().tripKey, '');
assert.equal(stack.getState().lockedHighlightKind, 'line');

stack.openTripDetail({
    tripKey: 'tokyometro.hibiya.Weekday.001'
});
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.TRIP_DETAIL);
assert.equal(stack.getState().lineId, 'tokyometro.hibiya');
assert.equal(stack.getState().tripKey, 'tokyometro.hibiya.Weekday.001');
assert.equal(stack.getState().lockedHighlightKind, 'trip');

stack.back();
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.LINE_TIMETABLE);
assert.equal(stack.getState().lineId, 'tokyometro.hibiya');
assert.equal(stack.getState().tripKey, '');
assert.equal(stack.getState().lockedHighlightKind, 'line');

stack.back();
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW);
assert.equal(stack.getState().lineId, '');
assert.equal(stack.getState().lockedHighlightKind, '');

stack.close();
assert.equal(stack.getState().isOpen, false);
assert.equal(stack.getState().screen, PANEL_MOBILE_STACK_SCREENS.STATION_OVERVIEW);
assert.equal(stack.getState().lineId, '');
assert.equal(stack.getState().tripKey, '');
assert.equal(stack.getState().lockedHighlightKind, '');

assert.deepEqual(
    changes.map((event) => event.action),
    [
        'openStationOverview',
        'openLineTimetable',
        'openTripDetail',
        'backToLineTimetable',
        'backToStationOverview',
        'close'
    ]
);

const rejected = stack.openTripDetail({ lineId: '', tripKey: 'missing-line' });
assert.equal(rejected, stack.getState());

console.log('panel mobile stack controller smoke ok');
