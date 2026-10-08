import assert from 'node:assert/strict';
import { planDiagramLineLabels } from '../src/ui/lineServiceDiagramLineLabels.js';

const fixture = (selectedLineId = 'Main', barriers = []) => {
    const coordinates = {
        MainStart: [300, 300], MainEnd: [300, 500], UpperJoin: [300, 160], UpperEnd: [300, 0],
        LowerStart: [300, 650], LowerEnd: [300, 800], BranchStart: [60, 40], TailEnd: [60, -80]
    };
    const orders = {
        Main: ['MainStart', 'MainEnd'], Upper: ['MainStart', 'UpperJoin', 'UpperEnd'],
        Lower: ['MainEnd', 'LowerStart', 'LowerEnd'], Branch: ['MainStart', 'UpperJoin', 'BranchStart'],
        Tail: ['BranchStart', 'TailEnd']
    };
    const edges = [
        ['MainStart', 'MainEnd', ['Main']], ['MainStart', 'UpperJoin', ['Upper', 'Branch']],
        ['UpperJoin', 'UpperEnd', ['Upper']], ['MainEnd', 'LowerStart', ['Lower']],
        ['LowerStart', 'LowerEnd', ['Lower']], ['UpperJoin', 'BranchStart', ['Branch']],
        ['BranchStart', 'TailEnd', ['Tail']]
    ].map(([from, to, lineIds], index) => ({ id: `edge-${index}`, from, to, lineIds }));
    const positions = new Map(Object.entries(coordinates).map(([id, [x, y]]) => [id, {
        x, y, column: x === 300 ? 0 : -1, leftTrackOffset: 0, rightTrackOffset: 0
    }]));
    const stationBoxes = [...positions].map(([id, point]) => ({ id, left: point.x - 14, right: point.x + 70, y: point.y, height: 22 }));
    const trackBoxes = edges.map((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        return { left: Math.min(a.x, b.x) - 7, right: Math.max(a.x, b.x) + 7, y: (a.y + b.y) / 2, height: Math.abs(a.y - b.y) + 14 };
    });
    const data = {
        selectedLine: { id: selectedLineId, stationOrder: orders[selectedLineId] },
        topology: { lineOrders: Object.entries(orders).map(([lineId, path]) => ({ lineId, paths: [path] })) }
    };
    return planDiagramLineLabels(data, positions, new Map(Object.keys(orders).map((id) => [id, { width: 100, height: 30 }])),
        stationBoxes, { edges, trackBoxes: [...trackBoxes, ...barriers] });
};

{
    const labels = fixture();
    const main = labels.find((label) => label.lineId === 'Main');
    assert.equal(main.side, 'right', '当前线路仍位于中段右侧');
    assert.equal(main.y, 400);
    for (const [lineId, junctionId, fromY, toY] of [['Upper', 'MainStart', 160, 300], ['Lower', 'MainEnd', 500, 650]]) {
        const label = labels.find((entry) => entry.lineId === lineId);
        assert.equal(label.junctionId, junctionId, '直通线取离当前线路最近的分界点');
        assert.equal(label.anchorId, junctionId);
        assert.equal(label.side, 'left', '非当前线路优先放在左侧');
        assert.ok(label.y > fromY && label.y < toY, '线路牌位于分界点进入本线路的一侧');
    }
    assert.equal(labels.length, 5, '每条线路各自保留线路牌，不因共用前段而绑定位置');
}

for (const selectedLineId of ['Main', 'Upper']) {
    const label = fixture(selectedLineId).find((entry) => entry.lineId === 'Branch');
    assert.equal(label.junctionId, 'UpperJoin', '分叉线跳过共用前段，取真正的分叉点');
    assert.equal(label.anchorId, 'BranchStart', '分叉线在线路分开后的开始处放牌');
    assert.equal(label.side, 'left', '更换当前线路不把支线牌带回中央列');
    assert.ok(label.x + label.width < 60);
    assert.ok(label.y > 40 && label.y < 160);
}

{
    const barrier = { left: 173, right: 187, y: 600, height: 200 };
    const label = fixture('Main', [barrier]).find((entry) => entry.lineId === 'Lower');
    assert.equal(label.side, 'right', '左侧被邻线挡住时改放本线右侧');
    assert.ok(label.x > 300, '不能跨过左侧邻线，把牌推到邻线外侧');
}

{
    const barriers = [
        { left: 173, right: 187, y: 575, height: 164 },
        { left: 390, right: 410, y: 575, height: 164 }
    ];
    const label = fixture('Main', barriers).find((entry) => entry.lineId === 'Lower');
    assert.ok(label, '起始段两侧都拥挤时仍保留线路牌');
    assert.ok(label.y > 650 && label.y <= 800, '仅沿本线路连续区段就近上下避让');
    assert.equal(label.anchorId, 'MainEnd', '上下避让不改变所属线路的接续锚点');
}

{
    const positions = new Map([['Join', 100], ['MainEnd', 120], ['ThroughEnd', 90]].map(([id, y]) => [id,
        { x: 300, y, column: 0, leftTrackOffset: 0, rightTrackOffset: 0 }]));
    const edges = [
        { id: 'main', from: 'Join', to: 'MainEnd', lineIds: ['Main'] },
        { id: 'through', from: 'Join', to: 'ThroughEnd', lineIds: ['Through'] }
    ];
    const data = {
        selectedLine: { id: 'Main', stationOrder: ['Join', 'MainEnd'] },
        topology: { lineOrders: edges.map((edge) => ({ lineId: edge.lineIds[0], paths: [[edge.from, edge.to]] })) }
    };
    const stationBoxes = [...positions].map(([id, point]) => ({ id, left: 286, right: 370, y: point.y, height: 22 }));
    const labels = planDiagramLineLabels(data, positions, new Map(['Main', 'Through'].map((id) => [id, { width: 100, height: 30 }])),
        stationBoxes, { edges, trackBoxes: [{ left: 173, right: 187, y: 100, height: 100 }] });
    const main = labels.find((label) => label.lineId === 'Main'), through = labels.find((label) => label.lineId === 'Through');
    assert.ok(through, '短区段上下被文字占满时，仍保留直通线线路牌');
    assert.equal(through.side, 'right', '左侧有邻线阻挡时，只在右侧绕开已有线路牌');
    assert.ok(through.x > main.x + main.width, '右侧无其他轨道时，允许避开同侧文字');
    assert.ok(through.y >= 90 && through.y <= 100, '线路牌仍处于本线路接续起始段');
}

console.log('线路牌就近接续、分叉起点、独立定位、左右回退和沿本线避让验证通过。');
