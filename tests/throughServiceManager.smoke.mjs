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

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Tokaido.Tokyo', 'JR-East.Tokaido.Yokohama'),
        trip('JR-East.Utsunomiya.Tokyo', 'JR-East.Utsunomiya.Ueno')
    ]),
    'UenoTokyo'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.ShonanShinjuku.Shibuya', 'JR-East.ShonanShinjuku.Shinjuku'),
        trip('JR-East.Takasaki.Omiya', 'JR-East.Takasaki.Kumagaya')
    ]),
    'ShonanShinjuku'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.JobanRapid.Ueno', 'JR-East.JobanRapid.KitaSenju'),
        trip('JR-East.Joban.Toride', 'JR-East.Joban.Tsuchiura')
    ]),
    'UenoTokyoJoban'
);

assert.equal(
    detectThroughServiceCategoryFromTrips([
        trip('JR-East.Yokosuka.Tokyo', 'JR-East.Yokosuka.Shinagawa'),
        trip('JR-East.SobuRapid.Tokyo', 'JR-East.SobuRapid.Chiba')
    ]),
    'YokosukaSobuRapid'
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
assert.equal(isSUStations('JR-East.Sobu.Yotsukaido').YokosukaSobuRapid, true);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.UenoTokyo.codes, ['JU', 'JT']);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.ShonanShinjuku.hiddenEntityLineIds, ['JR-East.ShonanShinjuku']);
assert.deepEqual(THROUGH_SERVICE_CONFIGS_OBJECT.YokosukaSobuRapid.hiddenEntityLineIds, [
    'JR-East.Yokosuka',
    'JR-East.SobuRapid'
]);

const yokosukaTrip = {
    id: 'JR-East.Yokosuka.Test.Weekday',
    t: 'JR-East.Yokosuka.Test',
    r: 'JR-East.Yokosuka',
    nt: ['JR-East.SobuRapid.Test.Weekday'],
    tt: [
        { s: 'JR-East.Yokosuka.Tokyo' },
        { s: 'JR-East.Yokosuka.Shinagawa' }
    ]
};
const sobuRapidTrip = {
    id: 'JR-East.SobuRapid.Test.Weekday',
    t: 'JR-East.SobuRapid.Test',
    r: 'JR-East.SobuRapid',
    pt: ['JR-East.Yokosuka.Test.Weekday'],
    tt: [
        { s: 'JR-East.SobuRapid.Tokyo' },
        { s: 'JR-East.SobuRapid.Chiba' }
    ]
};
const tripsByLineId = new Map([
    ['JR-East.Yokosuka', [yokosukaTrip]],
    ['JR-East.SobuRapid', [sobuRapidTrip]]
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
    false,
    'Yokosuka/Sobu Rapid panel plan should hide the Yokosuka entity line'
);
assert.equal(
    yokosukaSobuPanelPlan.displayServingIds.includes('JR-East.SobuRapid'),
    false,
    'Yokosuka/Sobu Rapid panel plan should hide the Sobu Rapid entity line'
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
assert.equal(jrEastMenuLines.some((line) => line.lineId === 'JR-East.Yokosuka'), false);
assert.equal(jrEastMenuLines.some((line) => line.lineId === 'JR-East.SobuRapid'), false);
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
