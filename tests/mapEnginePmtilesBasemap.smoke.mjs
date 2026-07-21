import assert from 'node:assert/strict';

import { BASEMAP_GLYPHS_URL, createBasemapController, createMapEngine } from '../src/services/mapEngine.js';

class FakeMap {
    constructor(options) {
        this.options = options;
        this.sources = new Map();
        this.layers = new Map();
        this.canvas = { style: {} };
    }

    addSource(id, source) {
        this.sources.set(id, source);
    }

    getSource(id) {
        return this.sources.get(id) || null;
    }

    addLayer(layer, beforeLayerId) {
        this.layers.set(layer.id, { ...layer, beforeLayerId });
    }

    getLayer(id) {
        return this.layers.get(id) || null;
    }

    removeSource(id) {
        this.sources.delete(id);
    }

    removeLayer(id) {
        this.layers.delete(id);
    }

    moveLayer(id, beforeLayerId) {
        const layer = this.layers.get(id);
        if (layer) layer.beforeLayerId = beforeLayerId;
    }

    setLayoutProperty(id, property, value) {
        const layer = this.layers.get(id);
        if (layer) layer.layout = { ...(layer.layout || {}), [property]: value };
    }

    setPaintProperty(id, property, value) {
        const layer = this.layers.get(id);
        if (layer) layer.paint = { ...(layer.paint || {}), [property]: value };
    }

    getCanvas() {
        return this.canvas;
    }
}

assert.equal(BASEMAP_GLYPHS_URL, 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf');

{
    const calls = [];
    const maplibregl = {
        Map: FakeMap,
        Marker: class {},
        Popup: class {},
        ScaleControl: class {},
        addProtocol: (scheme, tile) => calls.push([scheme, typeof tile])
    };
    const Protocol = class {
        constructor() {
            this.tile = () => {};
        }
    };

    const oldPmtiles = globalThis.pmtiles;
    globalThis.pmtiles = { Protocol };
    try {
        const engine = createMapEngine({ maplibregl, container: 'map' });
        assert.equal(engine.ensurePmtilesProtocol(), true);
        assert.deepEqual(calls, [['pmtiles', 'function']]);
    } finally {
        globalThis.pmtiles = oldPmtiles;
    }
}

{
    const oldCapacitor = globalThis.Capacitor;
    const oldAtob = globalThis.atob;
    const oldPmtiles = globalThis.pmtiles;
    const oldFetch = globalThis.fetch;
    const calls = [];
    globalThis.Capacitor = {
        getPlatform: () => 'android',
        isNativePlatform: () => true,
        registerPlugin: (name) => {
            assert.equal(name, 'TokyoRailBasemap');
            return {
                prepare: async () => ({ ok: true, size: 4 }),
                readRange: async ({ offset, length }) => {
                    calls.push([offset, length]);
                    return {
                        data: 'AQIDBA==',
                        offset,
                        length: 4,
                        size: 4
                    };
                }
            };
        }
    };
    globalThis.atob = (value) => Buffer.from(value, 'base64').toString('binary');
    globalThis.fetch = () => {
        throw new Error('Android PMTiles source should not use fetch ranges');
    };
    class PMTiles {
        constructor(source) {
            this.source = source;
        }

        async getZxy() {
            return this.source.getBytes(0, 4);
        }
    }
    globalThis.pmtiles = { PMTiles };

    try {
        const protocol = [];
        const maplibregl = {
            Map: FakeMap,
            Marker: class {},
            Popup: class {},
            ScaleControl: class {},
            addProtocol: (scheme, tile) => protocol.push([scheme, tile])
        };
        const engine = createMapEngine({ maplibregl, container: 'map' });
        assert.equal(engine.ensurePmtilesProtocol(), true);
        assert.equal(protocol[0][0], 'pmtiles');
        await new Promise((resolve, reject) => {
            protocol[0][1]({ url: 'pmtiles://./tiles/kanto.pmtiles/1/0/0' }, (error, data) => {
                if (error) {
                    reject(error);
                    return;
                }
                assert.deepEqual([...new Uint8Array(data)], [1, 2, 3, 4]);
                resolve();
            });
        });
        assert.deepEqual(calls, [[0, 4]]);
    } finally {
        globalThis.Capacitor = oldCapacitor;
        globalThis.atob = oldAtob;
        globalThis.pmtiles = oldPmtiles;
        globalThis.fetch = oldFetch;
    }
}

{
    const sources = new Map();
    const layers = new Map();
    const layoutCalls = [];
    const mapEngine = {
        addSource: (id, source) => sources.set(id, source),
        getSource: (id) => sources.get(id) || null,
        addLayer: (layer, beforeLayerId) => layers.set(layer.id, { ...layer, beforeLayerId }),
        getLayer: (id) => layers.get(id) || null,
        moveLayer: () => {},
        setLayoutProperty: (id, property, value) => {
            layoutCalls.push([id, property, value]);
            const layer = layers.get(id);
            if (layer) layer.layout = { ...(layer.layout || {}), [property]: value };
        },
        setPaintProperty: () => {},
        getCanvas: () => ({ style: {} }),
        ensurePmtilesProtocol: () => true
    };
    const controller = createBasemapController({
        mapEngine,
        initialMode: 'ost',
        pmtilesAvailable: true,
        pmtilesUrl: './tiles/kanto.pmtiles'
    });

    controller.ensureLayers();
    assert.equal(controller.getMode(), 'osm-white');
    assert.deepEqual(sources.get('osm-vector-source').tiles, ['pmtiles://./tiles/kanto.pmtiles/{z}/{x}/{y}']);
    assert.equal(sources.get('osm-vector-source').minzoom, 0);
    assert.equal(sources.get('osm-vector-source').maxzoom, 14);
    assert.equal(layers.get('osm-water-layer').type, 'fill');
    assert.equal(layers.get('osm-landcover-layer').type, 'fill');
    assert.equal(layers.get('osm-landcover-layer')['source-layer'], 'landcover');
    assert.equal(layers.get('osm-road-layer').paint['line-color'], '#e7e5db');
    assert.equal(layers.get('osm-road-layer').paint['line-opacity'], 0.5);
    assert.equal(layers.get('osm-place-label-layer').type, 'symbol');
    assert.deepEqual(layers.get('osm-place-label-layer').filter, [
        'match',
        ['get', 'class'],
        ['city', 'town', 'village'],
        true,
        false
    ]);
    assert.deepEqual(controller.getAttributionItems(), [
        {
            group: 'map',
            label: 'OpenMapTiles',
            href: 'https://www.openmaptiles.org/'
        },
        {
            group: 'map',
            label: 'OpenStreetMap',
            href: 'https://www.openstreetmap.org/copyright'
        }
    ]);

    controller.setMode('transparent');
    assert.ok(layoutCalls.some(([id, property, value]) => (
        id === 'osm-water-layer' && property === 'visibility' && value === 'none'
    )));

    controller.setMode('osm-detailed');
    assert.ok(layoutCalls.some(([id, property, value]) => (
        id === 'osm-building-layer' && property === 'visibility' && value === 'visible'
    )));

    const style = controller.getStyle({ mode: 'osm-detailed', theme: 'dark' });
    assert.deepEqual(style.sources['osm-vector-source'].tiles, ['pmtiles://./tiles/kanto.pmtiles/{z}/{x}/{y}']);
    assert.equal(style.layers[0].paint['background-color'], '#101418');
    assert.equal(style.layers.some((layer) => layer.id === 'osm-water-layer'), true);
    assert.equal(style.layers.find((layer) => layer.id === 'osm-water-layer').paint['fill-color'], '#2b4554');
    assert.equal(style.layers.some((layer) => layer.id === 'osm-landcover-layer'), true);
    assert.equal(style.layers.some((layer) => layer.id === 'osm-building-layer'), true);
}

{
    const sources = new Map();
    const layers = new Map();
    const removedSources = [];
    const removedLayers = [];
    const layoutCalls = [];
    const mapEngine = {
        addSource: (id, source) => sources.set(id, source),
        getSource: (id) => sources.get(id) || null,
        removeSource: (id) => {
            removedSources.push(id);
            sources.delete(id);
        },
        addLayer: (layer, beforeLayerId) => layers.set(layer.id, { ...layer, beforeLayerId }),
        getLayer: (id) => layers.get(id) || null,
        removeLayer: (id) => {
            removedLayers.push(id);
            layers.delete(id);
        },
        moveLayer: () => {},
        setLayoutProperty: (id, property, value) => {
            layoutCalls.push([id, property, value]);
            const layer = layers.get(id);
            if (layer) layer.layout = { ...(layer.layout || {}), [property]: value };
        },
        setPaintProperty: () => {},
        getCanvas: () => ({ style: {} }),
        ensurePmtilesProtocol: () => true
    };
    const controller = createBasemapController({
        mapEngine,
        initialMode: 'osm-white',
        pmtilesAvailable: true,
        pmtilesUrl: './tiles/kanto.pmtiles'
    });

    controller.ensureLayers();
    const pmtilesSource = sources.get('osm-vector-source');
    assert.ok(pmtilesSource);

    controller.setMode('osm-detailed');
    controller.setActiveBasemapSource('openfreemap');
    controller.setOnlineBasemapStyle({
        styleUrl: 'https://tiles.openfreemap.org/styles/bright',
        backgroundColor: '#eef2f4',
        sourceIds: ['online-basemap-source-openmaptiles'],
        layerIds: ['online-basemap-layer-water'],
        style: {
            version: 8,
            sources: {
                'online-basemap-source-openmaptiles': { type: 'vector', url: 'https://example.test/tiles.json' }
            },
            layers: [
                {
                    id: 'online-basemap-layer-water',
                    type: 'fill',
                    source: 'online-basemap-source-openmaptiles',
                    'source-layer': 'water'
                }
            ]
        }
    });

    assert.equal(sources.get('osm-vector-source'), pmtilesSource);
    assert.equal(removedSources.includes('osm-vector-source'), false);
    assert.ok(sources.get('online-basemap-source-openmaptiles'));
    assert.ok(layers.get('online-basemap-layer-water'));
    assert.ok(layoutCalls.some(([id, property, value]) => (
        id === 'osm-water-layer' && property === 'visibility' && value === 'none'
    )));
    assert.equal(controller.getActiveBasemapSource(), 'openfreemap');
    assert.equal(controller.getStyle().metadata.tokyoRailBasemap.sourceKind, 'openfreemap');
    const forcedPmtilesExportStyle = controller.getStyle({
        mode: 'osm-white',
        sourceKind: 'pmtiles',
        theme: 'light'
    });
    assert.equal(forcedPmtilesExportStyle.metadata.tokyoRailBasemap.sourceKind, 'pmtiles');
    assert.deepEqual(forcedPmtilesExportStyle.sources['osm-vector-source'].tiles, ['pmtiles://./tiles/kanto.pmtiles/{z}/{x}/{y}']);
    assert.equal(forcedPmtilesExportStyle.layers.some((layer) => layer.id === 'osm-building-layer'), false);
    assert.equal(forcedPmtilesExportStyle.layers.some((layer) => layer.id === 'osm-water-layer'), true);
    assert.equal(controller.getActiveBasemapSource(), 'openfreemap');

    layoutCalls.length = 0;
    controller.setOnlineBasemapStyle(null);
    controller.setActiveBasemapSource('pmtiles');

    assert.equal(sources.get('osm-vector-source'), pmtilesSource);
    assert.equal(removedSources.includes('osm-vector-source'), false);
    assert.equal(sources.has('online-basemap-source-openmaptiles'), false);
    assert.equal(layers.has('online-basemap-layer-water'), false);
    assert.ok(removedSources.includes('online-basemap-source-openmaptiles'));
    assert.ok(removedLayers.includes('online-basemap-layer-water'));
    assert.ok(layoutCalls.some(([id, property, value]) => (
        id === 'osm-water-layer' && property === 'visibility' && value === 'visible'
    )));
    assert.equal(controller.getActiveBasemapSource(), 'pmtiles');
}

{
    const sources = new Map();
    const layers = new Map();
    let protocolReady = false;
    let addSourceCalled = false;
    const mapEngine = {
        addSource: (id, source) => {
            addSourceCalled = true;
            sources.set(id, source);
        },
        getSource: (id) => sources.get(id) || null,
        addLayer: (layer, beforeLayerId) => layers.set(layer.id, { ...layer, beforeLayerId }),
        getLayer: (id) => layers.get(id) || null,
        moveLayer: () => {},
        setLayoutProperty: () => {},
        setPaintProperty: () => {},
        getCanvas: () => ({ style: {} }),
        ensurePmtilesProtocol: () => protocolReady
    };
    const controller = createBasemapController({
        mapEngine,
        initialMode: 'osm-white',
        pmtilesAvailable: true,
        pmtilesUrl: './tiles/kanto.pmtiles'
    });

    controller.ensureLayers();
    assert.equal(addSourceCalled, false);
    assert.equal(sources.has('osm-vector-source'), false);
    assert.equal(layers.has('osm-water-layer'), false);
    assert.equal(layers.has('tokyo-basemap-background-layer'), true);

    protocolReady = true;
    controller.ensureLayers();
    assert.equal(addSourceCalled, true);
    assert.ok(sources.get('osm-vector-source'));
    assert.ok(layers.get('osm-water-layer'));
}

{
    const sources = new Map();
    const layers = new Map();
    const mapEngine = {
        addSource: (id, source) => sources.set(id, source),
        getSource: (id) => sources.get(id) || null,
        addLayer: (layer, beforeLayerId) => layers.set(layer.id, { ...layer, beforeLayerId }),
        getLayer: (id) => layers.get(id) || null,
        moveLayer: () => {},
        setLayoutProperty: () => {},
        setPaintProperty: () => {},
        getCanvas: () => ({ style: {} }),
        ensurePmtilesProtocol: () => {
            throw new Error('PMTiles protocol should not be registered without a valid archive');
        }
    };
    const controller = createBasemapController({
        mapEngine,
        initialMode: 'osm-detailed',
        pmtilesAvailable: false,
        pmtilesUrl: './tiles/kanto.pmtiles'
    });

    controller.ensureLayers();
    assert.equal(sources.has('osm-vector-source'), false);
    assert.equal(layers.has('tokyo-basemap-background-layer'), true);
    assert.equal(layers.has('osm-water-layer'), false);
    assert.deepEqual(controller.getStyle().sources, {});
    assert.equal(controller.getStyle().layers.length, 1);
    const forcedPmtilesExportStyle = controller.getStyle({
        mode: 'osm-white',
        sourceKind: 'pmtiles'
    });
    assert.deepEqual(forcedPmtilesExportStyle.sources, {});
    assert.equal(forcedPmtilesExportStyle.layers.length, 1);
    assert.equal(forcedPmtilesExportStyle.metadata.tokyoRailBasemap.sourceKind, 'none');
}

{
    let addSourceFailed = false;
    const mapEngine = {
        addSource: () => {
            addSourceFailed = true;
            throw new Error('Style is not ready');
        },
        getSource: () => null,
        addLayer: () => {
            throw new Error('Style is not ready');
        },
        getLayer: () => null,
        moveLayer: () => {},
        setLayoutProperty: () => {},
        setPaintProperty: () => {},
        getCanvas: () => ({ style: {} }),
        ensurePmtilesProtocol: () => true
    };
    const controller = createBasemapController({
        mapEngine,
        initialMode: 'osm-white',
        pmtilesAvailable: false,
        pmtilesUrl: './tiles/kanto.pmtiles'
    });

    assert.equal(controller.setPmtilesAvailable(true), true);
    assert.equal(controller.getPmtilesAvailable(), true);
    assert.equal(addSourceFailed, true);
}

console.log('map engine pmtiles basemap smoke ok');
