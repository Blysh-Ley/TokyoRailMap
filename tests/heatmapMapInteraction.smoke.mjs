import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMapStationJourneyMenu } from '../src/ui/mapStationJourneyMenu.js';
import { bindStationClickHighlightServingLines } from '../src/features/map-interactions/mapInteractionController.js';

class FakeElement {
    constructor() {
        this.children = [];
        this.listeners = new Map();
        this.attributes = new Map();
        const classes = new Set();
        this.classList = {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name)
        };
        this.style = { setProperty() {} };
    }
    get firstChild() { return this.children[0] || null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    removeEventListener(name) { this.listeners.delete(name); }
    contains(target) { return target === this || this.children.some((child) => child.contains(target)); }
    remove() {}
    click() { this.listeners.get('click')?.({ preventDefault() {}, stopPropagation() {} }); }
}

const makeMenu = (extra = {}) => {
    const selections = [];
    const doc = new FakeElement();
    doc.createElement = () => new FakeElement();
    const menu = createMapStationJourneyMenu({
        doc,
        container: new FakeElement(),
        getWaypointOptions: () => [{ index: 0, label: '途径点1' }],
        onSelectField: (action, station) => selections.push({ action, station }),
        labels: {
            menu: '路线规划站点选项',
            origin: '作为起点',
            destination: '作为终点',
            newWaypoint: '作为新增途径点'
        },
        ...extra
    });
    return { menu, selections, list: menu.el.firstChild };
};
const station = { stationId: 'Tokyo', stationName: '东京' };
const openOptions = { point: { x: 120, y: 180 }, station };

const legacy = makeMenu();
assert.equal(legacy.menu.open(openOptions), true);
assert.deepEqual(
    legacy.list.children.map((item) => item.textContent),
    ['作为起点', '途径点1', '作为新增途径点', '作为终点'],
    'omitting the optional menu provider must preserve the original route-planning menu'
);
legacy.list.children[1].click();
assert.deepEqual(legacy.selections, [{ action: { field: 'waypoint', waypointIndex: 0 }, station }]);
assert.equal(legacy.menu.isOpen(), false);

let heatmapActive = true;
const custom = makeMenu({
    getMenuItems: () => heatmapActive
        ? [{ action: { type: 'travelHeatmap' }, text: '出行热图' }]
        : null
});
assert.equal(custom.menu.open(openOptions), true);
assert.deepEqual(custom.list.children.map((item) => item.textContent), ['出行热图']);
assert.equal(custom.list.getAttribute('aria-label'), '出行热图');
custom.list.children[0].click();
assert.deepEqual(custom.selections, [{ action: { type: 'travelHeatmap' }, station }]);
assert.equal(custom.menu.isOpen(), false);
heatmapActive = false;
custom.menu.open(openOptions);
assert.deepEqual(
    custom.list.children.map((item) => item.textContent),
    ['作为起点', '途径点1', '作为新增途径点', '作为终点'],
    'leaving heatmap mode must restore every original route menu option'
);
assert.equal(custom.list.getAttribute('aria-label'), '路线规划站点选项');

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
const heatmapHandlerSource = appSource.match(
    /const handleHeatmapStationClick = (\(\{ point, props, stationId \} = \{\}\) => \{[\s\S]*?\n    \});/
)?.[1];
assert.ok(heatmapHandlerSource, 'the app must use one heatmap station handler for canvas and DOM labels');
let picking = false;
const picked = [];
const opened = [];
let closed = 0;
const handleHeatmapStationClick = new Function(
    'window', 'mapStationJourneyMenu', 'openMapStationJourneyMenu',
    `return (${heatmapHandlerSource});`
)(
    { TokyoRailSearchUI: {
        isHeatmapMapPickActive: () => picking,
        pickHeatmapStation: (payload) => picked.push(payload)
    } },
    { close: () => { closed += 1; } },
    (payload) => { opened.push(payload); return true; }
);
const stationClick = { point: { x: 90, y: 60 }, props: { name_zh: '东京' }, stationId: 'Tokyo' };
assert.equal(handleHeatmapStationClick(stationClick), true);
assert.equal(opened.length, 1, 'ordinary heatmap station clicks open the single-action menu');
assert.equal(picked.length, 0, 'ordinary station clicks must not silently change the heatmap origin');
picking = true;
assert.equal(handleHeatmapStationClick(stationClick), true);
assert.deepEqual(picked, [{ stationId: 'Tokyo', stationName: '东京' }]);
assert.equal(opened.length, 1, 'explicit map picking fills the origin without opening another menu');
assert.equal(closed, 1);
assert.equal(handleHeatmapStationClick({ stationId: '' }), false);
assert.equal(picked.length, 1, 'invalid station clicks must not consume map picking');

const mapHandlers = new Map();
let heatmapClicks = 0;
let journeyClicks = 0;
let stationPanels = 0;
const mapEngine = {
    hasLayer: (id) => id === 'stations-layer',
    on: (type, layer, handler) => mapHandlers.set(`${type}:${layer}`, handler),
    queryRenderedFeatures: () => []
};
bindStationClickHighlightServingLines({
    mapEngine,
    isHeatmapActive: () => heatmapActive,
    onHeatmapStationClick: () => { heatmapClicks += 1; },
    isJourneyPlannerOpen: () => true,
    onJourneyPlannerStationClick: () => { journeyClicks += 1; },
    openPanelForStationWithAutoScroll: () => { stationPanels += 1; }
});
const canvasClick = () => mapHandlers.get('click:stations-layer')({
    point: stationClick.point,
    originalEvent: {},
    features: [{ id: 'Tokyo', properties: { id: 'Tokyo', name_zh: '东京' } }]
});
heatmapActive = true;
await canvasClick();
assert.equal(heatmapClicks, 1);
assert.equal(journeyClicks, 0);
assert.equal(stationPanels, 0, 'heatmap clicks must not fall through into a regular station panel');
heatmapActive = false;
await canvasClick();
assert.equal(journeyClicks, 1, 'leaving heatmap must preserve the original route-planning branch');

assert.match(appSource, /onHeatmapStationClick:\s*handleHeatmapStationClick/);
assert.match(
    appSource,
    /const fireStationLabelTap[\s\S]*?isHeatmapActive\?\.\(\) === true\) \{\s*handleHeatmapStationClick\(\{[\s\S]*?point: mapEngine\.project\(item\.coordinates\)/,
    'DOM station labels must share the heatmap canvas behavior using map-local coordinates'
);
assert.match(
    appSource,
    /SELECTION_COMMIT_LINE \|\|\s*action\?\.type === ACTION_TYPES\.SELECTION_COMMIT_COMPANY\)\s*&& window\.TokyoRailSearchUI\?\.isHeatmapSessionOpen\?\.\(\) !== true/,
    'line and company commits must preserve overlays during visible or hidden heatmap sessions'
);
assert.match(
    appSource,
    /clearReachableStopsOverlay: \(\) => \{\s*if \(window\.TokyoRailSearchUI\?\.isHeatmapSessionOpen\?\.\(\) === true\) return;\s*appStore\.dispatch\(reachableStopsCleared\(\{ source: 'blankMapClick' \}\)\);/,
    'blank map clicks must not clear an open heatmap session or cancel its pending request'
);
assert.doesNotMatch(heatmapHandlerSource, /drawReachableStops|clearSelectionsAndRestore|clearReachableStops|setMinutes/);

console.log('heatmap map interaction smoke ok');
