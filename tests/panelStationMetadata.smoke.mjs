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

assert.equal(readStationName({ name_zh: '\u4e1c\u4eac' }), '\u4e1c\u4eac');
assert.equal(pickTitleZhHans({ 'zh-Hans': '\u4e1c\u4eac', en: 'Tokyo' }), '\u4e1c\u4eac');
assert.equal(pickTitleEn({ 'en-US': 'Tokyo' }), 'Tokyo');

const stationsData = [
    { id: 'S1', railway: 'JR.Main', code: 'TYO', title: { 'zh-Hans': '\u4e1c\u4eac', en: 'Tokyo' } },
    { id: 'JR.Main.S1', railway: 'JR.Main', code: 'JY01', title: { 'zh-Hans': '\u4e1c\u4eac\uff08JR\uff09', en: 'Tokyo JR' } },
    { id: 'Metro.Main.S1', railway: 'Metro.Main', code: 'M01', title: { 'zh-Hans': '\u4e1c\u4eac\uff08Metro\uff09', en: 'Tokyo Metro' } }
];
const stationGroupsData = [
    [
        ['S1'],
        ['JR.Main.S1', 'Metro.Main.S1']
    ]
];
const trainTypesData = [
    { id: 'local', title: { 'zh-Hans': '\u666e\u901a', color: '#123456' } }
];

const loadJson = async (path) => {
    if (path.endsWith('stations.json')) return stationsData;
    if (path.endsWith('station-groups.json')) return stationGroupsData;
    if (path.endsWith('train-types.json')) return trainTypesData;
    return [];
};

const stationsIndex = await getStationsIndex({ loadJson });
assert.equal(stationsIndex.idToNameZh.get('S1'), '\u4e1c\u4eac');
assert.equal(stationsIndex.idToNameEn.get('S1'), 'Tokyo');
assert.equal(stationsIndex.idToCode.get('S1'), 'TYO');
assert.equal(stationsIndex.stationIdByRailwayAndNameZh.get('JR.Main||\u4e1c\u4eac\uff08JR\uff09'), 'JR.Main.S1');

const groupsIndex = await getStationGroupsIndex({ loadJson });
assert.deepEqual(groupsIndex.get('S1'), ['S1', 'JR.Main.S1', 'Metro.Main.S1']);
assert.deepEqual(groupsIndex.get('JR.Main.S1'), ['S1', 'JR.Main.S1', 'Metro.Main.S1']);

const trainTypesIndex = await getTrainTypesIndex({ loadJson });
assert.equal(trainTypesIndex.get('local'), '\u666e\u901a');

const trainTypeColorIndex = await getTrainTypeColorIndex({ loadJson });
assert.equal(trainTypeColorIndex.get('local'), '#123456');

const transferMap = await buildTransferLineStationNameMap({
    stationId: 'S1',
    stationNameZh: '\u4e1c\u4eac',
    servingLineIds: ['JR.Main'],
    lineGroupByMainId: new Map([['JR.Main', ['JR.Main']]]),
    getGroupsIndex: async () => groupsIndex,
    getStationsIndexFn: async () => stationsIndex
});

assert.deepEqual(transferMap.get('JR.Main'), {
    stationId: 'JR.Main.S1',
    name: '\u4e1c\u4eac\uff08JR\uff09',
    code: 'JY01',
    actualName: '\u4e1c\u4eac\uff08JR\uff09'
});

console.log('panel station metadata smoke ok');
