import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/features/panel/panel.js', 'utf8');
const between = (start, end) => {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex + start.length);
    assert.ok(startIndex >= 0 && endIndex > startIndex);
    return source.slice(startIndex, endIndex);
};

// 执行生产采集函数到停站匹配和种别统计，避免为测试创建面板 DOM。
const lookupSource = between('        const collectRowsFromTripList =', '                if (!stop) continue;');
const createCollector = new Function('sg', `
    const toText = value => String(value ?? '').trim();
    const currentServiceDay = 'Weekday';
    const allowedKeys = null;
    const lineId = 'Test.Line';
    const trainTypesIndex = new Map([['Local', '普通']]);
    const trainTypeColorIndex = new Map([['Local', '#123456']]);
    const isExcludedLineType = () => false;
    const hasPanelTripNmMarker = () => false;
    const resolveTrainTypeColorForTheme = value => value;
    const resolveTypeBaseName = value => value;
    const lineTypeSummaryState = [];
    const recordTypeSummaryForTrip = (summary, payload) => summary.push(payload);
    ${between('const parseTripServiceDayFromId =', 'const formatTimeWithPlus =')}
    ${between('    const buildTripFilterKeys =', '    const getNtFirstDepartTime =')}
    ${between('        const throughDirectionCache =', '        const allTypeColorByName =')}
    ${lookupSource}
                if (stop) out.push({ tripId, stop, tripFilterKeys });
            }
            return out;
        };
    return { collect: collectRowsFromTripList, summary: lineTypeSummaryState };
`);

const makeTrip = (departure, day = 'Weekday') => ({
    id: `Test.Line.Shared.${day}`,
    t: 'Test.Line.Shared',
    y: 'Local',
    tt: [
        { s: 'Test.Line.GroupFirst', d: departure },
        { s: 'Test.Line.ExactLater', d: '12:00' }
    ]
});
const first = makeTrip('09:00');
const second = makeTrip('10:00');
const holiday = makeTrip('11:00', 'SaturdayHoliday');
const groups = new Map([['Test.Line.GroupFirst', ['Test.Line.ExactLater']]]);
const runtime = createCollector(groups);
const request = { tripList: [null, first, second, holiday], sourceLineId: 'Test.Line', stationKey: 'Test.Line.ExactLater', trackTypeSummary: true };
const initial = await runtime.collect(request);
assert.deepEqual(initial.map(row => row.stop.d), ['09:00', '10:00'], '保留原停站顺序，较早的换乘组匹配先于较晚的精确 ID 匹配；同 ID 的不同对象分别查找');
assert.deepEqual(await runtime.collect(request), initial, '同轮重复采集保持相同结果');
assert.equal(runtime.summary.length, 4, '复用查找结果不跳过各次采集的种别统计');
assert.deepEqual(await runtime.collect({ ...request, stationKey: 'Test.Line.Absent' }), [], '未停靠站不生成行');
assert.deepEqual(await runtime.collect({ ...request, stationKey: 'Test.Line.GroupFirst', trackTypeSummary: false }), initial, '同一班次的不同站点查询各自命中');
assert.equal(runtime.summary.length, 6, '未停靠站仍保留原种别统计调用');
assert.deepEqual(await runtime.collect({ ...request, allowedTripKeys: new Set(['Other.Trip']) }), [], '允许班次过滤仍在停站结果复用之前执行');
assert.deepEqual(await runtime.collect({ ...request, excludedTripKeySets: [new Set(['Test.Line.Shared'])] }), [], '排除班次过滤仍按本次集合执行');
assert.deepEqual((await runtime.collect({ ...request, serviceDay: 'SaturdayHoliday' })).map(row => row.stop.d), ['11:00'], '休息日采集不复用工作日筛选结果');

first.tt = [{ s: 'Test.Line.ExactLater', d: '08:00' }];
assert.equal((await createCollector(groups).collect(request))[0].stop.d, '08:00', '新的准备轮次重新读取班次数据');
console.log('面板过滤键与停站复用测试通过');
