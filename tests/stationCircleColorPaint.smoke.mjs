import assert from 'node:assert/strict';

import {
    buildDynamicLineWidthExpr,
    buildFocusedLinePaint,
    buildStationCircleColorPaintExpr,
    buildStationSelectionPaint,
    ELEMENT_UI_CONSTANTS,
    tripPreviewLineLayerPaint
} from '../src/map/element_ui.js';
import { HIGHLIGHT_STYLE_CONFIG } from '../src/map/highlight_style_config.js';

const expr = buildStationCircleColorPaintExpr({
    isDarkThemeActive: false,
    lineColorById: new Map([
        ['JR-East.Takasaki', '#f68b1e']
    ]),
    overrideColorByStationId: new Map([
        ['JR-East.Takasaki.Omiya', '#e21f26']
    ])
});

assert.deepEqual(expr.slice(0, 3), ['match', ['get', 'id'], 'JR-East.Takasaki.Omiya']);
assert.equal(expr[3], '#e21f26');
assert.ok(Array.isArray(expr.at(-1)));

const focusedLinePaint = buildFocusedLinePaint({
    focusExpr: ['==', ['get', 'id'], 'L1'],
    highlightStyle: true
});
assert.equal(Array.isArray(focusedLinePaint['line-width']), true);
assert.equal(focusedLinePaint['line-width'][0], 'case');
assert.equal(focusedLinePaint['line-width'][2][4] > 0, true);
assert.equal(focusedLinePaint['line-width'][2][6], HIGHLIGHT_STYLE_CONFIG.line.widthAtBaseZoom);
assert.equal(focusedLinePaint['line-width'][2][8], HIGHLIGHT_STYLE_CONFIG.line.widthAtMaxZoom);

const normalFocusedLinePaint = buildFocusedLinePaint({
    focusExpr: ['==', ['get', 'id'], 'L1']
});
assert.equal(normalFocusedLinePaint['line-width'][6][2], ELEMENT_UI_CONSTANTS.lineBaseWidth);
assert.equal(normalFocusedLinePaint['line-width'][8][2], ELEMENT_UI_CONSTANTS.lineBaseWidthAtMaxZoom);

const previewLinePaint = tripPreviewLineLayerPaint({ highlightStyle: true });
const normalPreviewLinePaint = tripPreviewLineLayerPaint();
assert.equal(previewLinePaint['line-width'][6], HIGHLIGHT_STYLE_CONFIG.line.widthAtBaseZoom);
assert.equal(previewLinePaint['line-width'][8], HIGHLIGHT_STYLE_CONFIG.line.widthAtMaxZoom);
assert.equal(normalPreviewLinePaint['line-width'][6], ELEMENT_UI_CONSTANTS.lineBaseWidth);
assert.equal(normalPreviewLinePaint['line-width'][8], ELEMENT_UI_CONSTANTS.lineBaseWidthAtMaxZoom);

const normalDynamicLineWidth = buildDynamicLineWidthExpr();
const highlightedDynamicLineWidth = buildDynamicLineWidthExpr({ highlightStyle: true });
assert.equal(normalDynamicLineWidth[4], 0.8);
assert.equal(normalDynamicLineWidth[8], ELEMENT_UI_CONSTANTS.lineBaseWidth);
assert.equal(normalDynamicLineWidth[10], ELEMENT_UI_CONSTANTS.lineBaseWidthAtMaxZoom);
assert.equal(highlightedDynamicLineWidth[4], HIGHLIGHT_STYLE_CONFIG.line.minWidthAtLowZoom);
assert.equal(highlightedDynamicLineWidth[8], HIGHLIGHT_STYLE_CONFIG.line.widthAtBaseZoom);
assert.equal(highlightedDynamicLineWidth[10], HIGHLIGHT_STYLE_CONFIG.line.widthAtMaxZoom);

const stationPaint = buildStationSelectionPaint({
    isSelectedExpr: ['==', ['get', 'id'], 'S1'],
    highlightStyle: true
});
const normalStationPaint = buildStationSelectionPaint({
    isSelectedExpr: ['==', ['get', 'id'], 'S1']
});
assert.equal(stationPaint['circle-radius'][4], normalStationPaint['circle-radius'][4] * HIGHLIGHT_STYLE_CONFIG.lineAndStation.minScaleAtZoom0);
assert.equal(stationPaint['circle-radius'][6], normalStationPaint['circle-radius'][6]);
assert.equal(stationPaint['circle-radius'][8], normalStationPaint['circle-radius'][8]);

console.log('station circle color paint smoke ok');
