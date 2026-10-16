import assert from 'node:assert/strict';
import { buildLineNameLabelGeoJSON, buildLineNameLabelCandidates, selectLineNameLabelCandidates,
    getLineNameLabelTextSizeForZoom, getLineNameLabelBounds } from '../src/domain/lineNameLabels.js';
import { addLineNameLabelsLayer } from '../src/map/layers.js';
import { buildOffsetPolylinePixelsWithMiter } from '../src/map/offset.js';
import { createBasemapController } from '../src/services/mapEngine.js';

const line = (id, coordinates, properties = {}) => ({ type: 'Feature', properties: { id, name: id, color: '#123456', ...properties },
    geometry: { type: 'LineString', coordinates } });
const options = {
    project: ([x, y]) => ({ x, y }), unproject: ({ x, y }) => [x, y],
    width: 500, height: 400, zoom: 12, measureText: (text, size) => text.length * size,
    buildFixedOffset: buildOffsetPolylinePixelsWithMiter
};
const paths = buildLineNameLabelGeoJSON([
    line('A', [[-200, 100], [700, 100]]),
    { ...line('B', []), geometry: { type: 'MultiLineString', coordinates: [
        [[-5000, -1000], [5000, -1000]], [[60, 220], [440, 220]]
    ] } },
    line('A', [[100, 300], [400, 300]]),
    line('Base.A', [[20, 30], [450, 30]]),
    line('hidden', [[20, 30], [450, 30]], { hidden_by_opacity_zero: 1 }),
    line('freight', [[20, 30], [450, 30]], { name: '货物线' })
]);
assert.equal(paths.features.length, 4, '保留同一线路的所有分段，沿用隐藏辅助线规则');
const candidates = buildLineNameLabelCandidates(paths, options);
assert.deepEqual(new Set(candidates.features.map(f => f.properties.id)), new Set(['A', 'B']), '最长分段在视口外时，仍从可见短分段生成候选');
assert.ok(candidates.features.filter(f => f.properties.id === 'A').length > 2);
assert.ok(candidates.features.every(f => f.geometry.type === 'LineString'));
const midpoint = feature => { const points = feature.geometry.coordinates; return points[0].map((value, index) => (value + points.at(-1)[index]) / 2); };
assert.ok(candidates.features.every(f => f.geometry.coordinates.every(point => point.every(Number.isFinite))));
assert.ok(candidates.features.every(f => Math.abs(f.geometry.coordinates[0][1] - f.geometry.coordinates.at(-1)[1]) < 0.001), '水平线文字保持水平');
assert.ok(candidates.features.some(f => midpoint(f)[1] < 100));
assert.ok(candidates.features.some(f => midpoint(f)[1] > 100), '两侧都可作为备用位置');
const onlyB = buildLineNameLabelCandidates(paths, { ...options, lineIds: new Set(['B']) });
assert.ok(onlyB.features.length);
assert.ok(onlyB.features.every(f => f.properties.id === 'B'), '过滤发生在排布前');
assert.equal(buildLineNameLabelCandidates(paths, { ...options, lineIds: new Set() }).features.length, 0);

const vertical = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('纵线', [[200, 30], [200, 360]])]), options);
assert.ok(vertical.features.length);
assert.ok(vertical.features.every(f => Math.abs(f.geometry.coordinates[0][0] - f.geometry.coordinates.at(-1)[0]) < 0.001));
const short = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('短线', [[220, 200], [240, 200]])]), options);
assert.equal(short.features.length, 0, '线路长度不足以容纳文字时不显示，不延长实际路径');
const shortEnough = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('短', [[220, 200], [255, 200]])]), options);
assert.ok(shortEnough.features.length, '短线路仍按实际文字需要的长度判断，不设置线路长度白名单');
const bend = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('弯线', [[10, 90], [150, 90], [150, 310], [490, 310]])]), options);
assert.ok(bend.features.some(f => Math.abs(f.geometry.coordinates[0][1] - f.geometry.coordinates.at(-1)[1]) < 0.01));
assert.ok(bend.features[0].properties.label_score < 20, '优先选足够直的局部窗口');

const gentleCoordinates = Array.from({ length: 31 }, (_, i) => {
    const angle = -0.8 + i * 1.6 / 30;
    return [250 + Math.sin(angle) * 120, 70 + (1 - Math.cos(angle)) * 120];
});
const gentle = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('曲线文字', gentleCoordinates)]), options);
assert.ok(gentle.features.length, '平缓弯线允许逐字沿线显示');
assert.ok(gentle.features.every(f => f.geometry.coordinates.length > 2), '候选保留真实弯曲路径，不能再次退化成旋转的直线文字');
const loopCoordinates = radius => Array.from({ length: 65 }, (_, i) => {
    const angle = i * Math.PI * 2 / 64;
    return [250 + Math.cos(angle) * radius, 200 + Math.sin(angle) * radius];
});
for (const id of ['随机环线', '另一个名称']) {
    const tinyLoop = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line(id, loopCoordinates(14), { name: '很长的环形线路名称' })]), options);
    assert.equal(tinyLoop.features.length, 0, '小环线自动拒绝，与线路 ID 和名称无关');
    const largeLoop = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line(id, loopCoordinates(120), { name: '很长的环形线路名称' })]), options);
    assert.ok(largeLoop.features.length, '放大后出现可读路径，环线可以重新显示');
}
const sharp = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('急弯', [[180, 180], [200, 180], [200, 200]])]), options);
assert.equal(sharp.features.length, 0, '整段文字覆盖九十度急弯时不强行排字');
const folded = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('折返线路', [[200, 200], [220, 200], [200, 200], [220, 200], [200, 200]])]), options);
assert.equal(folded.features.length, 0, '线路虽有足够累计长度，反复折返仍不可读');
const joined = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([
    line('接续', [[200, 200], [220, 200]]), line('接续', [[240, 200], [220, 200]])
]), options);
assert.ok(joined.features.length, '方向相反但实际相接的短分段应接续排字，不能把站间切片当成整条短线');
const branches = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([
    line('分叉线', [[220, 200], [250, 200]]), line('分叉线', [[250, 200], [280, 200]]), line('分叉线', [[250, 200], [250, 170]])
]), options);
assert.equal(branches.features.length, 0, '分叉处不随意拼接成不存在的排字路径');
const separatedOffsets = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([
    line('错位', [[200, 200], [220, 200]], { line_offset_units: 3 }),
    line('错位', [[220, 200], [240, 200]], { line_offset_units: -3 })
]), options);
assert.equal(separatedOffsets.features.length, 0, '中心线相接但实际偏移后已经断开的分段不能强行接续');

const at15 = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('偏移线', [[20, 100], [480, 100]], { line_offset_units: 8 })]), { ...options, zoom: 15 });
const noOffset = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('偏移线', [[20, 100], [480, 100]])]), { ...options, zoom: 15 });
assert.deepEqual(at15.features.map(f => f.geometry.coordinates), noOffset.features.map(f => f.geometry.coordinates), '线路像素偏移归零后标签位置也归零');
const profileProject = ([lng, lat]) => ({ x: 20 + (lng - 139) * 4600, y: 100 + (35 - lat) * 4600 });
const profile = buildLineNameLabelCandidates(buildLineNameLabelGeoJSON([line('分段', [[139, 35], [139.1, 35]], { line_offset_profile: '[[0,3],[0.5,3],[1,-3]]' })]), {
    ...options, project: profileProject, unproject: ({ x, y }) => [139 + (x - 20) / 4600, 35 - (y - 100) / 4600]
});
assert.ok(profile.features.some(f => profileProject(midpoint(f)).y < 90));
assert.ok(profile.features.some(f => profileProject(midpoint(f)).y > 110), '分段正负偏移都参与真实位置计算');

const prepared = (id, x, rank) => ({ type: 'Feature', id: `${id}:${rank}`, geometry: { type: 'LineString', coordinates: [[x - 35, 100], [x + 35, 100]] },
    properties: { id, name: id, label_width: 50, label_height: 12, label_rank: rank } });
const selected = selectLineNameLabelCandidates({ features: [prepared('A', 100, 0), prepared('B', 100, 1), prepared('B', 250, 2), prepared('B', 350, 3)] }, options.project);
assert.equal(selected.length, 2);
assert.equal(midpoint(selected[1])[0], 250, '碰撞失败后尝试同组的下一候选');
const choice = candidates.features.find(f => f.properties.id === 'A');
const stable = buildLineNameLabelCandidates(paths, { ...options, previous: new Map([['A', choice.properties]]) });
assert.equal(stable.features.find(f => f.properties.id === 'A').id, choice.id, '仍然可读时复用原位置');
const moving = buildLineNameLabelCandidates(paths, { ...options, zoom: 13,
    project: ([x, y]) => ({ x: 500 - y * 2, y: (x - 200) * 2 }),
    unproject: ({ x, y }) => [y / 2 + 200, (500 - x) / 2],
    previous: new Map([['A', choice.properties]]), previousOnly: true });
assert.equal(moving.features.length, 1, '相机移动只更新已显示候选，不重新搜索全网');
const moved = moving.features[0];
assert.equal(moved.properties.label_segment_t, choice.properties.label_segment_t, '缩放旋转保持同一地理锚点');
assert.ok(Math.abs(moved.geometry.coordinates[0][1] - moved.geometry.coordinates.at(-1)[1]) < 0.001, '旋转后的屏幕竖线仍来自原来的地理水平线');
const movedPoint = { x: 500 - midpoint(moved)[1] * 2, y: (midpoint(moved)[0] - 200) * 2 };
assert.ok(Math.abs(Math.abs(movedPoint.x - 300) - getLineNameLabelTextSizeForZoom(13) * 1.25) < 0.001, '旁置间距按当前字号重算，不随地图缩放翻倍');
assert.ok(getLineNameLabelTextSizeForZoom(15.01) - getLineNameLabelTextSizeForZoom(15) < 0.01, '跨 zoom 15 没有策略跳变');
const box = getLineNameLabelBounds({ x: 100, y: 100 }, 0, 40, 12);
assert.equal(box.maxX - box.minX, 40, '碰撞边界只表示文字尺寸');

const sources = new Map();
const layers = new Map([['lines-layer', { id: 'lines-layer' }]]);
const engine = {
    on() {}, createPopup() {}, getSource: id => sources.get(id), addSource: (id, source) => sources.set(id, source),
    hasLayer: id => layers.has(id), addLayer: (layer, before) => layers.set(layer.id, { ...layer, before })
};
globalThis.document = { documentElement: { getAttribute: () => 'light' } };
addLineNameLabelsLayer(engine, candidates);
delete globalThis.document;
const layout = layers.get('line-name-labels-layer').layout;
assert.equal(layout['symbol-placement'], 'line-center');
assert.equal(layout['text-rotation-alignment'], 'map');
assert.equal(layout['text-keep-upright'], true);
assert.equal(layout['text-max-angle'], 30);
assert.equal(layout['text-allow-overlap'], false);
assert.equal(layout['text-ignore-placement'], false);
assert.equal(sources.get('line-name-labels-source').maxzoom, 18);
assert.deepEqual(layers.get('line-name-labels-layer').metadata.tokyoRailSymbolPlacement, { collisionGroup: 'railway-names', candidateGroup: 'id' });

// 底图初始化及反复切换主题，都应以线路名作为最底层业务图层。
const order = ['line-name-labels-layer', 'lines-layer'];
const definitions = new Map(order.map(id => [id, { id }]));
const basemapEngine = {
    getLayer: id => definitions.get(id), getSource: () => null, ensurePmtilesProtocol: () => false,
    getCanvas: () => ({ style: {} }), setPaintProperty() {}, setLayoutProperty() {},
    addLayer: (layer, before) => { definitions.set(layer.id, layer); order.splice(order.indexOf(before), 0, layer.id); },
    moveLayer: (id, before) => { order.splice(order.indexOf(id), 1); order.splice(order.indexOf(before), 0, id); },
    removeLayer: id => { definitions.delete(id); const index = order.indexOf(id); if (index >= 0) order.splice(index, 1); }, removeSource() {}
};
const basemap = createBasemapController({ mapEngine: basemapEngine, pmtilesAvailable: false });
basemap.ensureLayers();
basemap.setMode('transparent', 'dark');
basemap.setMode('osm-white', 'light');
assert.ok(order.indexOf('tokyo-basemap-background-layer') < order.indexOf('line-name-labels-layer'));
console.log('线路名行为测试通过：真实曲线、长度与弯折判断、小环线缩放、全分段、过滤、偏移、候选重试、动态跟随及底图顺序。');
