import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildPanelDateTimeViewModel,
    buildPanelCalendarCells,
    normalizePanelTime,
    parsePanelDateKey,
    shiftPanelCalendarMonth
} from '../src/domain/panelDateTime.js';
import { createPanelDateTimeFeature } from '../src/features/panel/panelDateTimeFeature.js';
import {
    createPanelDateTimeStore,
    PANEL_DATE_TIME_ACTION_TYPES
} from '../src/store/panelDateTimeStore.js';

assert.deepEqual(parsePanelDateKey('2026-02-28'), { year: 2026, month: 2, day: 28 });
assert.equal(parsePanelDateKey('2026-02-30'), null);
assert.equal(normalizePanelTime('7:5'), '07:05');
assert.equal(normalizePanelTime('24:00'), '');
assert.deepEqual(shiftPanelCalendarMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });

const augustCells = buildPanelCalendarCells({
    calendarMonth: { year: 2026, month: 8 },
    selectedDateKey: '2026-08-29',
    todayDateKey: '2026-08-29',
    resolveServiceDayLabel: () => '休息日'
});
assert.equal(augustCells.length, 42);
assert.equal(augustCells[0].dateKey, '2026-07-26');
assert.equal(augustCells[41].dateKey, '2026-09-05');
assert.equal(augustCells.find((cell) => cell.selected)?.dateKey, '2026-08-29');
assert.equal(augustCells.find((cell) => cell.selected)?.today, true);
const augustViewModel = buildPanelDateTimeViewModel({
    draft: { dateKey: '2026-08-29', time: '20:35' },
    committed: { dateKey: '2026-08-29', time: '20:35' },
    calendarMonth: { year: 2026, month: 8 }
}, {
    resolveServiceDayLabel: (dateKey) => {
        const parts = parsePanelDateKey(dateKey);
        const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
        return weekday === 0 || weekday === 6 ? '休息日' : '';
    }
});
assert.ok(augustViewModel.calendarCells.filter((cell) => cell.serviceDayLabel === '休息日').length >= 8);

const store = createPanelDateTimeStore({ dateKey: '2026-08-29', time: '20:35', autoNow: false });
const actionTypes = [];
store.subscribe((_state, action) => actionTypes.push(action.type));
const commits = [];
const resets = [];
const feature = createPanelDateTimeFeature({
    store,
    getCurrentValue: () => ({ dateKey: '2026-08-29', time: '20:35', autoNow: false }),
    getNowValue: () => ({ dateKey: '2026-08-29', time: '20:36', autoNow: true }),
    getTodayDateKey: () => '2026-08-29',
    resolveServiceDayLabel: () => '休息日',
    onCommit: (value) => commits.push(value),
    onResetNow: (value) => resets.push(value)
});

feature.open();
feature.handleIntent({ type: 'selectDate', dateKey: '2026-08-30' });
feature.handleIntent({ type: 'selectHour', value: 21 });
feature.handleIntent({ type: 'selectMinute', value: 10 });
assert.equal(commits.length, 0);
feature.cancel();
assert.deepEqual(store.getState().committed, {
    dateKey: '2026-08-29',
    time: '20:35',
    hour: 20,
    minute: 35,
    autoNow: false
});

feature.open();
feature.handleIntent({ type: 'selectDate', dateKey: '2026-08-30' });
feature.handleIntent({ type: 'selectHour', value: 21 });
feature.handleIntent({ type: 'selectMinute', value: 10 });
feature.confirm();
assert.equal(commits.length, 1);
assert.equal(commits[0].dateKey, '2026-08-30');
assert.equal(commits[0].time, '21:10');
assert.equal(feature.isOpen(), false);

feature.open();
feature.resetNow();
assert.equal(resets.length, 1);
assert.equal(resets[0].autoNow, true);
assert.equal(feature.isOpen(), false);
assert.ok(actionTypes.every((type) => type.startsWith('panelDateTime/')));
assert.ok(actionTypes.includes(PANEL_DATE_TIME_ACTION_TYPES.OPEN));
assert.ok(actionTypes.includes(PANEL_DATE_TIME_ACTION_TYPES.CONFIRM));
assert.ok(actionTypes.includes(PANEL_DATE_TIME_ACTION_TYPES.RESET_NOW));
feature.destroy();

const [appSource, panelMainViewSource, pickerViewSource, cssSource] = await Promise.all([
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/panelMainView.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/panelDateTimePickerView.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/app.css', import.meta.url), 'utf8')
]);

assert.match(appSource, /dateTimePickerMode:\s*'combined'/);
assert.match(panelMainViewSource, /dateTimePickerMode\s*=\s*'legacy'/);
assert.match(panelMainViewSource, /usesCombinedDateTimePicker\s*\?\s*'hidden'\s*:\s*'date'/);
assert.doesNotMatch(pickerViewSource, /选择日期与时间|当前时间/);
assert.match(pickerViewSource, /anchor\.getBoundingClientRect\(\)/);
assert.match(pickerViewSource, /settings-time-picker panel-datetime-picker/);
assert.match(cssSource, /\.panel-datetime-picker-day\.is-selected \.panel-datetime-picker-day-service\s*\{\s*top:\s*41px/);

const pickerZIndex = Number(cssSource.match(/\.settings-time-picker\.panel-datetime-picker\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1]);
assert.ok(pickerZIndex > 10030, 'picker must sit above all business drawers and popovers');
assert.ok(pickerZIndex < 12000, 'picker must stay below global modal overlays');
assert.doesNotMatch(cssSource.match(/\.settings-time-picker\.panel-datetime-picker\s*\{[\s\S]*?\n\}/)?.[0] || '', /bottom:\s*0|inset:\s*0/);

console.log('panel date-time picker smoke ok');
