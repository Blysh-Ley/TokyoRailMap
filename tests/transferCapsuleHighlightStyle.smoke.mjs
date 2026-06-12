import assert from 'node:assert/strict';

import { addTransferCapsuleLayers } from '../src/map/transfer-capsules.js';
import { ELEMENT_UI_CONSTANTS } from '../src/map/element_ui.js';
import { HIGHLIGHT_STYLE_CONFIG } from '../src/map/highlight_style_config.js';

const createMapStub = () => {
    const layers = new Map();
    const sources = new Map();
    return {
        layers,
        sources,
        addLayer(layer) {
            layers.set(layer.id, layer);
        },
        addSource(id, source) {
            sources.set(id, source);
        },
        getLayer(id) {
            return layers.get(id) || null;
        },
        getSource(id) {
            return sources.get(id) || null;
        },
        setPaintProperty(layerId, key, value) {
            const layer = layers.get(layerId);
            layer.paint[key] = value;
        },
        setSourceData(sourceId, data) {
            sources.get(sourceId).data = data;
        }
    };
};

const data = {
    lines: { type: 'FeatureCollection', features: [] },
    centroids: { type: 'FeatureCollection', features: [] },
    dots: { type: 'FeatureCollection', features: [] }
};

const normal = createMapStub();
addTransferCapsuleLayers(normal, data);

const highlighted = createMapStub();
addTransferCapsuleLayers(highlighted, data, { highlightStyle: true });

const normalWidth = normal.layers.get('transfer-capsule-outline-layer').paint['line-width'];
const highlightedWidth = highlighted.layers.get('transfer-capsule-outline-layer').paint['line-width'];
const highlightedInnerWidth = highlighted.layers.get('transfer-capsule-inner-layer').paint['line-width'];
const highlightedDotRadius = highlighted.layers.get('transfer-capsule-dot-layer').paint['circle-radius'];
const highlightedFallbackOutlineRadius = highlighted.layers.get('transfer-capsule-fallback-circle-outline-layer').paint['circle-radius'];
const highlightedFallbackInnerRadius = highlighted.layers.get('transfer-capsule-fallback-circle-inner-layer').paint['circle-radius'];

assert.equal(Array.isArray(normalWidth), true);
assert.equal(Array.isArray(highlightedWidth), true);
assert.equal(normalWidth[6], HIGHLIGHT_STYLE_CONFIG.transferCapsule.outlineLineWidth[0]);
assert.equal(normalWidth[8], HIGHLIGHT_STYLE_CONFIG.transferCapsule.outlineLineWidth[1]);
assert.equal(highlightedWidth[6], HIGHLIGHT_STYLE_CONFIG.transferCapsule.highlighted.outlineLineWidth[0]);
assert.equal(highlightedWidth[8], HIGHLIGHT_STYLE_CONFIG.transferCapsule.highlighted.outlineLineWidth[1]);
assert.equal(highlightedInnerWidth[6], HIGHLIGHT_STYLE_CONFIG.transferCapsule.highlighted.innerLineWidth[0]);
assert.equal(highlightedInnerWidth[8], HIGHLIGHT_STYLE_CONFIG.transferCapsule.highlighted.innerLineWidth[1]);
assert.equal(highlightedDotRadius[6], ELEMENT_UI_CONSTANTS.stationBaseRadius);
assert.equal(highlightedDotRadius[8], ELEMENT_UI_CONSTANTS.stationBaseRadiusAtMaxZoom);
assert.equal(highlightedDotRadius[6] < highlightedFallbackInnerRadius[6], true);
assert.equal(highlightedDotRadius[8] < highlightedFallbackInnerRadius[8], true);
assert.equal(highlightedWidth[6] >= highlightedFallbackOutlineRadius[6] * 2, true);
assert.equal(highlightedWidth[8] >= highlightedFallbackOutlineRadius[8] * 2, true);

console.log('transfer capsule highlight style smoke ok');
