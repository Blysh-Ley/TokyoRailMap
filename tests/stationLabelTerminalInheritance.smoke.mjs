import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as stationLabelDisplay from '../src/domain/stationLabelDisplay.js';
import { buildStationLabelGeoJSON } from '../src/map/labels.js';
import { setupCollisions } from '../src/map/collision.js';

const appSource = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const exportSource = readFileSync(new URL('../src/features/print/print.js', import.meta.url), 'utf8');
const sliceDeclarations = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const collapseDeclaration = sliceDeclarations(appSource,
    '    const applyTransferStationLabelCollapse =', '    const normalizeStationIdSetForApp =');
const terminalDeclarations = sliceDeclarations(appSource,
    '    const captureBaseStationLabelTerminalState =', '    const toTransferCapsuleVisibleKey =');
const exportCollapseDeclaration = sliceDeclarations(exportSource,
    '    const applyTransferStationLabelCollapseForExport =', '    const pickVisibleLabelIdsByCollision =');

const makeLabel = (stationId, name, coordinates, isTerminalStation = false) => ({
    stationId,
    coordinates,
    props: { id: stationId, name, serving_ids: ['甲线', '乙线'], is_terminal_station: isTerminalStation ? 1 : 0 },
    el: { textContent: name, style: {} },
    priority: 2,
    focusPriority: isTerminalStation ? 2 : 1,
    isTerminalStation,
    labelDyPx: 6,
    width: 34,
    height: 18,
    servingLineIds: [stationId.split('.')[0]]
});
const toGeoJSON = (labels) => ({
    type: 'FeatureCollection',
    features: labels.map((label) => ({
        type: 'Feature', id: label.stationId, properties: { ...label.props },
        geometry: { type: 'Point', coordinates: label.coordinates.slice() }
    }))
});

const labels = [
    makeLabel('甲线.枢纽', '枢纽', [0, 0]),
    makeLabel('乙线.枢纽', '枢纽', [0, -0.1], true),
    makeLabel('丙线.枢纽西口', '枢纽西口', [1, 0.1]),
    makeLabel('丁线.枢纽', '枢纽', [10, 10]),
    makeLabel('戊线.普通', '普通换乘', [20, 20]),
    makeLabel('己线.普通', '普通换乘', [20, 19.9])
];
const group = new Set(labels.slice(0, 3).map((label) => label.stationId));
const ordinaryGroup = new Set(labels.slice(4).map((label) => label.stationId));
const transferStationIdsByStationId = new Map([
    ...[...group].map((id) => [id, group]),
    ...[...ordinaryGroup].map((id) => [id, ordinaryGroup])
]);
const baseGeoJSON = toGeoJSON(labels);
let sourceData = buildStationLabelGeoJSON(baseGeoJSON);
let sourceUpdates = 0;
const mapEngine = {
    getSource: () => ({ serialize: () => ({ data: sourceData }) }),
    setSourceData: (_id, data) => { sourceData = data; sourceUpdates += 1; }
};
let visibleIds = null;
let endpointIds = null;
const collapse = new Function(
    'stationLabels', 'transferStationIdsByStationId', 'getVisibleStationIdsForTransferCapsules',
    'stationVisualHighlightId', 'setStationLabelTranslate', 'isMultiSelectModeEnabled',
    'getFocusedStationLabelPriority', 'inheritMergedStationLabelTerminalState', 'mapEngine',
    'STATION_LABELS_SOURCE_ID', 'buildStationLabelGeoJSON', 'getEndpointIds',
    `let tripPreviewEndpointStationIds = null;\n${terminalDeclarations}\n${collapseDeclaration}\nreturn () => {
        tripPreviewEndpointStationIds = getEndpointIds();
        applyTransferStationLabelCollapse();
    };`
)(labels, transferStationIdsByStationId, () => visibleIds, '', () => {}, () => false,
    stationLabelDisplay.getFocusedStationLabelPriority, stationLabelDisplay.inheritMergedStationLabelTerminalState,
    mapEngine, 'station-labels-source', buildStationLabelGeoJSON, () => endpointIds);

collapse();
assert.equal(labels[0].isTerminalStation, true, '同名代表标签应继承首末站身份');
assert.equal(labels[0].focusPriority, 2);
assert.equal(labels[0].props.is_terminal_station, 1);
assert.equal(labels[1].forceHiddenByTransferCollapse, true);
assert.equal(labels[2].isTerminalStation, false, '同组异名站不继承');
assert.equal(labels[3].isTerminalStation, false, '不同换乘组的同名站不继承');
assert.equal(labels[4].isTerminalStation, false, '没有首末站的同名组保持不变');
assert.equal(sourceData.features[0].properties.is_terminal_station, 1);
assert.equal(sourceData.features[0].properties.focus_priority, 2);
const updatesAfterMerge = sourceUpdates;
collapse();
assert.equal(sourceUpdates, updatesAfterMerge, '合并结果未变时不重复刷新站名源');

visibleIds = new Set(['甲线.枢纽', '丙线.枢纽西口']);
collapse();
assert.equal(labels[0].isTerminalStation, false, '缩小合并范围后清除先前继承结果');
assert.equal(labels[0].focusPriority, 1);
assert.equal(sourceData.features[0].properties.is_terminal_station, 0);

endpointIds = new Set(['甲线.枢纽']);
collapse();
assert.equal(labels[0].isTerminalStation, true, '保留预览首末站保护');
endpointIds = null;
collapse();
assert.equal(labels[0].isTerminalStation, false, '清除预览后恢复原始状态');

visibleIds = null;
labels[1].labelPosition = 'below';
collapse();
assert.equal(labels[0].isTerminalStation, true);
assert.equal(labels[1].forceHiddenByTransferCollapse, false, '保留固定在下方的标签');
labels[1].labelPosition = null;
collapse();

const zoomData = structuredClone(baseGeoJSON);
zoomData.features[0].geometry.coordinates = [5, 6];
const zoomLabels = buildStationLabelGeoJSON(zoomData, labels);
assert.deepEqual(zoomLabels.features[0].geometry.coordinates, [5, 6], '属性继承不覆盖新的缩放坐标');
assert.equal(zoomLabels.features[0].properties.is_terminal_station, 1);
assert.equal(zoomLabels.features[0].properties.focus_priority, 2);
assert.equal(zoomLabels.features[0].properties.priority, 2);
assert.equal(baseGeoJSON.features[0].properties.is_terminal_station, 0, '不改写原始站点数据');

globalThis.requestAnimationFrame = (callback) => { callback(); return null; };
for (const mode of ['auto', 'focus']) {
    const filters = [];
    const competitor = makeLabel('庚线.首末', '单线首末站', [0, 0], true);
    competitor.priority = 1;
    setupCollisions({
        getZoom: () => 11,
        hasLayer: (id) => id === 'station-labels-layer',
        on: () => {}, project: () => ({ x: 0, y: 0 }),
        setFilter: (_id, filter) => filters.push(filter),
        setLayerVisibility: () => {}, setLayoutProperty: () => {}
    }, [labels[0], competitor], [], { getLabelMode: () => mode });
    assert.deepEqual(filters.at(-1).at(-1).at(-1), ['literal', ['甲线.枢纽']], `${mode} 模式使用继承后的首末站优先级`);
}

const collapseForExport = new Function('inheritMergedStationLabelTerminalState',
    `${exportCollapseDeclaration}\nreturn applyTransferStationLabelCollapseForExport;`
)(stationLabelDisplay.inheritMergedStationLabelTerminalState);
const exportCandidates = baseGeoJSON.features.map((feature) => ({
    id: feature.id, text: feature.properties.name, coordinates: feature.geometry.coordinates,
    priority: 2, isTerminalStation: feature.properties.is_terminal_station === 1,
    focusPriority: feature.properties.is_terminal_station ? 2 : 1
}));
const exported = collapseForExport({ candidates: exportCandidates, transferStationIdMap: transferStationIdsByStationId });
assert.equal(exported.find((label) => label.id === '甲线.枢纽').isTerminalStation, true);
assert.equal(exported.find((label) => label.id === '甲线.枢纽').focusPriority, 2);
assert.equal(exported.find((label) => label.id === '丙线.枢纽西口').isTerminalStation, false);
assert.equal(exported.find((label) => label.id === '丁线.枢纽').isTerminalStation, false);

console.log('同名站首末站继承、站名源与导出碰撞验证通过');
