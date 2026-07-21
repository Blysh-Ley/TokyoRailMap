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
    getActiveBasemapSource: () => options.activeBasemapSource || null,
    getOnlineBasemapStyle: () => options.onlineBasemapStyle || null,
    getStyle: (styleOptions) => ({ version: 8, options, styleOptions }),
    setPmtilesAvailable: (available) => {
        options.pmtilesAvailable = available === true;
        calls.push(['setPmtilesAvailable', options.pmtilesAvailable]);
    },
    setActiveBasemapSource: (sourceKind) => {
        options.activeBasemapSource = sourceKind || 'none';
        calls.push(['setActiveBasemapSource', options.activeBasemapSource]);
        return options.activeBasemapSource;
    },
    setOnlineBasemapStyle: (descriptor) => {
        options.onlineBasemapStyle = descriptor || null;
        calls.push(['setOnlineBasemapStyle', descriptor?.styleUrl || null]);
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
    let verifyCalled = false;
    let loadedStyle = null;
    const runtime = createBasemapThemeRuntime({
        map: { loaded: () => true },
        mapEngine: { id: 'engine' },
        createBasemapController: createControllerFactory(calls),
        documentRef: createDocument(),
        windowRef: {},
        readAppearanceMode: () => 'light',
        readBasemapMode: () => 'osm-white',
        readBasemapRuntimeConfig: () => ({
            basemapSource: 'openfreemap',
            pmtilesUrl: './tiles/kanto.pmtiles'
        }),
        verifyOsmBasemapArchive: async () => {
            verifyCalled = true;
            return true;
        },
        loadOpenFreeMapBasemapStyle: async ({ mode, theme }) => {
            loadedStyle = { mode, theme };
            return {
                styleUrl: 'https://tiles.openfreemap.org/styles/positron',
                style: { version: 8 },
                sourceIds: [],
                layerIds: []
            };
        },
        archiveRetryDelays: [],
        resolveThemeFromAppearance: () => 'light'
    });

    await runtime.whenBasemapValidated();
    assert.equal(verifyCalled, false);
    assert.deepEqual(loadedStyle, { mode: 'osm-white', theme: 'light' });
    assert.equal(runtime.getBasemapSourceKind(), 'openfreemap');
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'openfreemap'));
    assert.ok(calls.some(([name, url]) => name === 'setOnlineBasemapStyle' && /openfreemap/.test(url)));
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
        readBasemapMode: () => 'osm-white',
        readBasemapRuntimeConfig: () => ({ pmtilesAvailable: true, pmtilesUrl: './tiles/kanto.pmtiles' }),
        verifyOsmBasemapArchive: async () => true,
        archiveRetryDelays: [],
        resolveThemeFromAppearance: (mode) => (mode === 'system' ? 'dark' : 'light')
    });

    await runtime.whenBasemapValidated();
    calls.length = 0;
    events.length = 0;

    assert.equal(typeof mediaCallback, 'function');
    assert.equal(runtime.applyBasemapTheme('dark'), 'dark');
    assert.deepEqual(calls.slice(0, 2), [
        ['ensureLayers'],
        ['setMode', 'osm-white', 'dark']
    ]);
    assert.deepEqual(events, ['__TokyoRailThemeChanged']);

    calls.length = 0;
    assert.equal(runtime.setBasemapMode('transparent'), 'transparent');
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'none'));
    assert.ok(calls.some(([name, mode, theme]) => name === 'setMode' && mode === 'transparent' && theme === 'dark'));

    calls.length = 0;
    assert.equal(runtime.setBasemapMode('invalid'), 'osm-white');
    assert.ok(calls.some(([name, value]) => name === 'setPmtilesAvailable' && value === true));
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'pmtiles'));
    assert.ok(calls.some(([name, mode, theme]) => name === 'setMode' && mode === 'osm-white' && theme === 'dark'));

    assert.equal(runtime.syncSystemAppearanceTheme(), false);
    appearanceMode = 'system';
    mediaCallback();
    assert.equal(documentRef.documentElement.getAttribute('data-theme'), 'dark');
    assert.equal(runtime.getTheme(), 'dark');
}

{
    const calls = [];
    const cameraCalls = [];
    const loadedStyles = [];
    const runtime = createBasemapThemeRuntime({
        map: { loaded: () => true },
        mapEngine: {
            getPitch: () => 0,
            getBearing: () => 0,
            easeTo: (options) => cameraCalls.push(options)
        },
        createBasemapController: createControllerFactory(calls),
        documentRef: createDocument(),
        windowRef: {},
        readAppearanceMode: () => 'light',
        readBasemapMode: () => 'osm-detailed',
        readBasemapRuntimeConfig: () => ({
            basemapSource: 'pmtiles',
            pmtilesAvailable: true,
            pmtilesUrl: './tiles/kanto.pmtiles'
        }),
        verifyOsmBasemapArchive: async () => true,
        loadOpenFreeMapBasemapStyle: async ({ mode, theme }) => {
            loadedStyles.push({ mode, theme });
            return {
                styleUrl: mode === 'osm-3d'
                    ? 'https://tiles.openfreemap.org/styles/liberty'
                    : 'https://tiles.openfreemap.org/styles/bright',
                style: { version: 8 },
                sourceIds: [],
                layerIds: []
            };
        },
        archiveRetryDelays: [],
        resolveThemeFromAppearance: () => 'light'
    });

    await runtime.whenBasemapValidated();
    assert.deepEqual(loadedStyles.at(-1), { mode: 'osm-detailed', theme: 'light' });
    assert.equal(runtime.getBasemapSourceKind(), 'openfreemap');
    assert.ok(calls.some(([name, value]) => name === 'setPmtilesAvailable' && value === true));
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'openfreemap'));
    assert.equal(calls.some(([name, value]) => name === 'setPmtilesAvailable' && value === false), false);

    calls.length = 0;
    assert.equal(runtime.setBasemapMode('osm-3d'), 'osm-3d');
    await Promise.resolve();
    assert.deepEqual(loadedStyles.at(-1), { mode: 'osm-3d', theme: 'light' });
    assert.ok(calls.some(([name, url]) => name === 'setOnlineBasemapStyle' && /liberty/.test(url)));
    assert.ok(cameraCalls.some((options) => options.pitch === 60 && options.bearing === 35));

    calls.length = 0;
    assert.equal(runtime.setBasemapMode('osm-white'), 'osm-white');
    assert.equal(runtime.getBasemapSourceKind(), 'pmtiles');
    assert.ok(calls.some(([name, value]) => name === 'setOnlineBasemapStyle' && value === null));
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'pmtiles'));
    assert.equal(calls.some(([name, value]) => name === 'setPmtilesAvailable' && value === false), false);
}

{
    const calls = [];
    let verifyCount = 0;
    const runtime = createBasemapThemeRuntime({
        map: { loaded: () => true },
        mapEngine: { id: 'engine' },
        createBasemapController: createControllerFactory(calls),
        documentRef: createDocument(),
        windowRef: {},
        readAppearanceMode: () => 'light',
        readBasemapMode: () => 'transparent',
        readBasemapRuntimeConfig: () => ({
            basemapSource: 'pmtiles',
            pmtilesUrl: './tiles/kanto.pmtiles'
        }),
        verifyOsmBasemapArchive: async () => {
            verifyCount += 1;
            return verifyCount > 1;
        },
        archiveRetryDelays: [],
        resolveThemeFromAppearance: () => 'light'
    });

    await runtime.whenBasemapValidated();
    assert.equal(verifyCount, 1);
    calls.length = 0;

    assert.equal(runtime.setBasemapMode('osm-white'), 'osm-white');
    await Promise.resolve();
    assert.equal(verifyCount, 2);
    assert.equal(runtime.getBasemapSourceKind(), 'pmtiles');
    assert.ok(calls.some(([name, value]) => name === 'setPmtilesAvailable' && value === true));
    assert.ok(calls.some(([name, value]) => name === 'setActiveBasemapSource' && value === 'pmtiles'));
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
