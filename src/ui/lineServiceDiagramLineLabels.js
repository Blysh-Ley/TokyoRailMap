// 线路牌只占图外侧的空白，位置从拓扑和绘图几何派生，不改变站序或轨迹布局。
export const planDiagramLineLabels = (data, positions, lineSizes, stationBoxes, { edges, trackBoxes }) => {
    const mainStations = new Set(data.selectedLine.stationOrder);
    const adjacent = new Map([...positions.keys()].map((id) => [id, []]));
    const stationLines = new Map([...positions.keys()].map((id) => [id, new Set()]));
    for (const edge of edges) {
        adjacent.get(edge.from).push(edge);
        adjacent.get(edge.to).push(edge);
        for (const id of [edge.from, edge.to]) for (const lineId of edge.lineIds) stationLines.get(id).add(lineId);
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
    const lineGroups = [];
    for (const line of lines.filter((entry) => lineSizes.has(entry.lineId))) {
        // 主线牌保留中段位置；共用真实区段的直通线路牌在同一空白区域上下排列。
        const group = line.lineId === mainLineId ? null : lineGroups.find((entry) => entry.lines[0].lineId !== mainLineId
            && entry.sharedEdges.some((edge) => line.edges.includes(edge)));
        if (group) {
            group.lines.push(line);
            group.sharedEdges = group.sharedEdges.filter((edge) => line.edges.includes(edge));
        } else lineGroups.push({ lines: [line], sharedEdges: line.edges });
    }
    const columnCount = (line) => new Set(line.edges.flatMap((edge) => [positions.get(edge.from).column, positions.get(edge.to).column])).size;
    for (const entry of lineGroups) {
        // 同列延伸的线路先占位，离开共线段的分支线路紧接在下方；锚点取真正共用的区段。
        const group = entry.lines;
        group.sort((a, b) => columnCount(a) - columnCount(b));
        const line = group[0], edges = entry.sharedEdges;
        const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))];
        const columns = new Map();
        for (const id of ids) {
            const column = positions.get(id).column;
            if (!columns.has(column)) columns.set(column, []);
            columns.get(column).push(id);
        }
        // 跨列的线路牌跟随独立区段，共用主干上的站数不决定支线名称放在哪一侧。
        const exclusiveCount = (stations) => stations.filter((id) => stationLines.get(id).size === 1).length;
        const [column, stations] = [...columns].sort((a, b) => exclusiveCount(b[1]) - exclusiveCount(a[1]) || b[1].length - a[1].length
            || b[1].filter((id) => !mainStations.has(id)).length - a[1].filter((id) => !mainStations.has(id)).length
            || Math.abs(a[0]) - Math.abs(b[0]))[0];
        const isMain = line.lineId === mainLineId, side = isMain || column >= 0 ? 'right' : 'left';
        const firstSize = lineSizes.get(line.lineId);
        const metrics = {
            width: Math.max(...group.map((entry) => lineSizes.get(entry.lineId).width)),
            height: group.reduce((height, entry) => height + lineSizes.get(entry.lineId).height, 0) + (group.length - 1) * 8
        };
        const edgeIds = new Set(edges.map((edge) => edge.id));
        const crossings = edges.filter((edge) => (positions.get(edge.from).column === column) !== (positions.get(edge.to).column === column));
        crossings.sort((a, b) => Math.min(distance.get(a.from), distance.get(a.to)) - Math.min(distance.get(b.from), distance.get(b.to)));
        const junctions = stations.filter((id) => adjacent.get(id).some((edge) => !edgeIds.has(edge.id)) || mainStations.has(id));
        junctions.sort((a, b) => distance.get(a) - distance.get(b));
        const crossing = crossings[0];
        let anchorId = crossing ? (positions.get(crossing.from).column === column ? crossing.from : crossing.to) : junctions[0] || stations[0];
        const junctionId = crossing ? (anchorId === crossing.from ? crossing.to : crossing.from) : anchorId;
        const mainPoints = [...mainStations].map((id) => positions.get(id));
        const mainY = (Math.min(...mainPoints.map((point) => point.y)) + Math.max(...mainPoints.map((point) => point.y))) / 2;
        if (isMain) anchorId = [...mainStations].sort((a, b) => Math.abs(positions.get(a).y - mainY) - Math.abs(positions.get(b).y - mainY))[0];
        else if (side === 'right' && !crossing) {
            // 同列直通线放在离开交界后的第一站旁，优先沿该线朝主线以外延伸。
            const nextStations = adjacent.get(junctionId).filter((edge) => edgeIds.has(edge.id))
                .map((edge) => edge.from === junctionId ? edge.to : edge.from).filter((id) => positions.get(id).column === column);
            nextStations.sort((a, b) => Number(distance.get(b) > distance.get(junctionId)) - Number(distance.get(a) > distance.get(junctionId))
                || Math.abs(positions.get(a).y - positions.get(junctionId).y) - Math.abs(positions.get(b).y - positions.get(junctionId).y));
            anchorId = nextStations[0] || anchorId;
        }
        const point = positions.get(anchorId), anchorBox = stationById.get(anchorId);
        // 左侧牌靠在接续站下方，右侧牌靠近该站名称，均保留轨迹和站名原有位置。
        const y = isMain ? mainY : side === 'left' ? point.y + (anchorBox.height + metrics.height) / 2 + 8
            : point.y + (metrics.height - firstSize.height) / 2;
        const baseX = side === 'right' ? anchorBox.right + 18 : point.x + point.leftTrackOffset - 18 - metrics.width;
        const candidates = [y, ...labels.flatMap((label) => [label.y - (label.height + metrics.height) / 2 - 8, label.y + (label.height + metrics.height) / 2 + 8])]
            .sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
        for (const candidateY of candidates) {
            const label = { lineId: line.lineId, anchorId, junctionId, column, side, isMain, width: metrics.width, height: metrics.height, x: baseX, y: candidateY };
            // 在当前高度向外找空白，避开站名、换乘、弯道及其他列，不挪动主线或支线。
            const nearby = obstacles.filter((box) => Math.abs(box.y - label.y) < (box.height + label.height) / 2 + 8)
                .sort((a, b) => side === 'right' ? a.left - b.left : b.right - a.right);
            for (const box of nearby) if (label.x < box.right + 8 && label.x + label.width > box.left - 8) {
                label.x = side === 'right' ? box.right + 18 : box.left - 18 - label.width;
            }
            if (!labels.some((other) => overlaps(label, other))) {
                let top = label.y - metrics.height / 2;
                for (const entry of group) {
                    const size = lineSizes.get(entry.lineId);
                    labels.push({ ...label, lineId: entry.lineId, width: size.width, height: size.height, y: top + size.height / 2 });
                    top += size.height + 8;
                }
                break;
            }
        }
    }
    return labels;
};
