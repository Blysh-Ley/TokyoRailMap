import assert from 'node:assert/strict';

import { buildTransferCapsuleGeoJSON } from '../src/map/transfer-capsules.js';
import {
    buildPreviewVirtualStationInjection,
    getLineIdFromStationId,
    isPreviewVirtualStationId,
    normalizePreviewVirtualStationProps
} from '../src/domain/previewVirtualStations.js';

const stationFeature = (id, coordinates, lineId = getLineIdFromStationId(id)) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
        id,
        name: id.split('.').at(-1),
        name_zh: id.split('.').at(-1),
        platform_line_id: [lineId],
        serving_ids: [lineId]
    }
});

const stationsData = {
    type: 'FeatureCollection',
    features: [
        stationFeature('JR-East.Takasaki.Omiya', [139.6231, 35.9062]),
        stationFeature('JR-East.ShonanShinjuku.Omiya', [139.6231, 35.9062]),
        stationFeature('JR-East.KeihinTohokuNegishi.Omiya', [139.6231, 35.9062]),
        stationFeature('JR-East.Musashino.MinamiUrawa', [139.6698, 35.8477]),
        stationFeature('JR-East.ShonanShinjuku.MusashiKosugi', [139.6597, 35.5758]),
        stationFeature('JR-East.ShonanShinjuku.ShinKawasaki', [139.6718, 35.5516])
    ]
};

const stationGroups = [
    [
        ['JR-East.Takasaki.Omiya'],
        ['JR-East.ShonanShinjuku.Omiya'],
        ['JR-East.KeihinTohokuNegishi.Omiya']
    ],
    [
        ['JR-East.Musashino.MinamiUrawa']
    ]
];

const uenoEntry = {
    source: 'rw-menu-through:ueno-tokyo',
    payload: {
        virtualTrips: [{
            selectedLineId: 'JR-East.Takasaki',
            selectedLineName: '上野东京线',
            segments: [{ stationIds: ['JR-East.Takasaki.Omiya'] }]
        }]
    }
};

const shonanEntry = {
    source: 'rw-menu-through:shonan-shinjuku',
    payload: {
        virtualTrips: [{
            selectedLineId: 'JR-East.ShonanShinjuku',
            selectedLineName: '湘南新宿线',
            segments: [{
                stationIds: [
                    'JR-East.ShonanShinjuku.Omiya',
                    'JR-East.ShonanShinjuku.MusashiKosugi',
                    'JR-East.ShonanShinjuku.ShinKawasaki'
                ]
            }]
        }]
    }
};

const asSelectionEntry = (key, entry) => [key, entry];

const buildInjection = (overrides = {}) => buildPreviewVirtualStationInjection({
    stationsData,
    stationGroups,
    visibleStationIds: new Set([
        'JR-East.Takasaki.Omiya',
        'JR-East.ShonanShinjuku.Omiya',
        'JR-East.KeihinTohokuNegishi.Omiya',
        'JR-East.ShonanShinjuku.MusashiKosugi',
        'JR-East.ShonanShinjuku.ShinKawasaki'
    ]),
    getLineColor: (lineId) => ({
        'JR-East.Takasaki': '#f68b1e',
        'JR-East.ShonanShinjuku': '#e21f26',
        'JR-East.KeihinTohokuNegishi': '#00a7e3'
    }[lineId] || '#999'),
    resolveStationCoordinate: ({ baseCoord, participantKey }) => {
        const offset = participantKey.includes('shonan') ? 0.001 : (participantKey.includes('Keihin') ? 0.002 : -0.001);
        return [baseCoord[0] + offset, baseCoord[1]];
    },
    ...overrides
});

assert.equal(getLineIdFromStationId('JR-East.Takasaki.Omiya'), 'JR-East.Takasaki');
assert.equal(getLineIdFromStationId('Omiya'), '');

const onlyShonanInjection = buildInjection({
    tripPreviewSelectionEntries: [shonanEntry]
});
assert.equal(onlyShonanInjection.virtualStationIds.size, 0);
assert.equal(onlyShonanInjection.virtualGroups.length, 0);

const twoLineInjection = buildInjection({
    tripPreviewSelectionEntries: [
        asSelectionEntry('ueno', uenoEntry),
        asSelectionEntry('shonan', shonanEntry)
    ]
});
assert.equal(twoLineInjection.virtualStationIds.size, 2);
assert.equal(twoLineInjection.virtualGroups.length, 1);
assert.equal(twoLineInjection.virtualGroups[0].length, 2);
assert.equal(twoLineInjection.visibleStationIds.has('JR-East.Takasaki.Omiya'), false);
assert.equal(twoLineInjection.visibleStationIds.has('JR-East.ShonanShinjuku.Omiya'), false);
assert.equal(twoLineInjection.visibleStationIds.has('JR-East.KeihinTohokuNegishi.Omiya'), false);
assert.equal(Array.from(twoLineInjection.virtualStationIds).every(isPreviewVirtualStationId), true);

const nativeTwoLineCapsule = buildTransferCapsuleGeoJSON(
    twoLineInjection.stationsData,
    twoLineInjection.stationGroups,
    { visibleStationIds: twoLineInjection.visibleStationIds }
);
assert.equal(nativeTwoLineCapsule.lines.features.length, 1);
assert.equal(nativeTwoLineCapsule.centroids.features.length, 1);
assert.equal(nativeTwoLineCapsule.centroids.features[0].properties.stationCount, 2);

const threeLineInjection = buildInjection({
    tripPreviewSelectionEntries: [
        asSelectionEntry('ueno', uenoEntry),
        asSelectionEntry('shonan', shonanEntry)
    ],
    baseSelectedLineIds: new Set(['JR-East.KeihinTohokuNegishi'])
});
assert.equal(threeLineInjection.virtualStationIds.size, 3);
assert.equal(threeLineInjection.virtualGroups.length, 1);
assert.equal(threeLineInjection.virtualGroups[0].length, 3);
const nativeThreeLineCapsule = buildTransferCapsuleGeoJSON(
    threeLineInjection.stationsData,
    threeLineInjection.stationGroups,
    { visibleStationIds: threeLineInjection.visibleStationIds }
);
assert.equal(nativeThreeLineCapsule.lines.features.length, 2);
assert.equal(nativeThreeLineCapsule.centroids.features[0].properties.stationCount, 3);

const unrelatedThirdLineInjection = buildInjection({
    tripPreviewSelectionEntries: [
        asSelectionEntry('ueno', uenoEntry),
        asSelectionEntry('shonan', shonanEntry)
    ],
    baseSelectedLineIds: new Set(['JR-East.Musashino'])
});
assert.equal(unrelatedThirdLineInjection.virtualStationIds.size, 2);
assert.equal(unrelatedThirdLineInjection.virtualGroups.length, 1);

const realOnlyMusashiKosugi = Array.from(twoLineInjection.virtualStationIds)
    .some((id) => id.endsWith(':JR-East.ShonanShinjuku.MusashiKosugi'));
const realOnlyShinKawasaki = Array.from(twoLineInjection.virtualStationIds)
    .some((id) => id.endsWith(':JR-East.ShonanShinjuku.ShinKawasaki'));
assert.equal(realOnlyMusashiKosugi, false);
assert.equal(realOnlyShinKawasaki, false);

const virtualFeature = twoLineInjection.stationsData.features.find((feature) => (
    feature?.properties?.participantKey === 'rw-menu-through:ueno-tokyo'
));
assert.ok(virtualFeature);
assert.deepEqual(
    normalizePreviewVirtualStationProps(virtualFeature.properties).id,
    'JR-East.Takasaki.Omiya'
);

console.log('transfer capsule visibility smoke ok');
