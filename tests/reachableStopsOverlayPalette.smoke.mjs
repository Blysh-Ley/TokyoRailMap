import assert from 'node:assert/strict';

import {
    REACHABLE_STOPS_COLOR_STOPS,
    REACHABLE_STOPS_PALETTES,
    createReachableStopsColorExpression,
    getReachableStopsStrokeColor
} from '../src/features/search/reachableStopsPalette.js';
import { createReachableStopsOverlayRenderer } from '../src/features/search/reachableStopsOverlayRenderer.js';
import {
    buildReachableStopsOverlayGeoJSON,
    createTravelSearchMapRuntime
} from '../src/features/search/reachableStopsRuntime.js';

const EXPECTED_STOPS = [1, 18, 36, 72, 144, 288, 576, 1152, 2304, 3200];
const EXPECTED_LIGHT = [
    '#FFEE99', '#FFE08A', '#FFCF75', '#FFBA66', '#FFA557',
    '#FF8742', '#FF6D33', '#FF4C24', '#FF270F', '#FF0000'
];
const EXPECTED_DARK = [
    '#FFEE99', '#FFE08A', '#FFCF75', '#FFBA66', '#FFA557',
    '#FF8742', '#FF6D33', '#FF4C24', '#FF270F', '#FF0000'
];

const hexToLab = (hex) => {
    const rgb = String(hex).slice(1).match(/.{2}/g).map((part) => Number.parseInt(part, 16) / 255);
    const linear = rgb.map((value) => (
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    const [red, green, blue] = linear;
    const xyz = [
        (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047,
        red * 0.2126729 + green * 0.7151522 + blue * 0.072175,
        (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883
    ];
    const f = (value) => (
        value > 216 / 24389
            ? Math.cbrt(value)
            : (841 / 108) * value + 4 / 29
    );
    const [x, y, z] = xyz.map(f);
    return [(116 * y) - 16, 500 * (x - y), 200 * (y - z)];
};

const deltaE76 = (first, second) => Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
);

const getEnclosingColorStops = (count) => {
    const upperIndex = REACHABLE_STOPS_COLOR_STOPS.findIndex((stop) => stop >= count);
    if (upperIndex <= 0) return [0, REACHABLE_STOPS_COLOR_STOPS[Math.max(0, upperIndex)]];
    if (upperIndex < 0) return [REACHABLE_STOPS_COLOR_STOPS.at(-1), Number.POSITIVE_INFINITY];
    return [
        REACHABLE_STOPS_COLOR_STOPS[upperIndex - 1],
        REACHABLE_STOPS_COLOR_STOPS[upperIndex]
    ];
};

{
    assert.deepEqual(REACHABLE_STOPS_COLOR_STOPS, EXPECTED_STOPS);
    assert.deepEqual(REACHABLE_STOPS_PALETTES.light, EXPECTED_LIGHT);
    assert.deepEqual(REACHABLE_STOPS_PALETTES.dark, EXPECTED_DARK);

    const lightExpression = createReachableStopsColorExpression('light');
    const darkExpression = createReachableStopsColorExpression('dark');
    assert.equal(lightExpression[0], 'interpolate-lab');
    assert.deepEqual(lightExpression[2], [
        'coalesce',
        ['get', 'departureOpportunityCount'],
        ['get', 'shiftCount'],
        0
    ]);
    assert.deepEqual(lightExpression.slice(3, 7), [0, 'rgba(0, 0, 0, 0)', 1, '#FFEE99']);
    assert.deepEqual(lightExpression.filter((_, index) => index >= 3 && index % 2 === 1), [
        0,
        ...EXPECTED_STOPS
    ]);
    assert.deepEqual(darkExpression.filter((_, index) => index >= 4 && index % 2 === 0), [
        'rgba(0, 0, 0, 0)',
        ...EXPECTED_DARK
    ]);
    assert.notEqual(getReachableStopsStrokeColor('light'), getReachableStopsStrokeColor('dark'));
    assert.deepEqual(
        [360, 1000, 2500].map(getEnclosingColorStops),
        [[288, 576], [576, 1152], [2304, 3200]]
    );

    for (const [paletteName, colors] of Object.entries(REACHABLE_STOPS_PALETTES)) {
        const labs = colors.map(hexToLab);
        for (let index = 1; index < labs.length; index += 1) {
            assert.ok(
                deltaE76(labs[index - 1], labs[index]) > 0,
                `${paletteName} adjacent colors must not collapse to the same color`
            );
            // The restored yellow-to-red ramp darkens in both themes.
            assert.ok(labs[index][0] < labs[index - 1][0]);
        }
    }
}

const stationCoordinates = {
    A: [139.70000041, 35.60000041],
    B: [139.70000042, 35.60000042],
    C: [139.8, 35.7],
    D: [139.9, 35.8]
};

{
    const built = buildReachableStopsOverlayGeoJSON({
        payload: {
            reachableStops: ['A', 'B', 'C', 'D'],
            remainingMsByStop: new Map([
                ['A', [{ remainMs: 10 * 60_000, count: 12 }]],
                ['B', [
                    { remainMs: 10 * 60_000, departureOpportunityCount: 7, count: 999 },
                    { remainMs: 20 * 60_000, count: 5 }
                ]],
                ['C', [{ remainMs: 10 * 60_000, count: 0 }]],
                ['D', [{ remainMs: 10 * 60_000, count: -1 }]]
            ])
        },
        getStationCoord: (stationId) => stationCoordinates[stationId],
        theme: 'dark'
    });

    assert.equal(built.theme, 'dark');
    assert.equal(built.geojson.features.length, 2);

    const merged = built.geojson.features.find((feature) => feature.properties.radiusMeters === 500);
    const outer = built.geojson.features.find((feature) => feature.properties.radiusMeters === 1000);
    assert.ok(merged);
    assert.ok(outer);
    assert.deepEqual(merged.properties.stationIds, ['A', 'B']);
    assert.equal(merged.properties.departureOpportunityCount, 12);
    assert.equal(merged.properties.shiftCount, 12);
    assert.deepEqual(merged.geometry.coordinates, [139.7, 35.6]);
    assert.deepEqual(outer.properties.stationIds, ['B']);
    assert.equal(outer.properties.departureOpportunityCount, 5);
    assert.ok(outer.properties.sortKey < merged.properties.sortKey);

    const otherCounts = buildReachableStopsOverlayGeoJSON({
        payload: {
            reachableStops: ['A'],
            remainingMsByStop: new Map([['A', [{ remainMs: 10 * 60_000, count: 2500 }]]])
        },
        getStationCoord: (stationId) => stationCoordinates[stationId],
        theme: 'dark'
    });
    assert.deepEqual(otherCounts.dynamicColorExpression, built.dynamicColorExpression);
}

{
    const matrixCoordinates = {
        LOW_COUNT: [139.1, 35.1],
        HIGH_COUNT: [139.2, 35.2],
        SHORT_REMAINING: [139.3, 35.3],
        LONG_REMAINING: [139.4, 35.4]
    };
    const built = buildReachableStopsOverlayGeoJSON({
        payload: {
            reachableStops: Object.keys(matrixCoordinates),
            remainingMsByStop: new Map([
                ['LOW_COUNT', [{ remainMs: 0, count: 1 }]],
                ['HIGH_COUNT', [{ remainMs: 0, count: 3200 }]],
                ['SHORT_REMAINING', [{ remainMs: 10 * 60_000, count: 18 }]],
                ['LONG_REMAINING', [{ remainMs: 20 * 60_000, count: 18 }]]
            ])
        },
        getStationCoord: (stationId) => matrixCoordinates[stationId]
    });
    const featureById = new Map(
        built.geojson.features.map((feature) => [feature.properties.id, feature])
    );

    assert.equal(featureById.get('LOW_COUNT').properties.radiusMeters, 250);
    assert.equal(featureById.get('HIGH_COUNT').properties.radiusMeters, 250);
    assert.equal(featureById.get('SHORT_REMAINING').properties.radiusMeters, 500);
    assert.equal(featureById.get('LONG_REMAINING').properties.radiusMeters, 1000);
    assert.equal(featureById.get('LOW_COUNT').properties.departureOpportunityCount, 1);
    assert.equal(featureById.get('HIGH_COUNT').properties.departureOpportunityCount, 3200);
    assert.equal(featureById.get('SHORT_REMAINING').properties.departureOpportunityCount, 18);
    assert.equal(featureById.get('LONG_REMAINING').properties.departureOpportunityCount, 18);
}

{
    const layers = new Map();
    const paintCalls = [];
    const sourceInitialData = [];
    let source = null;
    let failNextSourceUpdate = false;
    let styleLoadListener = null;
    const mapEngine = {
        on(eventName, listener) {
            if (eventName === 'style.load') styleLoadListener = listener;
        },
        applyPaintProperties(layerId, paint) {
            paintCalls.push([layerId, paint]);
        },
        ensureGeoJsonSource(_sourceId, data) {
            if (!source) {
                source = { data };
                sourceInitialData.push(data);
            }
            return source;
        },
        ensureLayer(layer) {
            layers.set(layer.id, layer);
        },
        getLayer(layerId) {
            return layers.get(layerId) || null;
        },
        updateGeoJsonSource(_sourceId, data) {
            if (!source) throw new Error('source missing');
            if (failNextSourceUpdate) {
                failNextSourceUpdate = false;
                throw new Error('expected source update failure');
            }
            source.data = data;
            return source;
        },
        moveLayer() {}
    };
    const renderer = createReachableStopsOverlayRenderer({ mapEngine });

    renderer.ensureLayers(undefined, undefined, { theme: 'light' });
    const layer = layers.get('reachable-stops-overlay-circle-layer');
    assert.ok(layer);
    assert.equal(layer.paint['circle-opacity'], 0.6);
    assert.equal(layer.paint['circle-blur'], 0.25);
    assert.equal(layer.paint['circle-stroke-width'], 0);
    assert.equal(layer.paint['circle-stroke-color'], getReachableStopsStrokeColor('light'));
    assert.equal(layer.paint['circle-color'][0], 'interpolate-lab');

    renderer.refreshTheme('dark');
    assert.equal(paintCalls.length, 1);
    assert.equal(paintCalls[0][1]['circle-opacity'], 0.6);
    assert.equal(paintCalls[0][1]['circle-blur'], 0.25);
    assert.equal(paintCalls[0][1]['circle-stroke-width'], 0);
    assert.equal(paintCalls[0][1]['circle-stroke-color'], getReachableStopsStrokeColor('dark'));
    assert.equal(paintCalls[0][1]['circle-color'].at(-1), '#FF0000');

    const visibleGeojson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { departureOpportunityCount: 18, radiusMeters: 500 },
            geometry: { type: 'Point', coordinates: [139.7, 35.6] }
        }]
    };
    assert.equal(renderer.setData(visibleGeojson), true);
    failNextSourceUpdate = true;
    assert.equal(renderer.clear(), false);
    assert.equal(source.data, visibleGeojson, 'failed clear must preserve the committed data');

    source = null;
    layers.clear();
    assert.equal(typeof styleLoadListener, 'function');
    styleLoadListener();
    assert.equal(sourceInitialData.length, 2, 'style reload must recreate the GeoJSON source');
    assert.equal(sourceInitialData.at(-1).features.length, 0, 'style reload must preserve the failed clear intent');
    const reloadedLayer = layers.get('reachable-stops-overlay-circle-layer');
    assert.ok(reloadedLayer, 'style reload must recreate the layer');
    assert.equal(
        reloadedLayer.paint['circle-stroke-color'],
        getReachableStopsStrokeColor('dark'),
        'style reload must preserve the current theme stroke'
    );
    assert.equal(reloadedLayer.paint['circle-stroke-width'], 0);
    assert.equal(reloadedLayer.paint['circle-color'].at(-1), '#FF0000');
}

{
    let darkTheme = false;
    const calls = {
        ensure: [],
        fit: 0,
        setData: []
    };
    const overlayRenderer = {
        ensureLayers(expression, opacity, options) {
            calls.ensure.push({ expression, opacity, options });
        },
        fitToBounds() {
            calls.fit += 1;
        },
        setData(geojson) {
            calls.setData.push(geojson);
        }
    };
    const runtime = createTravelSearchMapRuntime({
        overlayRenderer,
        getIsDarkTheme: () => darkTheme,
        getStationCoord: (stationId) => stationCoordinates[stationId]
    });
    const makePayload = (count, stopIds = ['A']) => ({
        reachableStops: stopIds,
        remainingMsByStop: new Map(stopIds.map((stopId) => [
            stopId,
            [{ remainMs: 10 * 60_000, count }]
        ]))
    });

    await runtime.updateReachableStopsOverlay(makePayload(10));
    await runtime.updateReachableStopsOverlay(makePayload(11));
    assert.equal(calls.setData.length, 2, 'count-only changes must update source data');

    await runtime.updateReachableStopsOverlay(makePayload(11, ['A', 'B']));
    assert.equal(calls.setData.length, 3, 'merged station id changes must update source data');
    assert.deepEqual(calls.setData.at(-1).features[0].properties.stationIds, ['A', 'B']);

    darkTheme = true;
    await runtime.refreshReachableStopsOverlay(undefined, {
        fitBounds: false,
        forcePaint: true
    });
    assert.equal(calls.ensure.length, 4);
    assert.equal(calls.ensure.at(-1).options.theme, 'dark');
    assert.equal(calls.ensure.at(-1).expression.at(-1), '#FF0000');
    assert.equal(calls.setData.length, 3, 'theme refresh must not rewrite unchanged source data');
    assert.equal(calls.fit, 3, 'theme refresh must not move the viewport');
}

{
    let coordinate = [139.7, 35.6];
    const calls = { setData: [] };
    const runtime = createTravelSearchMapRuntime({
        overlayRenderer: {
            ensureLayers() {},
            fitToBounds() {},
            setData(geojson) {
                calls.setData.push(geojson);
            }
        },
        getStationCoord: () => coordinate
    });
    const makePayload = (remainMinutes) => ({
        reachableStops: ['A'],
        remainingMsByStop: new Map([[
            'A',
            [{ remainMs: remainMinutes * 60_000, departureOpportunityCount: 18 }]
        ]])
    });

    await runtime.updateReachableStopsOverlay(makePayload(10));
    await runtime.updateReachableStopsOverlay(makePayload(20));
    assert.equal(calls.setData.length, 2, 'radius-only changes must update source data');
    assert.equal(calls.setData.at(-1).features[0].properties.radiusMeters, 1000);

    coordinate = [139.71, 35.61];
    await runtime.updateReachableStopsOverlay(makePayload(20));
    assert.equal(calls.setData.length, 3, 'coordinate-only changes must update source data');
    assert.deepEqual(calls.setData.at(-1).features[0].geometry.coordinates, coordinate);
}

{
    let failNextSetData = true;
    let failNextClear = true;
    const calls = { clear: 0, ensure: 0, fit: 0, setData: 0 };
    const overlayRenderer = {
        clear() {
            calls.clear += 1;
            if (failNextClear) {
                failNextClear = false;
                return false;
            }
            return true;
        },
        ensureLayers() {
            calls.ensure += 1;
        },
        fitToBounds() {
            calls.fit += 1;
        },
        setData() {
            calls.setData += 1;
            if (failNextSetData) {
                failNextSetData = false;
                return false;
            }
            return true;
        }
    };
    const runtime = createTravelSearchMapRuntime({
        overlayRenderer,
        getStationCoord: (stationId) => stationCoordinates[stationId]
    });
    const payload = {
        reachableStops: ['A'],
        remainingMsByStop: new Map([['A', [{ remainMs: 10 * 60_000, count: 18 }]]])
    };

    assert.equal(await runtime.updateReachableStopsOverlay(payload), false);
    assert.equal(calls.setData, 1);
    assert.equal(calls.fit, 0, 'failed source updates must not fit an invisible overlay');

    assert.equal(await runtime.updateReachableStopsOverlay(payload), true);
    assert.equal(calls.setData, 2, 'failed source updates must be retried for the same visible key');
    assert.equal(calls.fit, 1);

    await runtime.updateReachableStopsOverlay(payload);
    assert.equal(calls.setData, 2, 'visible key commits only after the source update succeeds');
    assert.equal(calls.ensure, 3, 'paint/layer health is still checked on cache hits');

    assert.equal(runtime.clearReachableStopsOverlay(), false);
    assert.equal(runtime.getReachableStopsLabelIds(), null, 'failed clear must preserve the clear intent');
    assert.equal(runtime.clearReachableStopsOverlay(), true);
    assert.equal(runtime.getReachableStopsLabelIds(), null);
    assert.equal(calls.clear, 2, 'failed clear must remain retryable');
}

{
    let desiredGeojson = null;
    let visibleGeojson = null;
    let pendingRetry = false;
    let failNextSetData = false;
    let setDataCount = 0;
    const overlayRenderer = {
        ensureLayers() {
            if (!pendingRetry) return;
            visibleGeojson = desiredGeojson;
            pendingRetry = false;
        },
        fitToBounds() {},
        setData(geojson) {
            setDataCount += 1;
            desiredGeojson = geojson;
            if (failNextSetData) {
                failNextSetData = false;
                pendingRetry = true;
                return false;
            }
            visibleGeojson = geojson;
            return true;
        }
    };
    const runtime = createTravelSearchMapRuntime({
        overlayRenderer,
        getStationCoord: (stationId) => stationCoordinates[stationId]
    });
    const makePayload = (count) => ({
        reachableStops: ['A'],
        remainingMsByStop: new Map([['A', [{ remainMs: 10 * 60_000, count }]]])
    });

    const originalPayload = makePayload(18);
    assert.equal(await runtime.updateReachableStopsOverlay(originalPayload), true);
    failNextSetData = true;
    assert.equal(await runtime.updateReachableStopsOverlay(makePayload(36)), false);
    assert.equal(await runtime.updateReachableStopsOverlay(originalPayload), true);
    assert.equal(setDataCount, 3, 'dirty same-key restoration must not use the cache fast path');
    assert.equal(visibleGeojson.features[0].properties.departureOpportunityCount, 18);
}

console.log('reachable stops overlay palette smoke ok');
