import assert from 'node:assert/strict';
import { buildGeoJsonUpdateDiff, createMapEngine } from '../src/services/mapEngine.js';

const makeStationFeature = (id, coordinates, properties = {}) => ({
    type: 'Feature',
    id,
    properties: { id, name: id, ...properties },
    geometry: { type: 'Point', coordinates }
});

const nextStations = {
    type: 'FeatureCollection',
    features: [
        makeStationFeature('S1', [139.1, 35.1]),
        makeStationFeature('S2', [139.2, 35.2])
    ]
};

{
    assert.deepEqual(buildGeoJsonUpdateDiff(nextStations, { promoteId: 'id' }), {
        update: [
            { id: 'S1', newGeometry: { type: 'Point', coordinates: [139.1, 35.1] } },
            { id: 'S2', newGeometry: { type: 'Point', coordinates: [139.2, 35.2] } }
        ]
    });
    assert.deepEqual(buildGeoJsonUpdateDiff(nextStations, {
        featureIds: new Set(['S2']),
        promoteId: 'id'
    }), {
        update: [
            { id: 'S2', newGeometry: { type: 'Point', coordinates: [139.2, 35.2] } }
        ]
    });
}

class FakeMap {
    constructor() {
        this.sources = new Map();
    }

    addSource(sourceId, source) {
        const entry = {
            ...source,
            _data: source.data,
            setCalls: [],
            updateCalls: [],
            setData(data) {
                this.setCalls.push(data);
                this.data = data;
            },
            updateData(diff) {
                this.updateCalls.push(diff);
            }
        };
        this.sources.set(sourceId, entry);
    }

    getSource(sourceId) {
        return this.sources.get(sourceId);
    }

    getLayer() {
        return null;
    }
}

class ObservableFakeMap extends FakeMap {
    constructor() {
        super();
        this.listeners = new Map();
    }

    emit(eventName, payload) {
        for (const listener of this.listeners.get(eventName) || []) listener(payload);
    }

    on(eventName, listener) {
        if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
        this.listeners.get(eventName).add(listener);
    }
}

const createEngine = (MapCtor = FakeMap) => createMapEngine({
    maplibregl: { Map: MapCtor },
    container: 'map'
});

{
    const engine = createEngine();
    engine.addSource('stations-source', {
        type: 'geojson',
        promoteId: 'id',
        data: { type: 'FeatureCollection', features: [] }
    });

    const source = engine.updateGeoJsonSourceData('stations-source', nextStations, { promoteId: 'id' });
    assert.equal(source.updateCalls.length, 1);
    assert.equal(source.setCalls.length, 0);
    assert.equal(source._data, nextStations);
    assert.deepEqual(source.updateCalls[0].update.map((item) => item.id), ['S1', 'S2']);
}

{
    const engine = createEngine(ObservableFakeMap);
    engine.addSource('stations-source', {
        type: 'geojson',
        data: nextStations
    });
    const source = engine.getSource('stations-source');

    engine.updateGeoJsonSourceData('stations-source', nextStations);
    assert.equal(source.setCalls.length, 1);
    assert.equal(source.updateCalls.length, 0);

    engine.getMap().emit('sourcedata', {
        sourceDataType: 'content',
        sourceId: 'stations-source'
    });
    engine.updateGeoJsonSourceData('stations-source', nextStations);
    assert.equal(source.setCalls.length, 1);
    assert.equal(source.updateCalls.length, 1);
}

{
    const makeStationsAtLongitude = (longitude) => ({
        type: 'FeatureCollection',
        features: [makeStationFeature('S1', [longitude, 35.1])]
    });
    const engine = createEngine(ObservableFakeMap);
    engine.addSource('stations-source', {
        type: 'geojson',
        data: makeStationsAtLongitude(139)
    });
    const source = engine.getSource('stations-source');

    engine.updateGeoJsonSourceDataLatest('stations-source', makeStationsAtLongitude(139.1));
    engine.updateGeoJsonSourceDataLatest('stations-source', makeStationsAtLongitude(139.2));
    assert.equal(source.setCalls.length, 0);
    assert.equal(source.updateCalls.length, 0);

    engine.getMap().emit('sourcedata', {
        sourceDataType: 'content',
        sourceId: 'stations-source'
    });
    assert.equal(source.updateCalls.length, 1);
    assert.deepEqual(source.updateCalls[0].update[0].newGeometry.coordinates, [139.2, 35.1]);

    engine.updateGeoJsonSourceDataLatest('stations-source', makeStationsAtLongitude(139.3));
    engine.updateGeoJsonSourceDataLatest('stations-source', makeStationsAtLongitude(139.4));
    engine.updateGeoJsonSourceDataLatest('stations-source', makeStationsAtLongitude(139.5));
    assert.equal(source.updateCalls.length, 1);

    engine.getMap().emit('sourcedata', {
        sourceDataType: 'content',
        sourceId: 'stations-source'
    });
    assert.equal(source.updateCalls.length, 2);
    assert.deepEqual(source.updateCalls[1].update[0].newGeometry.coordinates, [139.5, 35.1]);

    engine.getMap().emit('sourcedata', {
        sourceDataType: 'content',
        sourceId: 'stations-source'
    });
    assert.equal(source.updateCalls.length, 2);
}

{
    const engine = createEngine();
    engine.addSource('station-labels-source', {
        type: 'geojson',
        promoteId: 'id',
        data: { type: 'FeatureCollection', features: [] }
    });
    const source = engine.getSource('station-labels-source');
    source.updateData = () => {
        throw new Error('updateData unavailable for this source');
    };

    const fallbackLabels = {
        type: 'FeatureCollection',
        features: [makeStationFeature('S1', [139.1, 35.1], { name: '一号站' })]
    };
    engine.updateGeoJsonSourceData('station-labels-source', nextStations, {
        fallbackData: () => fallbackLabels,
        promoteId: 'id'
    });

    assert.equal(source.updateCalls.length, 0);
    assert.deepEqual(source.setCalls, [fallbackLabels]);
}

console.log('map engine geojson update smoke ok');
