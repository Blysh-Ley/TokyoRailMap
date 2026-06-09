import assert from 'node:assert/strict';

import {
    panelAdjustColorForDarkThemeIfNeeded,
    panelIsDarkThemeActive,
    panelParseCssColorToRgb,
    panelRelativeLuminance,
    panelRgbToHex,
    resolvePanelBadgeTextColor,
    resolveTrainTypeColorForTheme
} from '../src/features/panel/panelThemeHelpers.js';

assert.deepEqual(panelParseCssColorToRgb('#05a'), { r: 0, g: 85, b: 170 });
assert.deepEqual(panelParseCssColorToRgb('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3 });
assert.equal(panelParseCssColorToRgb('bad'), null);

assert.equal(panelRgbToHex({ r: 0, g: 85, b: 170 }), '#0055aa');
assert.ok(panelRelativeLuminance({ r: 255, g: 255, b: 255 }) > panelRelativeLuminance({ r: 0, g: 0, b: 0 }));

assert.equal(
    panelIsDarkThemeActive({
        documentRef: {
            documentElement: {
                getAttribute: () => 'dark'
            }
        }
    }),
    true
);

assert.equal(
    resolveTrainTypeColorForTheme('#005AAA', { isDarkTheme: false }),
    '#005AAA'
);
assert.equal(
    panelAdjustColorForDarkThemeIfNeeded('#003366'),
    '#ffcc99'
);
assert.equal(
    resolveTrainTypeColorForTheme('#003366', { isDarkTheme: true }),
    '#ffcc99'
);

assert.equal(resolvePanelBadgeTextColor('#ffffff'), '#111');
assert.equal(resolvePanelBadgeTextColor('#000000'), '#fff');

console.log('panel theme helpers smoke ok');
