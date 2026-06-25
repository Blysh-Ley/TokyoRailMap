import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMenuModel } from '../src/features/menu/menu.js';
import { analyzeBranchesForLine } from '../src/map/analyze_branch.js';
import {
    buildTemporaryThroughServicePanelPlan,
    detectThroughServiceCategoryFromTrips,
    getMenuThroughCategoryByLineId,
    getThroughServiceDisplayByCategory,
    initializeThroughServiceStationIndex,
    isSUStations,
    THROUGH_SERVICE_CONFIGS_OBJECT
} from '../src/lib/throughServiceManager.js';

const railways = JSON.parse(fs.readFileSync('data/railways.json', 'utf8'));
initializeThroughServiceStationIndex({ railways });

const trip = (...stationIds) => ({
    tt: stationIds.map((stationId) => ({ s: stationId }))
});

const tripWithRefs = ({ id = '', t = '', stationIds = [], pt = [], nt = [], nm } = {}) => ({
    ...(id ? { id } : {}),
    ...(t ? { t } : {}),
    pt,
    nt,
    ...(nm === undefined ? {} : { nm }),
    tt: stationIds.map((stationId) => ({ s: stationId }))
});

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            id: 'JR-East.Tokaido.Test.Weekday',
            stationIds: ['JR-East.Tokaido.Yokohama', 'JR-East.Tokaido.Tokyo'],
            nt: ['JR-East.Utsunomiya.Test.Weekday']
        }),
        tripWithRefs({
            id: 'JR-East.Utsunomiya.Test.Weekday',
            stationIds: ['JR-East.Utsunomiya.Tokyo', 'JR-East.Utsunomiya.Ueno'],
            pt: ['JR-East.Tokaido.Test.Weekday']
        })
    ]),
    'UenoTokyo'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            id: 'JR-East.ShonanShinjuku.Test.Weekday',
            stationIds: ['JR-East.ShonanShinjuku.Shibuya', 'JR-East.ShonanShinjuku.Shinjuku'],
            nt: ['JR-East.Takasaki.Test.Weekday']
        }),
        tripWithRefs({
            id: 'JR-East.Takasaki.Test.Weekday',
            stationIds: ['JR-East.Takasaki.Omiya', 'JR-East.Takasaki.Kumagaya'],
            pt: ['JR-East.ShonanShinjuku.Test.Weekday']
        })
    ]),
    'ShonanShinjuku'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            id: 'JR-East.JobanRapid.Test.Weekday',
            stationIds: ['JR-East.JobanRapid.Shinagawa', 'JR-East.JobanRapid.Tokyo', 'JR-East.JobanRapid.Toride'],
            nt: ['JR-East.Joban.Test.Weekday']
        }),
        tripWithRefs({
            id: 'JR-East.Joban.Test.Weekday',
            stationIds: ['JR-East.Joban.Toride', 'JR-East.Joban.Tsuchiura'],
            pt: ['JR-East.JobanRapid.Test.Weekday']
        })
    ]),
    'UenoTokyoJoban'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            id: 'JR-East.SobuRapid.Test.Weekday',
            stationIds: ['JR-East.SobuRapid.Chiba', 'JR-East.SobuRapid.Tokyo'],
            nt: ['JR-East.Yokosuka.Test.Weekday']
        }),
        tripWithRefs({
            id: 'JR-East.Yokosuka.Test.Weekday',
            stationIds: ['JR-East.Yokosuka.Tokyo', 'JR-East.Yokosuka.Shinagawa'],
            pt: ['JR-East.SobuRapid.Test.Weekday']
        })
    ]),
    'YokosukaSobuRapid'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Yokosuka.Shinagawa', 'JR-East.Yokosuka.Yokohama'),
        trip('JR-East.SobuRapid.ShinNihombashi', 'JR-East.SobuRapid.Chiba')
    ]),
    '',
    'through service classification should require the configured core through station token'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Tokaido.Tokyo', 'JR-East.Tokaido.Yokohama'),
        trip('JR-East.Utsunomiya.Tokyo', 'JR-East.Utsunomiya.Ueno')
    ]),
    '',
    'through service classification should reject configured through stations when they are only chain endpoints'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            stationIds: ['JR-East.Tokaido.Tokyo', 'JR-East.Tokaido.Yokohama'],
            nm: [{ 'zh-Hans': '特殊班次' }]
        }),
        trip('JR-East.Utsunomiya.Tokyo', 'JR-East.Utsunomiya.Ueno')
    ]),
    '',
    'through service classification should reject nm-marked special trips by default'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Yokosuka.Tokyo', 'JR-East.Yokosuka.Shinagawa'),
        trip('JR-East.SobuRapid.Tokyo', 'JR-East.SobuRapid.Chiba'),
        trip('JR-East.KeihinTohokuNegishi.Tokyo', 'JR-East.KeihinTohokuNegishi.Ueno')
    ]),
    '',
    'through service classification should reject chains with any station outside the configured segments'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        tripWithRefs({
            stationIds: ['JR-East.Yokosuka.Tokyo', 'JR-East.Yokosuka.Shinagawa'],
            nt: ['JR-East.SobuRapid.Test.Weekday']
        }),
        tripWithRefs({
            stationIds: ['JR-East.SobuRapid.Tokyo', 'JR-East.SobuRapid.Chiba'],
            pt: [
                'JR-East.Yokosuka.Test.Weekday',
                'JR-East.KeihinTohokuNegishi.Outside.Weekday'
            ]
        })
    ]),
    '',
    'through service classification should reject split/merge refs when any pt/nt line is outside the configured segments'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Sobu.Chiba', 'JR-East.Sobu.Naruto')
    ]),
    '',
    'single segment local-like chain should not be classified as through service'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Yamanote.Tokyo', 'JR-East.Yamanote.Ueno')
    ]),
    ''
);

assert.equal(getMenuThroughCategoryByLineId('TokyoRail.Temp.UenoTokyo'), 'UenoTokyo');
assert.equal(getMenuThroughCategoryByLineId('TokyoRail.MenuThrough.UenoTokyo'), 'UenoTokyo');
assert.equal(getMenuThroughCategoryByLineId('rw-menu-through:TokyoRail.Temp.UenoTokyo'), 'UenoTokyo');

assert.deepEqual(getThroughServiceDisplayByCategory('YokosukaSobuRapid'), {
    name: '横须贺线·总武线(快速)',
    color: '#007AC1'
});

assert.equal(isSUStations('JR-East.Sobu.HigashiChiba').YokosukaSobuRapid, false);
assert.equal(isSUStations('JR-East.Sobu.Sakura').YokosukaSobuRapid, true);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.codes, ['JU', 'JT']);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.requiredThroughStationToken, {
    station: 'Tokyo',
    through: true
});
assert.equal(THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.excludeNmTrips, true);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.ShonanShinjuku.hiddenEntityLineIds, ['JR-East.ShonanShinjuku']);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.YokosukaSobuRapid.hiddenEntityLineIds, []);

const yokosukaTrip = {
    id: 'JR-East.Yokosuka.Test.Weekday',
    t: 'JR-East.Yokosuka.Test',
    r: 'JR-East.Yokosuka',
    pt: ['JR-East.SobuRapid.Test.Weekday'],
    tt: [
        { s: 'JR-East.Yokosuka.Tokyo' },
        { s: 'JR-East.Yokosuka.Shinagawa' }
    ]
};
const sobuRapidTrip = {
    id: 'JR-East.SobuRapid.Test.Weekday',
    t: 'JR-East.SobuRapid.Test',
    r: 'JR-East.SobuRapid',
    nt: ['JR-East.Yokosuka.Test.Weekday'],
    tt: [
        { s: 'JR-East.SobuRapid.Chiba' },
        { s: 'JR-East.SobuRapid.Tokyo' }
    ]
};
const sobuRapidOutsideRefTrip = {
    id: 'JR-East.SobuRapid.OutsideRef.Weekday',
    t: 'JR-East.SobuRapid.OutsideRef',
    r: 'JR-East.SobuRapid',
    pt: [
        'JR-East.Yokosuka.Test.Weekday',
        'JR-East.KeihinTohokuNegishi.Outside.Weekday'
    ],
    tt: [
        { s: 'JR-East.SobuRapid.Tokyo' },
        { s: 'JR-East.SobuRapid.Chiba' }
    ]
};
const tripsByLineId = new Map([
    ['JR-East.Yokosuka', [yokosukaTrip]],
    ['JR-East.SobuRapid', [sobuRapidTrip, sobuRapidOutsideRefTrip]]
]);
const tripsByRefId = new Map([
    [yokosukaTrip.id, yokosukaTrip],
    [sobuRapidTrip.id, sobuRapidTrip]
]);
const yokosukaSobuPanelPlan = await buildTemporaryThroughServicePanelPlan({
    stationId: 'JR-East.Yokosuka.Tokyo',
    servingLineIds: ['JR-East.Yokosuka', 'JR-East.SobuRapid'],
    loadTimetableForLineId: async (lineId) => tripsByLineId.get(lineId) || [],
    resolveStationIdForLine: async (lineId) => (
        lineId === 'JR-East.SobuRapid' ? 'JR-East.SobuRapid.Tokyo' : 'JR-East.Yokosuka.Tokyo'
    ),
    loadTripByRefId: async (tripId) => tripsByRefId.get(tripId) || null
});
assert.ok(yokosukaSobuPanelPlan, 'Yokosuka/Sobu Rapid through panel plan should be generated');
assert.ok(
    yokosukaSobuPanelPlan.displayServingIds.includes('TokyoRail.Temp.YokosukaSobuRapid'),
    'Yokosuka/Sobu Rapid panel plan should display the virtual through-service row'
);
assert.equal(
    yokosukaSobuPanelPlan.displayServingIds.includes('JR-East.Yokosuka'),
    true,
    'Yokosuka/Sobu Rapid panel plan should keep the Yokosuka entity line when it is not hidden by config'
);
assert.equal(
    yokosukaSobuPanelPlan.displayServingIds.includes('JR-East.SobuRapid'),
    true,
    'Yokosuka/Sobu Rapid panel plan should keep the Sobu Rapid entity line when it is not hidden by config'
);

const outsideRefPanelPlan = await buildTemporaryThroughServicePanelPlan({
    stationId: 'JR-East.SobuRapid.Tokyo',
    servingLineIds: ['JR-East.Yokosuka', 'JR-East.SobuRapid'],
    loadTimetableForLineId: async (lineId) => (
        lineId === 'JR-East.SobuRapid' ? [sobuRapidOutsideRefTrip] : []
    ),
    resolveStationIdForLine: async (lineId) => (
        lineId === 'JR-East.SobuRapid' ? 'JR-East.SobuRapid.Tokyo' : 'JR-East.Yokosuka.Tokyo'
    ),
    loadTripByRefId: async (tripId) => tripsByRefId.get(tripId) || null
});
assert.equal(
    outsideRefPanelPlan?.displayServingIds?.includes?.('TokyoRail.Temp.YokosukaSobuRapid') || false,
    false,
    'panel plan should not insert a virtual through-service line when any pt/nt ref is outside the configured segments'
);

const menuModel = buildMenuModel({
    companyObj: { 'JR-East': true },
    linesObj: {
        'JR-East.ShonanShinjuku': { company: 'JR-East', simplified: '湘南新宿ライン', modes: ['all'] },
        'JR-East.Yokosuka': { company: 'JR-East', simplified: '横須賀線', modes: ['all'] },
        'JR-East.SobuRapid': { company: 'JR-East', simplified: '総武快速線', modes: ['all'] },
        'JR-East.Yamanote': { company: 'JR-East', simplified: '山手線', modes: ['all'] }
    },
    companyLogoMap: { 'JR-East': { zh: 'JR东日本' } }
});
const jrEastMenuLines = menuModel.companies.find((company) => company.companyName === 'JR-East')?.lines || [];
assert.equal(jrEastMenuLines.some((line) => line.lineId === 'JR-East.ShonanShinjuku'), false);
assert.equal(jrEastMenuLines.some((line) => line.lineId === 'JR-East.Yokosuka'), true);
assert.equal(jrEastMenuLines.some((line) => line.lineId === 'JR-East.SobuRapid'), true);
assert.ok(jrEastMenuLines.some((line) => line.lineId === 'TokyoRail.Temp.YokosukaSobuRapid'));
assert.ok(jrEastMenuLines.some((line) => line.lineId === 'JR-East.Yamanote'));

const uenoTokyoResult = await analyzeBranchesForLine('JR-East.Tokaido', {
    throughServiceCategory: 'UenoTokyo',
    sourceLineIds: THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.segmentLineIds,
    filterSpecial: true
});
const uenoTokyoStations = THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.stationIdSet;
for (const chain of uenoTokyoResult?.fullRouteChains || []) {
    for (const stationId of chain?.stationIds || []) {
        assert.ok(
            uenoTokyoStations.has(stationId),
            `UenoTokyo branch preview must stay inside configured segments: ${stationId}`
        );
    }
}

console.log('through service manager smoke ok');
