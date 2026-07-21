import assert from 'node:assert/strict';
import { setupCollisions } from '../src/map/collision.js';

globalThis.requestAnimationFrame = (callback) => {
    callback();
    return null;
};

const visibilityCalls = [];
const filterCalls = [];
const eventBindings = [];
const listeners = new Map();
let projectCalls = 0;
const engine = {
    getZoom: () => 11,
    hasLayer: (layerId) => layerId === 'station-labels-layer',
    on: (eventName, listener) => {
        eventBindings.push(eventName);
        listeners.set(eventName, listener);
    },
    project: (coordinates) => {
        projectCalls += 1;
        return { x: coordinates[0] * 100, y: coordinates[1] * 100 };
    },
    setFilter: (layerId, filter) => filterCalls.push({ layerId, filter }),
    setLayerVisibility: (layerId, visible) => visibilityCalls.push({ layerId, visible })
};

let mode = 'auto';
let removed = 0;
let ensured = 0;
const labels = [
    {
        marker: { remove: () => { removed += 1; } },
        el: { style: {}, textContent: 'A' },
        stationId: 'S1',
        coordinates: [0, 0],
        priority: 1,
        servingLineIds: ['L1'],
        hiddenByOpacityZero: false,
        removeMarker() {
            this.marker?.remove?.();
            this.marker = null;
        },
        ensureMarker() {
            ensured += 1;
            this.marker = { remove: () => { removed += 1; } };
            return this.marker;
        }
    },
    {
        marker: { remove: () => { removed += 1; } },
        el: { style: {}, textContent: 'B' },
        stationId: 'S2',
        coordinates: [1, 1],
        priority: 1,
        servingLineIds: ['L2'],
        hiddenByOpacityZero: false,
        removeMarker() {
            this.marker?.remove?.();
            this.marker = null;
        },
        ensureMarker() {
            ensured += 1;
            this.marker = { remove: () => { removed += 1; } };
            return this.marker;
        }
    }
];

const controller = setupCollisions(engine, labels, [], {
    getLabelMode: () => mode,
    getEnabledLineIds: () => null,
    getVisibleStationIds: () => null,
    shouldHideStation: (stationLike) => stationLike.stationId === 'S2'
});

assert.equal(removed, 2);
assert.deepEqual(visibilityCalls.at(-1), { layerId: 'station-labels-layer', visible: true });
assert.equal(filterCalls.at(-1).layerId, 'station-labels-layer');
assert.deepEqual(filterCalls.at(-1).filter, [
    'all',
    ['!=', ['get', 'hidden_by_opacity_zero'], 1],
    ['>', ['coalesce', ['get', 'priority'], 0], 0],
    ['in', ['get', 'id'], ['literal', ['S1']]]
]);
assert.deepEqual(eventBindings, ['move', 'zoom', 'moveend', 'zoomend', 'resize']);
assert.equal(projectCalls, 1);

listeners.get('zoom')?.();
assert.equal(projectCalls, 1);
assert.equal(filterCalls.length, 1);

listeners.get('zoomend')?.();
assert.equal(projectCalls, 2);
assert.equal(filterCalls.length, 1);

mode = 'all';
controller.scheduleUpdate();
assert.deepEqual(visibilityCalls.at(-1), { layerId: 'station-labels-layer', visible: false });
assert.equal(ensured, 2);
assert.equal(labels.every((label) => label.marker), true);

{
    const localFilters = [];
    const localEngine = {
        getZoom: () => 11,
        hasLayer: (layerId) => layerId === 'station-labels-layer',
        on: () => {},
        project: (coordinates) => ({ x: coordinates[0], y: coordinates[1] }),
        setFilter: (layerId, filter) => localFilters.push({ layerId, filter }),
        setLayerVisibility: () => {}
    };
    const localLabels = [
        {
            marker: { remove: () => {} },
            el: { style: {}, textContent: '普通站' },
            stationId: 'N1',
            coordinates: [0, 0],
            priority: 1,
            servingLineIds: ['L1'],
            hiddenByOpacityZero: false,
            removeMarker() {
                this.marker = null;
            },
            ensureMarker() {
                this.marker = { remove: () => {} };
                return this.marker;
            }
        },
        {
            marker: { remove: () => {} },
            el: { style: {}, textContent: '换乘站' },
            stationId: 'T1',
            coordinates: [0, 0],
            priority: 2,
            servingLineIds: ['L1', 'L2'],
            hiddenByOpacityZero: false,
            removeMarker() {
                this.marker = null;
            },
            ensureMarker() {
                this.marker = { remove: () => {} };
                return this.marker;
            }
        }
    ];

    setupCollisions(localEngine, localLabels, [], {
        getLabelMode: () => 'auto',
        getEnabledLineIds: () => null,
        getVisibleStationIds: () => null,
        getLabelBlockingBBoxes: () => [{
            left: -40,
            right: 40,
            top: -40,
            bottom: 40
        }]
    });

    assert.deepEqual(localFilters.at(-1).filter, [
        'all',
        ['!=', ['get', 'hidden_by_opacity_zero'], 1],
        ['>', ['coalesce', ['get', 'priority'], 0], 0],
        ['in', ['get', 'id'], ['literal', ['T1']]]
    ]);
}

{
    const localEngine = {
        getZoom: () => 11,
        hasLayer: (layerId) => layerId === 'station-labels-layer',
        on: () => {},
        project: () => ({ x: 0, y: 0 }),
        setFilter: () => {},
        setLayerVisibility: () => {}
    };
    const localLabels = [
        {
            marker: { remove: () => {} },
            el: { style: {}, textContent: '現在地' },
            stationId: 'SELECTED',
            coordinates: [0, 0],
            width: 40,
            height: 18,
            priority: 1,
            stationVisualCollisionPriorityBoost: 1000000,
            servingLineIds: ['L1'],
            hiddenByOpacityZero: false,
            removeMarker() {
                this.marker = null;
            },
            ensureMarker() {
                this.marker = { remove: () => {} };
                return this.marker;
            }
        },
        {
            marker: { remove: () => {} },
            el: { style: {}, textContent: '換乘站' },
            stationId: 'TRANSFER',
            coordinates: [0, 0],
            width: 40,
            height: 18,
            priority: 3,
            servingLineIds: ['L1', 'L2', 'L3'],
            hiddenByOpacityZero: false,
            removeMarker() {
                this.marker = null;
            },
            ensureMarker() {
                this.marker = { remove: () => {} };
                return this.marker;
            }
        }
    ];

    setupCollisions(localEngine, localLabels, [], {
        getLabelMode: () => 'auto',
        getEnabledLineIds: () => null,
        getVisibleStationIds: () => new Set(['SELECTED', 'TRANSFER'])
    });

    assert.equal(localLabels[0].el.style.display, 'block');
    assert.equal(localLabels[1].el.style.display, 'none');
}

console.log('station label symbol collision smoke ok');
