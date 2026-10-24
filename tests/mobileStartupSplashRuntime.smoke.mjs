import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createMobileStartupSplashRuntime } from '../src/app/mobileStartupSplashRuntime.js';

const createMapEngine = () => {
    const listeners = new Map();
    const loadedSources = new Set();
    const sources = new Set(['lines', 'stations', 'labels', 'basemap']);
    return {
        loadedSources,
        sources,
        getSource: (id) => sources.has(id) ? {} : null,
        isSourceLoaded: (id) => loadedSources.has(id),
        on: (name, listener) => listeners.set(name, listener),
        off: (name, listener) => {
            if (listeners.get(name) === listener) listeners.delete(name);
        },
        emit: (name) => listeners.get(name)?.(),
        requestRender() { this.emit('render'); },
        listenerCount: () => listeners.size,
        isLoaded: () => false,
        areTilesLoaded: () => false
    };
};

{
    const calls = [];
    const runtime = createMobileStartupSplashRuntime({
        mapEngine: {},
        splashView: {
            setEnabled: (enabled) => calls.push(['enabled', enabled]),
            dismiss: () => calls.push(['dismiss'])
        },
        isEnabled: () => false
    });

    await runtime.waitForMapThenDismiss([]);
    assert.deepEqual(calls, [['enabled', false], ['dismiss']]);
}

{
    const calls = [];
    const mapEngine = createMapEngine();
    const runtime = createMobileStartupSplashRuntime({
        mapEngine,
        splashView: {
            setEnabled: (enabled) => calls.push(['enabled', enabled]),
            dismiss: () => calls.push(['dismiss'])
        },
        isEnabled: () => true
    });

    const waiting = runtime.waitForMapThenDismiss(['lines', 'stations', 'labels', 'basemap']);
    mapEngine.loadedSources.add('lines').add('stations').add('basemap');
    mapEngine.emit('render');
    mapEngine.emit('idle');
    mapEngine.emit('error');
    await Promise.resolve();
    assert.deepEqual(calls, [['enabled', true]], '站名尚未完成时，无关空闲或错误不能提前关闭');

    mapEngine.loadedSources.add('labels');
    await Promise.resolve();
    assert.deepEqual(calls, [['enabled', true]], '源就绪后仍需等待绘制帧');
    mapEngine.emit('render');
    await waiting;
    assert.deepEqual(calls, [['enabled', true], ['dismiss']]);
    assert.equal(mapEngine.isLoaded(), false, '后台源仍在加载时可以进入主页面');
    assert.equal(mapEngine.listenerCount(), 0);
    assert.equal(await runtime.dismiss(), false, '遮罩只关闭一次');
}

{
    const mapEngine = createMapEngine();
    mapEngine.loadedSources.add('lines');
    let dismissed = false;
    const runtime = createMobileStartupSplashRuntime({
        mapEngine,
        splashView: { dismiss: () => { dismissed = true; } },
        isEnabled: () => true
    });
    await runtime.waitForMapThenDismiss(['lines']);
    assert.equal(dismissed, true, '已就绪的源主动请求绘制，不额外等待 idle 或最短动画时间');
    assert.equal(mapEngine.listenerCount(), 0);
}

{
    const mapEngine = createMapEngine();
    let dismissed = false;
    const runtime = createMobileStartupSplashRuntime({
        mapEngine,
        splashView: { dismiss: () => { dismissed = true; } },
        isEnabled: () => true,
        waitTimeoutMs: 10
    });
    const waiting = runtime.waitForMapThenDismiss(['missing-source']);
    assert.equal(dismissed, false);
    await waiting;
    assert.equal(dismissed, true, '核心源失败时保留超时退出，不永久遮挡');
    assert.equal(mapEngine.listenerCount(), 0);
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
