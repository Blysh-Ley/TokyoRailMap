import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMobileStartupSplashRuntime } from '../src/app/mobileStartupSplashRuntime.js';

{
    const calls = [];
    const runtime = createMobileStartupSplashRuntime({
        mapEngine: {},
        splashView: {
            setEnabled: (enabled) => calls.push(['enabled', enabled]),
            dismiss: () => calls.push(['dismiss'])
        },
        isEnabled: () => false,
        minVisibleMs: 0
    });

    await runtime.waitForBasemapThenDismiss();
    assert.deepEqual(calls, [['enabled', false], ['dismiss']]);
}

{
    const calls = [];
    const runtime = createMobileStartupSplashRuntime({
        mapEngine: {
            isLoaded: () => true,
            areTilesLoaded: () => true
        },
        splashView: {
            setEnabled: (enabled) => calls.push(['enabled', enabled]),
            dismiss: () => calls.push(['dismiss'])
        },
        isEnabled: () => true,
        minVisibleMs: 0
    });

    await runtime.waitForBasemapThenDismiss();
    assert.deepEqual(calls, [['enabled', true], ['dismiss']]);
}

const htmlSource = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
assert.match(htmlSource, /id="mobile-startup-splash"/);
assert.match(htmlSource, /data-native-platform/);
assert.match(htmlSource, /tokyorail\.appearance\.mode/);

const cssSource = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8');
assert.match(cssSource, /prefers-color-scheme:\s*dark/);
assert.match(cssSource, /html\[data-native-platform='ios'\]\s+\.mobile-startup-splash/);
assert.match(cssSource, /html\[data-theme='dark'\]\s+\.mobile-startup-splash-icon\s*\{[\s\S]*filter:\s*invert\(1\)/);

console.log('mobile startup splash runtime smoke ok');
