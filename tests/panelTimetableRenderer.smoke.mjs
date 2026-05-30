import assert from 'node:assert/strict';

import {
    renderPanelPrintableTimetableListHtml,
    renderPanelTimetableListHtml
} from '../src/features/panel/panelTimetableRenderer.js';

const renderTime = (row) => `<b>${row.dep || ''}</b>`;
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
    assert.match(html, /<b>10:20<\/b>/);
    assert.doesNotMatch(html, /is-past/);
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
