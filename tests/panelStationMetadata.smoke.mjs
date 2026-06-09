import assert from 'node:assert/strict';

import {
    buildTransferLineStationNameMap,
    getStationGroupsIndex,
    getStationsIndex,
    getTrainTypeColorIndex,
    getTrainTypesIndex,
    pickTitleEn,
    pickTitleZhHans,
    readStationName,
    resetPanelStationMetadataCachesForTest
} from '../src/features/panel/panelStationMetadata.js';

resetPanelStationMetadataCachesForTest();

assert.equal(readStationName({ name_zh: '东京' }), '东京');
assert.equal(pickTitleZhHans({ zhHans: '东京', en: 'Tokyo' }), '东京');
assert.equal(pickTitleEn({ 'en-US': 'Tokyo' }), 'Tokyo');

const stationsData = [
    { id: 'S1', r: 'JR.Main', code: 'TYO', title: { zhHans: '东京', en: 'Tokyo' } },
    { id: 'JR.Main.S1', r: 'JR.Main', code: 'JY01', title: { zhHans: '东京（JR）', en: 'Tokyo JR' } },
    { id: 'Metro.Main.S1', r: 'Metro.Main', code: 'M01', title: { zhHans: '东京（Metro）', en: 'Tokyo Metro' } }
];
const stationGroupsData = [
    { ids: ['S1', 'JR.Main.S1', 'Metro.Main.S1'] }
];
const trainTypesData = [
    { id: 'local', title: { zhHans: '普通', color: '#123456' } }
];

const loadJson = async (path) => {
    if (path.endsWith('stations.json')) return stationsData;
    if (path.endsWith('station-groups.json')) return stationGroupsData;
    if (path.endsWith('train-types.json')) return trainTypesData;
    return [];
};

const stationsIndex = await getStationsIndex({ loadJson });
assert.equal(stationsIndex.idToNameZh.get('S1'), '东京');
assert.equal(stationsIndex.idToNameEn.get('S1'), 'Tokyo');
assert.equal(stationsIndex.idToCode.get('S1'), 'TYO');
assert.equal(stationsIndex.stationIdByRailwayAndNameZh.get('JR.Main||东京（JR）'), 'JR.Main.S1');

const groupsIndex = await getStationGroupsIndex({ loadJson });
assert.deepEqual(groupsIndex.get('S1'), ['S1', 'JR.Main.S1', 'Metro.Main.S1']);

const trainTypesIndex = await getTrainTypesIndex({ loadJson });
assert.equal(trainTypesIndex.get('local'), '普通');

const trainTypeColorIndex = await getTrainTypeColorIndex({ loadJson });
assert.equal(trainTypeColorIndex.get('local'), '#123456');

const transferMap = await buildTransferLineStationNameMap({
    stationId: 'S1',
    stationNameZh: '东京',
    servingLineIds: ['JR.Main'],
    lineGroupByMainId: new Map([['JR.Main', ['JR.Main']]]),
    getGroupsIndex: async () => groupsIndex,
    getStationsIndexFn: async () => stationsIndex
});

assert.deepEqual(transferMap.get('JR.Main'), {
    stationId: 'JR.Main.S1',
    name: '东京（JR）',
    code: 'JY01',
    actualName: '东京（JR）'
});

console.log('panel station metadata smoke ok');
