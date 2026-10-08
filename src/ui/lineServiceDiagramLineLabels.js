// 线路牌只占图外侧的空白，位置从拓扑和绘图几何派生，不改变站序或轨迹布局。
export const planDiagramLineLabels = (data, positions, lineSizes, stationBoxes, { edges, trackBoxes }) => {
    const mainStations = new Set(data.selectedLine.stationOrder);
    const adjacent = new Map([...positions.keys()].map((id) => [id, []]));
    for (const edge of edges) {
        adjacent.get(edge.from).push(edge);
        adjacent.get(edge.to).push(edge);
    }
    const distance = new Map([...mainStations].map((id) => [id, 0]));
    const pending = [...mainStations];
    for (let index = 0; index < pending.length; index += 1) for (const edge of adjacent.get(pending[index])) {
        const next = edge.from === pending[index] ? edge.to : edge.from;
        if (!distance.has(next)) {
            distance.set(next, distance.get(pending[index]) + 1);
            pending.push(next);
        }
    }
    const stationById = new Map(stationBoxes.map((box) => [box.id, box]));
    const obstacles = [...stationBoxes, ...trackBoxes];
    const overlaps = (a, b) => a.x < b.x + b.width + 4 && a.x + a.width + 4 > b.x && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 4;
    const labels = [];
    // 主线优先占用中段右侧空白；其他线路根据与主干的接续关系靠近交界处。
    const displayIds = new Map(data.topology.lineOrders.map((line) => [line.lineId, line.displayLineId || line.lineId]));
    const mainLineId = displayIds.get(data.selectedLine.id) || data.selectedLine.id;
    const lines = [];
    for (const lineId of new Set(displayIds.values())) {
        const remaining = new Set(edges.filter((edge) => edge.lineIds.some((id) => displayIds.get(id) === lineId)));
        // 同一显示线路的连续区段共用线路牌，分离的区段仍分别寻找空白。
        while (remaining.size) {
            const edges = [remaining.values().next().value];
            remaining.delete(edges[0]);
            const ids = new Set([edges[0].from, edges[0].to]);
            for (let index = 0; index < edges.length; index += 1) for (const edge of remaining) {
                if (!ids.has(edge.from) && !ids.has(edge.to)) continue;
                remaining.delete(edge);
                ids.add(edge.from); ids.add(edge.to);
                edges.push(edge);
            }
            lines.push({ lineId, edges });
        }
    }
    lines.sort((a, b) => Number(b.lineId === mainLineId) - Number(a.lineId === mainLineId));
    for (const line of lines.filter((entry) => lineSizes.has(entry.lineId))) {
        const edges = line.edges, isMain = line.lineId === mainLineId;
        const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
        const order = [...new Set(data.topology.lineOrders.filter((entry) => displayIds.get(entry.lineId) === line.lineId).flatMap((entry) => entry.paths.flat()))];
        const orderIndex = (id) => order.includes(id) ? order.indexOf(id) : Infinity;
        const byDistance = (a, b) => distance.get(a) - distance.get(b) || orderIndex(a) - orderIndex(b);
        let junctionId = ids.slice().sort(byDistance)[0];
        const column = positions.get(junctionId).column;
        const metrics = lineSizes.get(line.lineId);
        const edgeIds = new Set(edges.map((edge) => edge.id));
        // 独立延伸的线路靠近入口；前段借用其他线路区间的分叉线，在线路分开后放牌。
        const independent = edges.some((edge) => positions.get(edge.from).column === column && positions.get(edge.to).column === column
            && edge.lineIds.every((id) => displayIds.get(id) === line.lineId));
        const crossing = independent ? null : edges.filter((edge) => positions.get(edge.from).column !== positions.get(edge.to).column)
            .sort((a, b) => byDistance([a.from, a.to].sort(byDistance)[0], [b.from, b.to].sort(byDistance)[0]))[0];
        if (crossing) junctionId = [crossing.from, crossing.to].sort(byDistance)[0];
        const nextId = crossing ? (junctionId === crossing.from ? crossing.to : crossing.from) : adjacent.get(junctionId).filter((edge) => edgeIds.has(edge.id))
            .map((edge) => edge.from === junctionId ? edge.to : edge.from)
            .sort((a, b) => distance.get(b) - distance.get(a))[0];
        const junction = positions.get(junctionId), next = positions.get(nextId);
        const branch = junction.x !== next.x;
        let anchorId = branch ? nextId : junctionId;
        const mainPoints = [...mainStations].map((id) => positions.get(id));
        const mainY = (Math.min(...mainPoints.map((point) => point.y)) + Math.max(...mainPoints.map((point) => point.y))) / 2;
        if (isMain) anchorId = [...mainStations].sort((a, b) => Math.abs(positions.get(a).y - mainY) - Math.abs(positions.get(b).y - mainY))[0];
        const point = positions.get(anchorId), anchorBox = stationById.get(anchorId);
        const direction = Math.sign(next.y - junction.y) * (branch ? -1 : 1);
        const fromY = Math.min(junction.y, next.y), toY = Math.max(junction.y, next.y);
        const y = isMain ? mainY : Math.max(fromY, Math.min(toY, point.y + direction * ((anchorBox.height + metrics.height) / 2 + 8)));
        const localStations = new Set([anchorId]), localPending = [anchorId];
        for (let index = 0; index < localPending.length; index += 1) for (const edge of adjacent.get(localPending[index])) {
            const id = edge.from === localPending[index] ? edge.to : edge.from;
            if (!edgeIds.has(edge.id) || positions.get(id).column !== point.column || localStations.has(id)) continue;
            localStations.add(id); localPending.push(id);
        }
        const localY = localPending.map((id) => positions.get(id).y);
        const candidates = [y, ...(isMain ? [] : [fromY, toY]),
            ...(isMain ? [] : obstacles.flatMap((box) => [box.y - (box.height + metrics.height) / 2 - 8, box.y + (box.height + metrics.height) / 2 + 8])),
            ...labels.flatMap((label) => [label.y - (label.height + metrics.height) / 2 - 8, label.y + (label.height + metrics.height) / 2 + 8])]
            .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
        // 起始段先左后右，再沿本线同列上下避让；仍放不下时，在同侧绕开已有线路牌。
        const ranges = isMain ? [[-Infinity, Infinity]] : [[fromY, toY], [Math.min(fromY, ...localY), Math.max(toY, ...localY)], [fromY, toY, true]];
        placement: for (const [from, to, avoidLabels] of ranges) {
            for (const side of isMain ? ['right'] : ['left', 'right']) {
                const baseX = side === 'right' ? (isMain ? anchorBox.right : point.x + point.rightTrackOffset) + 18
                    : point.x + point.leftTrackOffset - 18 - metrics.width;
                for (const candidateY of candidates.filter((value) => value >= from && value <= to)) {
                    const label = { lineId: line.lineId, anchorId, junctionId, column: point.column, side, isMain, ...metrics, x: baseX, y: candidateY };
                    const nearby = [...(isMain ? obstacles : stationBoxes), ...(avoidLabels ? labels.map((other) => ({
                        left: other.x, right: other.x + other.width, y: other.y, height: other.height
                    })) : [])].filter((box) => Math.abs(box.y - label.y) < (box.height + label.height) / 2 + 8)
                        .sort((a, b) => side === 'right' ? a.left - b.left : b.right - a.right);
                    for (const box of nearby) if (label.x < box.right + 8 && label.x + label.width > box.left - 8) {
                        label.x = side === 'right' ? box.right + 18 : box.left - 18 - label.width;
                    }
                    const inner = point.x + (side === 'left' ? point.leftTrackOffset - 7 : point.rightTrackOffset + 7);
                    const outer = side === 'left' ? label.x : label.x + label.width;
                    if (!isMain && trackBoxes.some((box) => Math.abs(box.y - label.y) < (box.height + label.height) / 2 + 8
                        && box.left < Math.max(inner, outer) && box.right > Math.min(inner, outer))) continue;
                    if (labels.some((other) => overlaps(label, other))) continue;
                    labels.push(label);
                    break placement;
                }
            }
        }
    }
    return labels;
};
