import assert from 'node:assert/strict';

import { buildStationCircleColorPaintExpr } from '../src/map/element_ui.js';

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

console.log('station circle color paint smoke ok');
