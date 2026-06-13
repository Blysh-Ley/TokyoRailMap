import assert from 'node:assert/strict';

import { addTransferCapsuleLayers } from '../src/map/transfer-capsules.js';
import { buildDynamicLineWidthExpr, ELEMENT_UI_CONSTANTS } from '../src/map/element_ui.js';
import { HIGHLIGHT_STYLE_CONFIG } from '../src/map/highlight_style_config.js';

const getZoomStopValue = (expr, zoom) => {
    for (let i = 3; i < expr.length; i += 2) {
        if (expr[i] === zoom) return expr[i + 1];
    }
    return undefined;
};

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
const highlightedLineWidth = buildDynamicLineWidthExpr({ highlightStyle: true });

assert.equal(Array.isArray(normalWidth), true);
assert.equal(Array.isArray(highlightedWidth), true);
assert.equal(HIGHLIGHT_STYLE_CONFIG.transferCapsule, undefined);
assert.equal(getZoomStopValue(normalWidth, 12), 12);
assert.equal(getZoomStopValue(normalWidth, 16), 24);
assert.equal(getZoomStopValue(highlightedWidth, 12), getZoomStopValue(highlightedLineWidth, 12) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleOutlineLineWidthScale);
assert.equal(getZoomStopValue(highlightedWidth, 16), getZoomStopValue(highlightedLineWidth, 16) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleOutlineLineWidthScale);
assert.equal(getZoomStopValue(highlightedInnerWidth, 12), getZoomStopValue(highlightedLineWidth, 12) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleInnerLineWidthScale);
assert.equal(getZoomStopValue(highlightedInnerWidth, 16), getZoomStopValue(highlightedLineWidth, 16) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleInnerLineWidthScale);
assert.equal(getZoomStopValue(highlightedDotRadius, HIGHLIGHT_STYLE_CONFIG.line.shrinkStartZoom), getZoomStopValue(highlightedLineWidth, HIGHLIGHT_STYLE_CONFIG.line.shrinkStartZoom) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleDotRadiusScale);
assert.equal(getZoomStopValue(highlightedDotRadius, 12), getZoomStopValue(highlightedLineWidth, 12) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleDotRadiusScale);
assert.equal(getZoomStopValue(highlightedDotRadius, 16), getZoomStopValue(highlightedLineWidth, 16) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleDotRadiusScale);
assert.equal(getZoomStopValue(highlightedDotRadius, 12) < getZoomStopValue(highlightedFallbackInnerRadius, 12), true);
assert.equal(getZoomStopValue(highlightedDotRadius, 16) < getZoomStopValue(highlightedFallbackInnerRadius, 16), true);
assert.equal(getZoomStopValue(highlightedWidth, 12) >= getZoomStopValue(highlightedFallbackOutlineRadius, 12) * 2, true);
assert.equal(getZoomStopValue(highlightedWidth, 16) >= getZoomStopValue(highlightedFallbackOutlineRadius, 16) * 2, true);
assert.equal(getZoomStopValue(highlightedFallbackOutlineRadius, 12), getZoomStopValue(highlightedLineWidth, 12) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleFallbackOutlineRadiusScale);
assert.equal(getZoomStopValue(highlightedFallbackInnerRadius, 12), getZoomStopValue(highlightedLineWidth, 12) * HIGHLIGHT_STYLE_CONFIG.lineBasedSizes.capsuleFallbackInnerRadiusScale);
assert.equal(getZoomStopValue(normal.layers.get('transfer-capsule-dot-layer').paint['circle-radius'], 12), ELEMENT_UI_CONSTANTS.stationBaseRadius);

console.log('transfer capsule highlight style smoke ok');
