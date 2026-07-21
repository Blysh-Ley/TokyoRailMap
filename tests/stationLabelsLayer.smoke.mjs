import assert from 'node:assert/strict';
import {
    STATION_LABELS_LAYER_ID,
    STATION_LABELS_SOURCE_ID,
    addStationLabelsLayer
} from '../src/map/layers.js';
import { buildStationLabelGeoJSON, createStationMarkers } from '../src/map/labels.js';

const stationsData = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            id: 'S1',
            properties: {
                id: 'S1',
                name: 'Station One',
                name_zh: '一号站',
                platform_line_id: ['L1'],
                serving_ids: ['L1', 'L2'],
                hidden_by_opacity_zero: 0
            },
            geometry: { type: 'Point', coordinates: [139.1, 35.1] }
        },
        {
            type: 'Feature',
            id: 'S2',
            properties: {
                id: 'S2',
                name: 'Station Two',
                platform_line_id: ['L2'],
                serving_ids: ['L2'],
                hidden_by_opacity_zero: 1
            },
            geometry: { type: 'Point', coordinates: [139.2, 35.2] }
        }
    ]
};

const labelData = buildStationLabelGeoJSON(stationsData);
assert.equal(labelData.type, 'FeatureCollection');
assert.equal(labelData.features.length, 2);
assert.equal(labelData.features[0].id, 'S1');
assert.equal(labelData.features[0].properties.name, '一号站');
assert.equal(labelData.features[0].properties.priority, 2);
assert.deepEqual(labelData.features[0].properties.platform_line_id, ['L1']);
assert.equal(labelData.features[1].properties.hidden_by_opacity_zero, 1);

const sources = new Map();
const layers = new Map();
const engine = {
    on: () => {},
    createPopup: () => ({}),
    getSource: (sourceId) => sources.get(sourceId),
    addSource: (sourceId, source) => sources.set(sourceId, source),
    hasLayer: (layerId) => layers.has(layerId),
    addLayer: (layer, beforeLayerId) => layers.set(layer.id, { layer, beforeLayerId })
};

addStationLabelsLayer(engine, labelData);
assert.equal(sources.get(STATION_LABELS_SOURCE_ID).data, labelData);
const layerEntry = layers.get(STATION_LABELS_LAYER_ID);
assert.equal(layerEntry.layer.type, 'symbol');
assert.equal(layerEntry.layer.source, STATION_LABELS_SOURCE_ID);
assert.equal(layerEntry.layer.layout['symbol-placement'], 'point');
assert.deepEqual(layerEntry.layer.layout['text-field'], ['get', 'name']);
assert.equal(layerEntry.layer.layout['icon-image'], 'station-label-bg-light');
assert.equal(layerEntry.layer.layout['icon-text-fit'], 'both');
assert.deepEqual(layerEntry.layer.layout['icon-text-fit-padding'], [0, 2, 0, 2]);
assert.equal(layerEntry.layer.layout['text-size'], 12);
assert.equal(layerEntry.layer.layout['text-allow-overlap'], false);
assert.equal(layerEntry.layer.paint['text-halo-width'], 0.3);

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.className = '';
        this.textContent = '';
        this.style = {};
    }
}

globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName)
};

let markerCreated = 0;
let markerRemoved = 0;
const markerEngine = {
    createMarker: ({ element }) => {
        markerCreated += 1;
        return {
            element,
            setLngLat(coordinates) {
                this.coordinates = coordinates;
                return this;
            },
            remove() {
                markerRemoved += 1;
            }
        };
    },
    addMarker: () => {}
};

const lazyMarkers = createStationMarkers(markerEngine, stationsData, { attachMarkers: false });
assert.equal(lazyMarkers.stationLabels.length, 2);
assert.equal(markerCreated, 0);
lazyMarkers.stationLabels[0].ensureMarker();
assert.equal(markerCreated, 1);
lazyMarkers.stationLabels[0].removeMarker();
assert.equal(markerRemoved, 1);

console.log('station labels layer smoke ok');
