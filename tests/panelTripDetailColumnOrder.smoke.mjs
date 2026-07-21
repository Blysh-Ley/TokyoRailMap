import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    PANEL_STATION_JUMP_CLASS,
    resolvePanelStationJumpIntent
} from '../src/features/panel/panelStationJump.js';
import {
    applyPanelTripDetailAlternateBodyDisplay,
    splitPanelTripDetailAlternateBodySegmentsByDisplayLine
} from '../src/features/panel/panelTripDetailAlternateBody.js';
import {
    renderPanelTripDetailBranchBreakRow,
    renderPanelTripDetailGridLaneBlock,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml,
    renderPanelTripDetailStopRowHtml
} from '../src/features/panel/panelTripDetailRender.js';

const renderSource = readFileSync(join(process.cwd(), 'src/features/panel/panelTripDetailRender.js'), 'utf8');
const panelSource = readFileSync(join(process.cwd(), 'src/features/panel/panel.js'), 'utf8');
const panelRuntimeSource = readFileSync(join(process.cwd(), 'src/features/panel/panelTripDetailRuntime.js'), 'utf8');
const transferSource = readFileSync(join(process.cwd(), 'src/features/panel/panelTripDetailTransfers.js'), 'utf8');
const transferBadgeSource = readFileSync(join(process.cwd(), 'src/domain/transferBadgeDisplay.js'), 'utf8');
const tripDetailViewSource = readFileSync(join(process.cwd(), 'src/ui/panelTripDetailView.js'), 'utf8');
const transferPortalSource = readFileSync(join(process.cwd(), 'src/ui/panelTripDetailTransferHoverPortal.js'), 'utf8');
const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
const coreSource = readFileSync(join(process.cwd(), 'src/features/panel/panelInteractionCore.js'), 'utf8');

const rowHtml = renderPanelTripDetailStopRowHtml({
    rowClass: 'panel-trip-detail-row',
    timeCellClass: 'panel-trip-detail-time panel-trip-detail-moment',
    timeHtml: '10:05',
    stationClass: 'panel-trip-detail-station',
    stationId: 'station-1',
    stationCode: 'JY01',
    stationName: 'Tokyo',
    arrivalTime: '10:05'
});

assert.match(rowHtml, new RegExp(`panel-trip-detail-station ${PANEL_STATION_JUMP_CLASS}`));
assert.match(rowHtml, /data-station-id="station-1"/);
assert.match(rowHtml, /data-panel-station-jump="1"/);
assert.match(rowHtml, /data-panel-station-arrival-time="10:05"/);
assert.match(rowHtml, /role="button"/);
assert.match(rowHtml, /tabindex="0"/);

const stationEl = {
    getAttribute(name) {
        return {
            'data-station-id': 'station-1',
            'data-panel-station-arrival-time': '9:07'
        }[name] || '';
    },
    closest(selector) {
        return selector.includes(PANEL_STATION_JUMP_CLASS) ? this : null;
    }
};
const rootEl = { contains: (node) => node === stationEl };
const intent = resolvePanelStationJumpIntent(stationEl, { rootEl });
assert.equal(intent.stationId, 'station-1');
assert.equal(intent.arrivalTime, '09:07');
assert.equal(intent.adjustTime, true);
assert.equal(resolvePanelStationJumpIntent(stationEl, { rootEl, adjustTime: false }).adjustTime, false);

const timetableDestEl = {
    getAttribute: stationEl.getAttribute,
    closest(selector) {
        if (selector.includes('panel-timetable-dest')) return this;
        if (selector.includes(PANEL_STATION_JUMP_CLASS)) return stationEl;
        return null;
    }
};
assert.equal(
    resolvePanelStationJumpIntent(timetableDestEl, { rootEl: { contains: () => true } }),
    null,
    'panel timetable destination clicks must not be treated as station jumps'
);

const buildPlainTimetableStationText = ({ stationCode = '', stationName = '', stationId = '' } = {}) => {
    const name = String(stationName || stationId || '').trim();
    const code = String(stationCode || '').trim();
    return code ? `${code} ${name}` : name;
};

const splitBreakRowHtml = renderPanelTripDetailBranchBreakRow({
    branchMode: 'split',
    breakStop: {
        stationId: 'JR-East.Yokosuka.Tokyo',
        stationName: '东京'
    },
    totalCols: 6,
    primaryTimeColStart: 1,
    stationColStart: 5,
    firstBranchMarkerCol: 3,
    stationCode: 'JO19',
    buildTimetableStationText: buildPlainTimetableStationText,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml
});

assert.match(splitBreakRowHtml, /东京站解编/);
assert.doesNotMatch(splitBreakRowHtml, /rw-station-code-badge/);
assert.doesNotMatch(splitBreakRowHtml, /data-panel-station-jump="1"/);
assert.doesNotMatch(splitBreakRowHtml, /role="button"/);
assert.doesNotMatch(splitBreakRowHtml, /JO19/);

const mergeBreakRowHtml = renderPanelTripDetailBranchBreakRow({
    branchMode: 'merge',
    breakStop: {
        stationId: 'JR-East.Yokosuka.Tokyo',
        stationName: '东京'
    },
    totalCols: 6,
    primaryTimeColStart: 1,
    stationColStart: 5,
    firstBranchMarkerCol: 3,
    stationCode: 'JO19',
    buildTimetableStationText: buildPlainTimetableStationText,
    renderPanelTripDetailGridMarkerCell,
    renderPanelTripDetailStationCellHtml
});

assert.match(mergeBreakRowHtml, /东京站并结/);
assert.doesNotMatch(mergeBreakRowHtml, /rw-station-code-badge/);

const branchLaneHeaderHtml = renderPanelTripDetailGridLaneBlock({
    descriptor: {
        lineId: 'JR-East.Yokosuka',
        text: 'JR横须贺线',
        color: '#007AC1'
    },
    rows: [],
    timeColStart: 3,
    noteColStart: 3,
    noteColSpan: 2,
    totalCols: 6,
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml: () => ''
});

assert.match(branchLaneHeaderHtml, /grid-column:3 \/ span 2/);
assert.match(branchLaneHeaderHtml, /JR横须贺线/);

const throughDedupedLaneHtml = renderPanelTripDetailGridLaneBlock({
    descriptor: {
        lineId: 'TokyoRail.Temp.NaritaExpress',
        text: '成田特快',
        color: '#e60012'
    },
    rows: [
        {
            dep: '13:38',
            stationId: 'JR-East.Yamanote.Shinjuku',
            stationName: '新宿',
            displayLineId: 'JR-East.ShonanShinjuku',
            displayLineDescriptor: {
                lineId: 'JR-East.ShonanShinjuku',
                text: '成田特快',
                color: '#e60012'
            },
            displayLineColor: '#e60012'
        },
        {
            dep: '14:01',
            stationId: 'JR-East.Yokosuka.Tokyo',
            stationName: '东京',
            displayLineId: 'JR-East.Yokosuka',
            displayLineDescriptor: {
                lineId: 'JR-East.Yokosuka',
                text: '成田特快',
                color: '#e60012'
            },
            displayLineColor: '#e60012'
        }
    ],
    timeColStart: 3,
    noteColStart: 3,
    noteColSpan: 2,
    stationColStart: 5,
    totalCols: 6,
    renderPanelTripDetailStationCellHtml,
    renderTripDetailMomentHtml: (row) => row?.dep || ''
});
assert.equal(
    throughDedupedLaneHtml.match(/成田特快/g)?.length,
    1,
    'branch lane should not repeat identical through-service line notes when displayLineId changes'
);

const alternateBodySourceLineId = 'SRC';
const alternateBodyLineId = 'ALT';
const alternateBodySegments = applyPanelTripDetailAlternateBodyDisplay({
    alternateLineMembership: {
        alternateStationIdByLineStationId: new Map([
            [`${alternateBodySourceLineId}\u0000SRC.A`, 'ALT.A'],
            [`${alternateBodySourceLineId}\u0000SRC.B`, 'ALT.B']
        ]),
        alternateLineIdByLineStationId: new Map([
            [`${alternateBodySourceLineId}\u0000SRC.A`, alternateBodyLineId],
            [`${alternateBodySourceLineId}\u0000SRC.B`, alternateBodyLineId]
        ])
    },
    getLineMeta: (lineId) => ({
        ALT: { name: 'Alternate Line', color: '#ff8800' },
        SRC: { name: 'Source Line', color: '#0066cc' }
    }[lineId] || null),
    segments: [{
        kind: 'main',
        lineId: alternateBodySourceLineId,
        r: alternateBodySourceLineId,
        rows: [
            { stationId: 'SRC.A', stationName: '源A' },
            { stationId: 'SRC.B', stationName: '源B' },
            { stationId: 'SRC.C', stationName: '源C' }
        ]
    }],
    stationsIndex: {
        idToCode: new Map([
            ['ALT.A', 'A1'],
            ['ALT.B', 'B1'],
            ['SRC.C', 'C1']
        ]),
        idToNameZh: new Map([
            ['ALT.A', '替代A'],
            ['ALT.B', '替代B'],
            ['SRC.C', '源C']
        ])
    }
});
assert.equal(alternateBodySegments[0].lineId, alternateBodySourceLineId);
assert.equal(alternateBodySegments[0].rows[0].stationId, 'SRC.A');
assert.equal(alternateBodySegments[0].rows[0].displayStationId, 'ALT.A');
assert.equal(alternateBodySegments[0].rows[0].displayLineId, alternateBodyLineId);
assert.equal(alternateBodySegments[0].rows[0].displayStationCode, 'A1');
assert.equal(alternateBodySegments[0].rows[0].displayStationName, '替代A');
assert.equal(alternateBodySegments[0].rows[0].displayLineColor, '#ff8800');
assert.equal(alternateBodySegments[0].rows[2].stationId, 'SRC.C');
assert.equal(alternateBodySegments[0].rows[2].displayStationId, 'SRC.C');
assert.equal(alternateBodySegments[0].rows[2].displayLineId, alternateBodySourceLineId);
assert.equal(alternateBodySegments[0].rows[2].displayLineColor, '#0066cc');
assert.deepEqual(
    splitPanelTripDetailAlternateBodySegmentsByDisplayLine({ segments: alternateBodySegments }).map((segment) => segment.lineId),
    [alternateBodyLineId, alternateBodySourceLineId]
);

assert.match(
    renderSource,
    /\$\{timeCellHtml\}[\s\S]*renderPanelTripDetailStationCellHtml\(\{[\s\S]*renderPanelTripDetailTransferCellHtml\(\{[\s\S]*\.\.\.\(transferDisplay \|\| \{\}\)/,
    'default trip detail rows should render time, station, then transfer'
);
assert.match(
    renderSource,
    /panel-trip-detail-time panel-trip-detail-moment">\$\{TIME_LABEL_panelTripDetailLayoutShell\}[\s\S]*panel-trip-detail-station">\$\{STATION_LABEL_panelTripDetailLayoutShell\}[\s\S]*panel-trip-detail-transfer">\$\{'\\u6362\\u4e58'\}/,
    'default trip detail header should render time, station, then transfer'
);
assert.match(renderSource, /const\s+primaryTimeColStart\s*=\s*1/);
assert.match(renderSource, /const\s+stationColStart\s*=\s*Math\.max\(1,\s*totalCols - 1\)/);
assert.match(renderSource, /const\s+transferColStart\s*=\s*totalCols/);
assert.match(renderSource, /const\s+MAX_PANEL_TRIP_DETAIL_TRANSFER_ITEMS_PER_ROW\s*=\s*5/);
assert.match(renderSource, /panel-trip-detail-transfer-items-main/);
assert.match(renderSource, /panel-trip-detail-transfer-items-popover/);
assert.match(renderSource, /style:\s*`grid-column:\$\{stationCol\};`/);
assert.match(renderSource, /noteColStart:\s*timeColStart/);
assert.match(renderSource, /stationJumpEnabled:\s*false/);
assert.match(panelSource, /const\s+useBranchGridLayout\s*=\s*branchCount\s*>=\s*2;/);
assert.doesNotMatch(panelSource, /const\s+useBranchGridLayout\s*=\s*branchCount\s*>=\s*2\s*&&\s*!throughCategoryLabel/);
assert.match(panelSource, /buildThroughBranchDescriptor[\s\S]*text:\s*throughCategoryLabel,[\s\S]*color:\s*throughCategoryColor/);
assert.match(panelSource, /applyThroughCategoryIdentityToBranchRows[\s\S]*mainRows:\s*displayMainRows/);
assert.match(panelSource, /renderPanelTripDetailBranchGridRows\(\{[\s\S]*stationColStart,/);
assert.match(panelRuntimeSource, /if\s*\(\s*branchMode\s*&&\s*Array\.isArray\(activeBranchLanes\)\s*&&\s*activeBranchLanes\.length\s*>=\s*2\s*\)/);
assert.doesNotMatch(panelRuntimeSource, /if\s*\(\s*!throughCategoryLabel\s*&&\s*branchMode\s*&&\s*Array\.isArray\(activeBranchLanes\)/);
assert.match(panelRuntimeSource, /forcedTypeColor\s*=\s*''[\s\S]*typeColor:\s*toText\(forcedTypeColor \|\| seg\?\.typeColor \|\| payloadTypeColor\)/);
assert.match(panelRuntimeSource, /typeColor:\s*toText\(throughBranchTypeColor \|\| seg\?\.typeColor \|\| lane\?\.typeColor \|\| payload\?\.typeColor\)/);
assert.doesNotMatch(panelSource, /createLineIconElement/);
assert.doesNotMatch(panelSource, /renderPanelTripDetailTransferCellHtml/);
assert.match(panelSource, /buildTripDetailTransferDisplayByStationId\(\{[\s\S]*getStationGroupsIndex,/);
assert.match(panelSource, /onTripDetailStationJump/);
assert.match(panelSource, /resolvePanelStationJumpIntent\(target,[\s\S]*adjustTime,[\s\S]*rootEl:\s*tripDetailBody/);
assert.match(panelSource, /hideTripDetail\(\{\s*restoreMobileLine:\s*false\s*\}\);[\s\S]*lastTripDetailKey = null;[\s\S]*onTripDetailStationJump\?\.\(intent\)/);
assert.match(panelSource, /setTimeOverride/);
assert.match(panelSource, /let hasTemporaryTimeOverride = false;/);
assert.match(panelSource, /const setTimeOverride = \(value,[\s\S]*temporary = false[\s\S]*hasTemporaryTimeOverride = temporary === true;/);
assert.match(panelSource, /const resetTemporaryTimeOverride = \(\) => \{[\s\S]*if \(!hasTemporaryTimeOverride\) return false;[\s\S]*restoreAutoNowClock\(\);/);
assert.match(transferSource, /from\s+['"]\.\.\/\.\.\/domain\/transferBadgeDisplay\.js['"]/);
assert.match(transferSource, /buildTransferBadgeEntriesByStationId\(\{/);
assert.match(transferSource, /buildCompactTripDetailTransferItemHtmls/);
assert.match(transferBadgeSource, /key:\s*`code\|\|\$\{company\}\|\|\$\{code\}`/);
assert.match(transferBadgeSource, /key:\s*`color\|\|\$\{company\}\|\|\$\{iconColor\}`/);
assert.match(tripDetailViewSource, /createPanelTripDetailTransferHoverPortal/);
assert.match(coreSource, /bind_panelEventDelegationCoordinator\(tripDetailBody,\s*'click',\s*tripDetailHandlers\.click,\s*\{\s*passive:\s*false\s*\}\)/);
assert.match(coreSource, /bind_panelEventDelegationCoordinator\(tripDetailBody,\s*'keydown',\s*tripDetailHandlers\.keydown,\s*\{\s*passive:\s*false\s*\}\)/);
assert.match(transferPortalSource, /doc\.body\.appendChild\(portal\)/);
assert.match(transferPortalSource, /position\(shell\)/);
assert.match(
    transferPortalSource,
    /const\s+maxPortalWidth\s*=\s*rawViewportWidth > pad \* 2 \? rawViewportWidth - pad \* 2 : 280;[\s\S]*portal\.style\.maxWidth\s*=\s*`\$\{maxPortalWidth\}px`;/,
    'trip detail transfer hover portal must clamp width before measuring position'
);
assert.match(cssSource, /\.panel-trip-detail-transfer-hover-panel\s*\{\s*display:\s*none;/);
assert.match(cssSource, /\.panel-trip-detail-transfer-hover-portal\s*\{[\s\S]*position:\s*fixed;/);
assert.match(
    cssSource,
    /grid-template-columns:\s*repeat\(var\(--panel-trip-detail-branch-count,\s*2\),\s*minmax\(0,\s*0\.9fr\)\s*minmax\(0,\s*0\.9fr\)\)\s*minmax\(0,\s*1\.5fr\)\s*minmax\(0,\s*104px\);/
);
assert.match(cssSource, /\.panel-trip-detail-grid-note\s*\{[\s\S]*justify-self:\s*stretch/);
assert.match(cssSource, /max-width:\s*min\(440px,\s*calc\(100vw - 40px\)\)/);
assert.match(cssSource, /\.panel-station-jump-target\s*\{[\s\S]*cursor:\s*pointer/);
assert.match(appSource, /function clearSelectionsAndRestore\(\) \{[\s\S]*panel\?\.resetTemporaryTimeOverride\?\.\(\);[\s\S]*appStore\.dispatch\(selectionClear/);
assert.match(appSource, /onTripDetailStationJump:\s*\(payload\) => \{[\s\S]*jumpToPanelStation\(payload\)\.catch\(\(\) => null\);/);
assert.match(appSource, /const jumpToPanelStation = async \(\{[\s\S]*adjustTime = true,[\s\S]*arrivalTime = '',[\s\S]*stationId = ''/);
assert.match(appSource, /if \(adjustTime !== false && arrivalTime\) \{[\s\S]*panel\?\.setTimeOverride\?\.\(arrivalTime,[\s\S]*rerender:\s*false,[\s\S]*temporary:\s*true/);
assert.doesNotMatch(appSource, /selectServingLinesForStation\(props\);/);
assert.match(appSource, /await openPanelForStationWithAutoScroll\(props,\s*\{\s*autoScroll:\s*false\s*\}\)/);

console.log('panel trip detail column order smoke ok');
