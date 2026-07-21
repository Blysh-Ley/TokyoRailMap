import assert from 'node:assert/strict';

import { buildTransferCapsuleGeoJSON } from '../src/map/transfer-capsules.js';
import { ROUTE_MAP_TYPE_PREVIEW_SOURCE } from '../src/domain/routeMapTypePreview.js';
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
        stationFeature('JR-East.Takasaki.Urawa', [139.6572, 35.8585]),
        stationFeature('JR-East.ShonanShinjuku.Urawa', [139.6572, 35.8585]),
        stationFeature('JR-East.KeihinTohokuNegishi.Urawa', [139.6572, 35.8585]),
        stationFeature('JR-East.Utsunomiya.HigashiOmiya', [139.6403, 35.9487]),
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
        ['JR-East.Takasaki.Urawa'],
        ['JR-East.ShonanShinjuku.Urawa'],
        ['JR-East.KeihinTohokuNegishi.Urawa']
    ],
    [
        ['JR-East.Musashino.MinamiUrawa']
    ]
];

const throughServiceConfigsObject = {
    UenoTokyo: {
        lineId: 'TokyoRail.MenuThrough.UenoTokyo',
        lineName: '上野东京线',
        color: '#f68b1e',
        stations: [
            'JR-East.Takasaki.Omiya',
            'JR-East.Takasaki.Urawa',
            'JR-East.Utsunomiya.HigashiOmiya'
        ]
    },
    ShonanShinjuku: {
        lineId: 'TokyoRail.MenuThrough.ShonanShinjuku',
        lineName: '湘南新宿线',
        color: '#e21f26',
        stations: [
            'JR-East.ShonanShinjuku.Omiya',
            'JR-East.ShonanShinjuku.Urawa',
            'JR-East.Utsunomiya.HigashiOmiya',
            'JR-East.ShonanShinjuku.MusashiKosugi',
            'JR-East.ShonanShinjuku.ShinKawasaki'
        ]
    }
};

const uenoEntry = {
    source: 'rw-menu-through:TokyoRail.MenuThrough.UenoTokyo',
    payload: {
        virtualTrips: [{
            selectedLineId: 'JR-East.Takasaki',
            selectedLineName: '上野东京线',
            segments: [{ stationIds: ['JR-East.Takasaki.Omiya'] }]
        }]
    }
};

const shonanEntry = {
    source: 'rw-menu-through:TokyoRail.MenuThrough.ShonanShinjuku',
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
    throughServiceConfigsObject,
    visibleStationIds: new Set([
        'JR-East.Takasaki.Omiya',
        'JR-East.Takasaki.Urawa',
        'JR-East.ShonanShinjuku.Omiya',
        'JR-East.ShonanShinjuku.Urawa',
        'JR-East.Utsunomiya.HigashiOmiya',
        'JR-East.KeihinTohokuNegishi.Omiya',
        'JR-East.KeihinTohokuNegishi.Urawa',
        'JR-East.ShonanShinjuku.MusashiKosugi',
        'JR-East.ShonanShinjuku.ShinKawasaki'
    ]),
    getLineColor: (lineId, participant) => {
        if (participant?.lineColor) return participant.lineColor;
        return participant?.throughCategory === 'UenoTokyo'
            ? '#f68b1e'
            : ({
                'JR-East.ShonanShinjuku': '#e21f26',
                'JR-East.KeihinTohokuNegishi': '#00a7e3'
            }[lineId] || '#999');
    },
    resolveStationCoordinate: ({ baseCoord, participantKey }) => {
        const offset = participantKey.includes('Shonan') ? 0.001 : (participantKey.includes('Keihin') ? 0.002 : -0.001);
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
assert.equal(twoLineInjection.virtualStationIds.size, 6);
assert.equal(twoLineInjection.virtualGroups.length, 3);
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
assert.equal(nativeTwoLineCapsule.lines.features.length, 3);
assert.equal(nativeTwoLineCapsule.centroids.features.length, 3);
assert.equal(nativeTwoLineCapsule.dots.features.length, 6);
assert.equal(nativeTwoLineCapsule.centroids.features[0].properties.stationCount, 2);

const threeLineInjection = buildInjection({
    tripPreviewSelectionEntries: [
        asSelectionEntry('ueno', uenoEntry),
        asSelectionEntry('shonan', shonanEntry)
    ],
    baseSelectedLineIds: new Set(['JR-East.KeihinTohokuNegishi'])
});
assert.equal(threeLineInjection.virtualStationIds.size, 8);
assert.equal(threeLineInjection.virtualGroups.length, 3);
assert.equal(threeLineInjection.virtualGroups[0].length, 3);

const unrelatedThirdLineInjection = buildInjection({
    tripPreviewSelectionEntries: [
        asSelectionEntry('ueno', uenoEntry),
        asSelectionEntry('shonan', shonanEntry)
    ],
    baseSelectedLineIds: new Set(['JR-East.Musashino'])
});
assert.equal(unrelatedThirdLineInjection.virtualStationIds.size, 6);
assert.equal(unrelatedThirdLineInjection.virtualGroups.length, 3);

const singleParticipantWrongCapsuleIds = Array.from(twoLineInjection.virtualStationIds)
    .filter((id) => id.includes('MusashiKosugi') || id.includes('ShinKawasaki'));
assert.deepEqual(singleParticipantWrongCapsuleIds, []);

const routeMapTypeEntry = {
    source: ROUTE_MAP_TYPE_PREVIEW_SOURCE,
    payload: {
        previewSource: ROUTE_MAP_TYPE_PREVIEW_SOURCE,
        selectedLineId: 'JR-East.Takasaki',
        mainLineId: 'JR-East.Takasaki',
        virtualTrips: [{
            selectedLineId: 'TokyoRail.RouteMapType.JR-East.Takasaki.1.Rapid',
            selectedLineName: '快速',
            previewSource: ROUTE_MAP_TYPE_PREVIEW_SOURCE,
            segments: [{
                lineId: 'TokyoRail.RouteMapType.JR-East.Takasaki.1.Rapid',
                r: 'JR-East.Takasaki',
                geometryLineId: 'JR-East.Takasaki',
                offsetLineId: 'JR-East.Takasaki',
                highlightColor: '#cc0000',
                stationIds: [
                    'JR-East.Takasaki.Omiya',
                    'JR-East.Takasaki.Urawa'
                ]
            }]
        }]
    }
};
const routeMapTypeInjection = buildInjection({
    tripPreviewSelectionEntries: [routeMapTypeEntry],
    baseSelectedLineIds: new Set(['JR-East.Takasaki'])
});
assert.equal(routeMapTypeInjection.virtualGroups.length, 2);
assert.equal(routeMapTypeInjection.virtualStationIds.size, 4);
assert.equal(
    Array.from(routeMapTypeInjection.virtualStationIds)
        .some((id) => id.includes('TokyoRail.RouteMapType.JR-East.Takasaki.1.Rapid')),
    true
);
const routeMapTypeFeature = routeMapTypeInjection.stationsData.features.find((feature) => (
    feature?.properties?.participantKey === 'base-line:TokyoRail.RouteMapType.JR-East.Takasaki.1.Rapid'
));
assert.ok(routeMapTypeFeature);
assert.equal(routeMapTypeFeature.properties.color, '#cc0000');

const virtualFeature = twoLineInjection.stationsData.features.find((feature) => (
    feature?.properties?.participantKey === 'through:UenoTokyo'
));
assert.ok(virtualFeature);
assert.equal(
    normalizePreviewVirtualStationProps(virtualFeature.properties).id,
    'JR-East.Takasaki.Omiya'
);

console.log('preview virtual stations smoke ok');
