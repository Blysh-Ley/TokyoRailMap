import assert from 'node:assert/strict';

import { createBasemapController, createMapEngine } from '../src/services/mapEngine.js';

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
