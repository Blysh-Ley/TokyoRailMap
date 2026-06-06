import assert from 'node:assert/strict';

import {
    renderPanelPrintableTimetableListHtml,
    renderPanelTimetableListHtml
} from '../src/features/panel/panelTimetableRenderer.js';

const renderTime = () => '<b>legacy renderer should not be used</b>';
const resolveBadgeTextColor = (bgColor) => (bgColor === '#ffffff' ? '#111' : '#fff');

{
    const html = renderPanelTimetableListHtml({
        rows: [],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /panel-timetable-empty/);
    assert.match(html, /当前无班次/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-1',
            realOriginId: 'origin-1',
            terminalDisplayName: 'A&B <Terminal>',
            typeName: 'Rapid "Blue"',
            typeColor: '#ffffff',
            arr: '10:18',
            dep: '10:20',
            isPast: false
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /data-trip-key="origin-1"/);
    assert.match(html, /A&amp;B &lt;Terminal&gt;/);
    assert.match(html, /Rapid &quot;Blue&quot;/);
    assert.match(html, /--panel-type-badge-bg:#ffffff/);
    assert.match(html, /--panel-type-badge-fg:#111/);
    assert.match(html, /panel-timetable-time-main panel-time-arrive">10:18<\/span>/);
    assert.doesNotMatch(html, /10:20/);
    assert.doesNotMatch(html, /legacy renderer/);
    assert.doesNotMatch(html, /is-past/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-origin',
            realOriginId: 'origin-row',
            terminalName: 'Origin Terminal',
            typeName: 'Local',
            typeColor: '#009944',
            dep: '06:05',
            showOriginLabel: true,
            isPast: false
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /panel-timetable-time-main panel-time-arrive">06:05<\/span>/);
    assert.match(html, /panel-timetable-time-extra is-origin">始发<\/span>/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-terminal',
            realOriginId: 'terminal-row',
            terminalName: 'Terminal',
            typeName: 'Local',
            typeColor: '#009944',
            arr: '23:58',
            showTerminalLabel: true,
            isPast: false
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /panel-timetable-time-main panel-time-arrive">23:58<\/span>/);
    assert.match(html, /panel-timetable-time-extra is-terminal">终到<\/span>/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-dwell',
            realOriginId: 'dwell-row',
            terminalName: 'Dwell Terminal',
            typeName: 'Local',
            typeColor: '#009944',
            arr: '10:00',
            dep: '10:04',
            isPast: false
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /panel-timetable-time-main panel-time-arrive">10:00<\/span>/);
    assert.match(html, /panel-timetable-time-extra is-dwell">\+4&#39;<\/span>/);
    assert.doesNotMatch(html, /10:04/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-short-dwell',
            realOriginId: 'short-dwell-row',
            terminalName: 'Short Dwell Terminal',
            typeName: 'Local',
            typeColor: '#009944',
            arr: '10:00',
            dep: '10:02',
            isPast: false
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.doesNotMatch(html, /is-dwell/);
    assert.doesNotMatch(html, /\+2'/);
}

{
    const html = renderPanelTimetableListHtml({
        rows: [{
            tripKey: 'trip-2',
            realOriginId: 'origin-2',
            terminalName: 'Past Terminal',
            typeName: 'Local',
            typeColor: '#009944',
            dep: '09:00',
            isPast: true
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.match(html, /panel-timetable-row is-past/);
    assert.match(html, /--panel-type-badge-bg:#c3c7cd/);
    assert.match(html, /--panel-type-badge-fg:#eee/);
}

{
    const html = renderPanelPrintableTimetableListHtml({
        rows: [{
            tripKey: 'trip-3',
            realOriginId: 'origin-3',
            destName: 'Printable Terminal',
            typeName: 'Express',
            typeColor: '#aa0000',
            dep: '11:00',
            isPast: true
        }],
        renderTime,
        resolveBadgeTextColor
    });

    assert.doesNotMatch(html, /is-past/);
    assert.match(html, /--panel-type-badge-bg:#aa0000/);
    assert.match(html, /Printable Terminal/);
}
