import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzeBranchesForLine } from '../src/map/analyze_branch.js';
import {
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
