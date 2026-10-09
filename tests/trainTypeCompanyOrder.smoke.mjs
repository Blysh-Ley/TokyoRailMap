import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
    sortTrainTypesByCompanyOrder,
    sortTypeNamesByBaseAndStopCount
} from '../src/domain/trainTypeOrder.js';
import {
    getTrainTypeMetadataIndex,
    resetPanelStationMetadataCachesForTest
} from '../src/features/panel/panelStation.js';

const metadata = JSON.parse(await fs.readFile(new URL('../data/train-types.json', import.meta.url), 'utf8'));
const trainTypesById = new Map(metadata.map((type) => [type.id, type]));
const expectedIds = [
    'Keisei.Skyliner', 'Keisei.Eveningliner', 'Keisei.Morningliner',
    'Keisei.AccessExpress', 'Keisei.RapidLimitedExpress', 'Keisei.LimitedExpress',
    'Keisei.CommuterLimitedExpress', 'Keisei.Rapid', 'Keisei.Local'
];

const companyTypes = new Map();
for (const type of metadata) {
    assert.ok(Number.isFinite(type.displayOrder), `${type.id} 已设置公司固定顺序`);
    const company = type.id.split('.')[0];
    if (!companyTypes.has(company)) companyTypes.set(company, []);
    companyTypes.get(company).push(type);
}
for (const types of companyTypes.values()) {
    types.sort((a, b) => a.displayOrder - b.displayOrder);
    assert.equal(new Set(types.map((type) => type.displayOrder)).size, types.length, '公司内种别顺序唯一');
    const input = types.slice().reverse().map((type) => ({ id: type.id, name: type.title['zh-Hans'] }));
    const expected = types.map((type) => type.id);
    for (const sign of [1, -1]) {
        const counts = new Map(input.map((type, index) => [type.name, sign * index]));
        const stops = new Map(input.map((type, index) => [type.name, sign * index]));
        assert.deepEqual(sortTrainTypesByCompanyOrder(input, counts, stops, trainTypesById).map((type) => type.id), expected, '所有公司的顺序均不随本线统计变化');
    }
}

const timetableDir = new URL('../data/train-timetables/', import.meta.url);
const files = (await fs.readdir(timetableDir)).filter((file) => file.endsWith('.json'));
let checkedDays = 0;
for (const file of files) {
    const trips = JSON.parse(await fs.readFile(new URL(file, timetableDir), 'utf8'));
    for (const day of ['Weekday', 'SaturdayHoliday']) {
        const selected = trips.filter((trip) => trip.id.includes(`.${day}`));
        if (!selected.length) continue;
        checkedDays += 1;
        const ids = [...new Set(selected.map((trip) => trip.y))];
        const types = ids.map((id) => {
            assert.ok(trainTypesById.has(id), `${file} 的现用种别 ${id} 有元数据`);
            return { id, name: trainTypesById.get(id).title['zh-Hans'] };
        });
        const counts = new Map(), minStops = new Map(), unionStops = new Map();
        for (const type of types) {
            const local = selected.filter((trip) => trip.y === type.id);
            counts.set(type.name, local.length);
            minStops.set(type.name, Math.min(...local.map((trip) => trip.tt.length)));
            unionStops.set(type.name, new Set(local.flatMap((trip) => trip.tt.map((stop) => stop.s))).size);
        }
        const ordered = sortTrainTypesByCompanyOrder(types, counts, minStops, trainTypesById);
        const names = sortTypeNamesByBaseAndStopCount(types.map((type) => type.name), null, unionStops, {
                currentLineId: selected[0]?.r,
                typeIdsByTypeName: new Map(types.map((type) => [type.name, new Set([type.id])])),
                trainTypesById
            });
        for (const [company, allTypes] of companyTypes) {
            const expected = allTypes.map((type) => type.id).filter((id) => ids.includes(id));
            if (!expected.length) continue;
            assert.deepEqual(ordered.filter((type) => type.id.startsWith(`${company}.`)).map((type) => type.id), expected, `${file} ${day} 线路图采用公司固定顺序`);
            assert.deepEqual(names.filter((name) => expected.some((id) => trainTypesById.get(id).title['zh-Hans'] === name)), expected.map((id) => trainTypesById.get(id).title['zh-Hans']), `${file} ${day} 停站并集与单班次停站数不能改变公司顺序`);
        }
    }
}

assert.deepEqual(companyTypes.get('Keisei').filter((type) => type.id !== 'Keisei.Express').map((type) => type.id), expectedIds, '京成已确定的现用种别顺序保留');

{
    const types = [
        { id: 'Other.LimitedExpress', name: '特急' },
        { id: 'Keisei.CommuterLimitedExpress', name: '通勤特急' },
        { id: 'Keisei.LimitedExpress', name: '特急' },
        { id: 'Other.Local', name: '普通' }
    ];
    const stops = new Map([['通勤特急', 2], ['特急', 20], ['普通', 30]]);
    const original = types.slice();
    const legacy = sortTrainTypesByCompanyOrder(types, null, stops);
    const ordered = sortTrainTypesByCompanyOrder(types, null, stops, trainTypesById);
    assert.deepEqual(ordered.filter((type) => type.id.startsWith('Keisei.')).map((type) => type.id), [
        'Keisei.LimitedExpress', 'Keisei.CommuterLimitedExpress'
    ], '相同名称仍按完整种别 ID 识别所属公司');
    legacy.forEach((type, index) => {
        if (type.id.startsWith('Other.')) assert.equal(ordered[index], type, '未定序公司保留原排序位置');
    });
    assert.deepEqual(types, original, '排序不修改输入列表');
    assert.deepEqual(sortTrainTypesByCompanyOrder(types, null, stops, new Map()), legacy, '无公司顺序时完全沿用原算法');

    const renamed = types.filter((type) => type.id.startsWith('Keisei.')).map((type, index) => ({ ...type, name: `名称${index}` }));
    assert.deepEqual(sortTrainTypesByCompanyOrder(renamed, null, null, trainTypesById).map((type) => type.id), [
        'Keisei.LimitedExpress', 'Keisei.CommuterLimitedExpress'
    ], '展示名称变化不改变已定序种别的顺序');
}

resetPanelStationMetadataCachesForTest();
let loads = 0;
const loadJson = async () => { loads += 1; return metadata; };
const panelIndex = await getTrainTypeMetadataIndex({ loadJson });
assert.equal(panelIndex.get('Keisei.LimitedExpress').displayOrder, 60, '面板读取同一份种别顺序元数据');
assert.equal(await getTrainTypeMetadataIndex({ loadJson }), panelIndex);
assert.equal(loads, 1, '种别元数据复用现有缓存生命周期');
resetPanelStationMetadataCachesForTest();

console.log(`${companyTypes.size} 家公司、${metadata.length} 个种别、${files.length} 份线路时刻表和 ${checkedDays} 个运营日组合的固定顺序验证通过。`);
