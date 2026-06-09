import assert from 'node:assert/strict';

import { renderPanelTripDetailBranchGridRows } from '../src/features/panel/panelTripDetailBranchGridRenderer.js';

const renderLaneBlockCalls = [];
const renderBreakRowCalls = [];

const fakeLaneRenderer = (payload) => {
    renderLaneBlockCalls.push(payload);
    return `[lane:${payload.descriptor?.id || payload.typeName}:${payload.timeColStart}:${payload.flowMarkerCol || 0}:${payload.rowMarkerText || ''}:${payload.rows.map((row) => row.stationId).join(',')}]`;
};

const fakeBreakRenderer = (payload) => {
    renderBreakRowCalls.push(payload);
    return `[break:${payload.branchMode}:${payload.breakStop?.stationId || ''}:${payload.stationCode}:${payload.lineColor}]`;
};

const markRowsPastByCurrentStation = (rows, fallbackPast) => (
    Array.isArray(rows) ? rows.map((row) => ({ ...row, isPast: row.isPast ?? fallbackPast })) : []
);

const mergeHtml = renderPanelTripDetailBranchGridRows({
    branchMode: 'merge',
    buildTimetableStationText: () => '',
    firstBranchMarkerCol: 4,
    mainDescriptor: { id: 'main', color: '#main' },
    mainRows: [{ stationId: 'main-stop', isPast: true }],
    markRowsPastByCurrentStation,
    primaryLane: {
        descriptor: { id: 'primary', color: '#primary' },
        rows: [{ stationId: 'p1' }],
        typeColor: '#primary-color',
        typeName: 'Primary'
    },
    primaryTimeColStart: 2,
    renderPanelTripDetailBranchBreakRow: fakeBreakRenderer,
    renderPanelTripDetailGridLaneBlock: fakeLaneRenderer,
    renderPanelTripDetailGridMarkerCell: () => '',
    renderPanelTripDetailStationCellHtml: () => '',
    renderTripDetailMomentHtml: () => '',
    resolveStationCode: (stationId) => `code:${stationId}`,
    secondaryLanes: [
        {
            descriptor: { id: 'secondary', color: '#secondary' },
            rows: [{ stationId: 's1' }],
            typeColor: '#secondary-color',
            typeName: 'Secondary'
        }
    ],
    totalCols: 6,
    typeColor: '#type',
    typeName: 'Main'
});

assert.equal(
    mergeHtml,
    '[lane:primary:2:0::p1][lane:secondary:4:2:||:s1][break:merge:p1:code:p1:#primary][lane:main:2:0::main-stop]'
);

assert.equal(renderLaneBlockCalls[1].rowMarkerText, '||');
assert.equal(renderBreakRowCalls[0].breakIsPast, true);

renderLaneBlockCalls.length = 0;
renderBreakRowCalls.length = 0;

const splitHtml = renderPanelTripDetailBranchGridRows({
    branchMode: 'split',
    buildTimetableStationText: () => '',
    firstBranchMarkerCol: 4,
    mainDescriptor: { id: 'main', color: '#main' },
    mainRows: [{ stationId: 'main-stop', isPast: false }],
    markRowsPastByCurrentStation,
    primaryLane: {
        descriptor: { id: 'primary', color: '#primary' },
        rows: [{ stationId: 'p1' }],
        typeColor: '#primary-color',
        typeName: 'Primary'
    },
    primaryTimeColStart: 2,
    renderPanelTripDetailBranchBreakRow: fakeBreakRenderer,
    renderPanelTripDetailGridLaneBlock: fakeLaneRenderer,
    renderPanelTripDetailGridMarkerCell: () => '',
    renderPanelTripDetailStationCellHtml: () => '',
    renderTripDetailMomentHtml: () => '',
    resolveStationCode: (stationId) => `code:${stationId}`,
    secondaryLanes: [],
    totalCols: 6,
    typeColor: '#type',
    typeName: 'Main'
});

assert.equal(
    splitHtml,
    '[lane:main:2:0::main-stop][break:split:p1:code:p1:#primary][lane:primary:2:4:||:p1]'
);

assert.equal(renderBreakRowCalls[0].breakIsPast, false);
assert.equal(renderLaneBlockCalls[1].flowMarkerCol, 4);

console.log('panel trip-detail branch grid renderer smoke ok');
