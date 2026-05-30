import assert from 'node:assert/strict';

import { createBasemapThemeRuntime } from '../src/app/basemapThemeRuntime.js';

const createDocument = () => {
    const attrs = new Map();
    return {
        documentElement: {
            setAttribute: (name, value) => attrs.set(name, value),
            getAttribute: (name) => attrs.get(name) ?? null
        }
    };
};

const createControllerFactory = (calls) => (options) => ({
    options,
    ensureLayers: () => calls.push(['ensureLayers']),
    setMode: (mode, theme) => {
        calls.push(['setMode', mode, theme]);
        options.onThemeChanged?.({ mode, theme });
    }
});

{
    const calls = [];
    const documentRef = createDocument();
    const map = { loaded: () => false, isStyleLoaded: () => false };
    const runtime = createBasemapThemeRuntime({
        map,
        mapEngine: { id: 'engine' },
        createBasemapController: createControllerFactory(calls),
        documentRef,
        windowRef: {},
        readAppearanceMode: () => 'dark',
        readBasemapMode: () => 'ost',
        resolveThemeFromAppearance: () => 'dark'
    });

    assert.equal(documentRef.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(runtime.getTheme(), 'dark');
    assert.equal(runtime.getMode(), 'ost');
    assert.equal(runtime.applyBasemapTheme('light'), 'light');
    assert.equal(runtime.ensureBasemapLayers(), false);
    assert.deepEqual(calls, []);
}

{
    const calls = [];
    const events = [];
    let mediaCallback = null;
    let appearanceMode = 'light';
    const documentRef = createDocument();
    const map = { loaded: () => true };
    const runtime = createBasemapThemeRuntime({
        map,
        mapEngine: { id: 'engine' },
        createBasemapController: createControllerFactory(calls),
        documentRef,
        windowRef: {
            Event,
            dispatchEvent: (event) => events.push(event.type),
            matchMedia: () => ({
                addEventListener: (eventName, callback) => {
                    assert.equal(eventName, 'change');
                    mediaCallback = callback;
                }
            })
        },
        readAppearanceMode: () => appearanceMode,
        readBasemapMode: () => 'carto',
        resolveThemeFromAppearance: (mode) => (mode === 'system' ? 'dark' : 'light')
    });

    assert.equal(typeof mediaCallback, 'function');
    assert.equal(runtime.applyBasemapTheme('dark'), 'dark');
    assert.deepEqual(calls.slice(0, 2), [
        ['ensureLayers'],
        ['setMode', 'carto', 'dark']
    ]);
    assert.deepEqual(events, ['__TokyoRailThemeChanged']);

    assert.equal(runtime.setBasemapMode('transparent'), 'transparent');
    assert.deepEqual(calls.slice(2, 4), [
        ['ensureLayers'],
        ['setMode', 'transparent', 'dark']
    ]);

    assert.equal(runtime.setBasemapMode('invalid'), 'carto');
    assert.deepEqual(calls.slice(4, 6), [
        ['ensureLayers'],
        ['setMode', 'carto', 'dark']
    ]);

    assert.equal(runtime.syncSystemAppearanceTheme(), false);
    appearanceMode = 'system';
    mediaCallback();
    assert.equal(documentRef.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(runtime.getTheme(), 'dark');
}

console.log('app basemap theme runtime smoke ok');
