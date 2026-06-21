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
    getAttributionItems: () => [{ label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' }],
    getPmtilesAvailable: () => options.pmtilesAvailable === true,
    getStyle: (styleOptions) => ({ version: 8, options, styleOptions }),
    setPmtilesAvailable: (available) => {
        options.pmtilesAvailable = available === true;
        calls.push(['setPmtilesAvailable', options.pmtilesAvailable]);
    },
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
        readBasemapRuntimeConfig: () => ({ pmtilesUrl: './tiles/kanto.pmtiles' }),
        verifyOsmBasemapArchive: async () => false,
        archiveRetryDelays: [],
        resolveThemeFromAppearance: () => 'dark'
    });

    assert.equal(documentRef.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(runtime.getTheme(), 'dark');
    assert.equal(runtime.getMode(), 'osm-white');
    assert.equal(calls.length, 0);
    assert.equal(runtime.getExportStyle().options.pmtilesUrl, './tiles/kanto.pmtiles');
    assert.deepEqual(runtime.getMapAttributionItems(), [
        { label: 'OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' }
    ]);
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
        readBasemapMode: () => 'osm-detailed',
        readBasemapRuntimeConfig: () => ({ pmtilesAvailable: true, pmtilesUrl: './tiles/kanto.pmtiles' }),
        verifyOsmBasemapArchive: async () => true,
        archiveRetryDelays: [],
        resolveThemeFromAppearance: (mode) => (mode === 'system' ? 'dark' : 'light')
    });

    assert.equal(typeof mediaCallback, 'function');
    assert.equal(runtime.applyBasemapTheme('dark'), 'dark');
    assert.deepEqual(calls.slice(0, 2), [
        ['ensureLayers'],
        ['setMode', 'osm-detailed', 'dark']
    ]);
    assert.deepEqual(events, ['__TokyoRailThemeChanged']);

    assert.equal(runtime.setBasemapMode('transparent'), 'transparent');
    assert.deepEqual(calls.slice(2, 4), [
        ['ensureLayers'],
        ['setMode', 'transparent', 'dark']
    ]);

    assert.equal(runtime.setBasemapMode('invalid'), 'osm-white');
    assert.deepEqual(calls.slice(4, 6), [
        ['ensureLayers'],
        ['setMode', 'osm-white', 'dark']
    ]);

    assert.equal(runtime.syncSystemAppearanceTheme(), false);
    appearanceMode = 'system';
    mediaCallback();
    assert.equal(documentRef.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(runtime.getTheme(), 'dark');
}

{
    const calls = [];
    const timers = [];
    let verifyCount = 0;
    createBasemapThemeRuntime({
        map: { loaded: () => true },
        mapEngine: { id: 'engine' },
        createBasemapController: createControllerFactory(calls),
        documentRef: createDocument(),
        windowRef: {
            setTimeout: (callback, delay) => {
                timers.push([callback, delay]);
                return timers.length;
            }
        },
        readAppearanceMode: () => 'light',
        readBasemapMode: () => 'osm-white',
        readBasemapRuntimeConfig: () => ({ pmtilesUrl: './tiles/kanto.pmtiles' }),
        verifyOsmBasemapArchive: async () => {
            verifyCount += 1;
            return verifyCount > 1;
        },
        archiveRetryDelays: [25],
        resolveThemeFromAppearance: () => 'light'
    });

    await Promise.resolve();
    assert.equal(verifyCount, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0][1], 25);
    timers[0][0]();
    await Promise.resolve();
    assert.equal(verifyCount, 2);
    assert.ok(calls.some(([name, available]) => name === 'setPmtilesAvailable' && available === true));
    assert.ok(calls.some(([name]) => name === 'ensureLayers'));
}

console.log('app basemap theme runtime smoke ok');
