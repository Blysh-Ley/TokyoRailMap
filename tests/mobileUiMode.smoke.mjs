import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMobileUiModeController, isMobileViewport } from '../src/ui/mobileUiMode.js';

const createWindow = ({ width, matches = {} }) => {
    const listeners = new Map();
    return {
        innerWidth: width,
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type) => listeners.delete(type),
        matchMedia: (query) => ({
            matches: matches[query] === true,
            addEventListener: () => {},
            removeEventListener: () => {}
        })
    };
};

assert.equal(isMobileViewport(createWindow({ width: 430 })), true);
assert.equal(isMobileViewport(createWindow({ width: 1180 })), false);
assert.equal(isMobileViewport(createWindow({
    width: 820,
    matches: {
        '(pointer: coarse)': true,
        '(max-width: 900px)': true
    }
})), true);

const doc = {
    documentElement: { dataset: {} },
    body: { dataset: {} }
};
const controller = createMobileUiModeController({
    doc,
    win: createWindow({ width: 430 })
});
assert.equal(controller.isMobile(), true);
assert.equal(doc.documentElement.dataset.mobileUi, '1');
assert.equal(doc.body.dataset.mobileUi, '1');
controller.destroy();

const appSource = readFileSync(join(process.cwd(), 'src/app.js'), 'utf8');
assert.match(appSource, /createMobileUiModeController/);
assert.match(appSource, /panelPresentation:\s*isMobileUiMode\(\)\s*\?\s*'mobile'\s*:\s*'desktop'/);
assert.match(appSource, /if\s*\(!isMobileUiMode\(\)\)\s*\{\s*menu = new Menu/);

const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.settings-top-timebar/);
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.RW-wrapper/);
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.export-ui/);
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.ms-ui/);
assert.match(cssSource, /data-mobile-ui='1'[\s\S]*\.fullscreen-fab/);

console.log('mobile UI mode smoke ok');
