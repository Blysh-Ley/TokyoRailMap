// 布局只决定图形空间；种别、交路筛选和停站关系来自已处理的拓扑。
export const layoutLineServiceDiagram = (data, stationSizes) => {
    const stationById = new Map(data.topology.stations.map((station) => [station.id, station]));
    const backbone = (data.selectedLine.stationOrder.length ? data.selectedLine.stationOrder : data.routes[0]?.path || []).slice().reverse();
    const backboneIndex = new Map(backbone.map((id, index) => [id, index]));
    const laneWidth = Math.max(12, data.trainTypes.length * 12);
    const halfWidth = laneWidth / 2;
    const rightTrackOffsets = new Map();
    // 支线缺席的种别不占站名右侧空间，经过但不停车的种别仍计入轨迹边界。
    data.trainTypes.forEach((type, index) => {
        const offset = (index - (data.trainTypes.length - 1) / 2) * 12;
        for (const direction of type.directions) for (const id of direction.stationIds) rightTrackOffsets.set(id, offset);
    });
    const pitch = Math.max(240, laneWidth + 160);
    const turnHeight = Math.max(120, laneWidth + 72);
    const positions = new Map(backbone.map((id, index) => [id, { column: 0, y: index * 26 }]));
    const size = (id) => stationSizes.get(id);
    const shiftBelow = (boundary, delta) => {
        for (const point of positions.values()) if (point.y >= boundary) point.y += delta;
    };
    const chooseColumn = (anchor, from, to, keepColumn) => {
        const used = [...positions.values()].map((point) => point.column);
        const min = Math.min(0, ...used), max = Math.max(0, ...used);
        const candidates = [];
        for (let distance = keepColumn ? 0 : 1; distance <= max - min + 2; distance += 1) {
            for (const column of distance ? [anchor.column - distance, anchor.column + distance] : [anchor.column]) {
                const occupied = [...positions.values()].some((point) => point.column === column && point.y > Math.min(from, to) - 12 && point.y < Math.max(from, to) + 12);
                if (!occupied) candidates.push({ column, cost: distance * 10 + (Math.max(max, column) - Math.min(min, column)) * 3 });
            }
        }
        candidates.sort((a, b) => a.cost - b.cost);
        return candidates[0].column;
    };
    const place = (ids, before, after, sign) => {
        const start = positions.get(before), end = positions.get(after);
        if (start && end) {
            const required = ids.reduce((sum, id) => sum + Math.max(26, size(id).height + 4), 26);
            const span = Math.abs(end.y - start.y);
            if (span < required) shiftBelow(Math.max(start.y, end.y), required - span);
            const direction = Math.sign(end.y - start.y) || 1;
            const column = chooseColumn(start, start.y, end.y, false);
            const step = Math.abs(end.y - start.y) / (ids.length + 1);
            ids.forEach((id, index) => positions.set(id, { column, y: start.y + direction * step * (index + 1) }));
            return;
        }
        const anchorId = start ? before : after;
        const anchor = start || end;
        const ordered = start ? ids : ids.slice().reverse();
        const direction = start ? sign : -sign;
        const length = ordered.reduce((sum, id) => sum + Math.max(26, size(id).height + 4), 0);
        const isEndpoint = backboneIndex.get(anchorId) === 0 || backboneIndex.get(anchorId) === backbone.length - 1;
        const column = chooseColumn(anchor, anchor.y + direction * 26, anchor.y + direction * length, isEndpoint);
        let y = anchor.y;
        for (const id of ordered) {
            y += direction * Math.max(26, size(id).height + 4);
            positions.set(id, { column, y });
        }
    };
    const routes = data.routes.slice().sort((a, b) => b.path.length - a.path.length);
    for (const route of routes) {
        let path = route.path.slice();
        const anchors = path.filter((id) => backboneIndex.has(id));
        if (anchors.length > 1 && backboneIndex.get(anchors[0]) > backboneIndex.get(anchors.at(-1))) path.reverse();
        const singleAnchor = anchors.length === 1 ? backboneIndex.get(anchors[0]) : null;
        const singleSign = singleAnchor != null && singleAnchor < backbone.length / 2 ? -1 : 1;
        for (let index = 0; index < path.length;) {
            if (positions.has(path[index])) { index += 1; continue; }
            const from = index;
            while (index < path.length && !positions.has(path[index])) index += 1;
            const before = path[from - 1], after = path[index];
            let sign = 1;
            if (singleAnchor != null) sign = before ? singleSign : -singleSign;
            if (!before && !after) continue;
            place(path.slice(from, index), before, after, sign);
        }
    }
    // 处理结果中的边也提供连接依据，覆盖不属于独立长交路的主干节点。
    while (positions.size < stationById.size) {
        const edge = data.topology.edges.find(({ from, to }) => positions.has(from) !== positions.has(to));
        if (!edge) throw new Error('线路图存在无法连接到主干的站点');
        const before = positions.has(edge.from) ? edge.from : edge.to;
        place([positions.has(edge.from) ? edge.to : edge.from], before, null, 1);
    }
    for (const [id, point] of positions) point.rightTrackOffset = rightTrackOffsets.get(id) ?? halfWidth - 6;
    const loops = new Set(data.topology.edges.filter((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        return a.column === b.column && [...positions].some(([id, point]) => id !== edge.from && id !== edge.to && point.column === a.column && point.y > Math.min(a.y, b.y) && point.y < Math.max(a.y, b.y));
    }).map((edge) => edge.id));
    const bends = new Map(), reserved = new Set();
    const reserveTurn = (id, side) => {
        const key = `${id}:${side}`;
        if (reserved.has(key)) return;
        reserved.add(key);
        shiftBelow(positions.get(id).y + (side === 'after' ? 0.1 : 0), turnHeight);
    };
    // 转弯使用独立的空白行带，避免斜线穿过主干或另一支线的站名、换乘徽标。
    for (const edge of data.topology.edges) {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const topId = a.y <= b.y ? edge.from : edge.to, bottomId = topId === edge.from ? edge.to : edge.from;
        const top = positions.get(topId), bottom = positions.get(bottomId);
        if (loops.has(edge.id)) {
            reserveTurn(topId, 'after');
            reserveTurn(bottomId, 'before');
            bends.set(edge.id, { height: turnHeight });
        } else if (a.column !== b.column) {
            const between = [...positions.values()].filter((point) => point.y > top.y && point.y < bottom.y);
            const topObstacles = between.filter((point) => point.column === top.column).length;
            const bottomObstacles = between.filter((point) => point.column === bottom.column).length;
            const side = bottomObstacles <= topObstacles ? 'after' : 'before';
            reserveTurn(side === 'after' ? topId : bottomId, side);
            bends.set(edge.id, { side, height: turnHeight });
        }
    }
    const columns = [...new Set([...positions.values()].map((point) => point.column))].sort((a, b) => a - b);
    const columnX = new Map([[columns[0], 0]]);
    for (let index = 1; index < columns.length; index += 1) {
        const previous = columns[index - 1], column = columns[index];
        const labelRight = Math.max(...[...positions].filter(([, point]) => point.column === previous).map(([id, point]) => point.rightTrackOffset + 6 + size(id).labelWidth));
        const transferWidth = Math.max(...[...positions].filter(([, point]) => point.column === column).map(([id]) => size(id).transferWidth));
        columnX.set(column, columnX.get(previous) + Math.max(pitch, halfWidth + 28 + labelRight + transferWidth));
    }
    // 横向区域相交的站名和换乘徽标错开行，分支保持靠近主干。
    const boxes = [];
    let extra = 0;
    for (const [id, point] of [...positions].sort((a, b) => a[1].y - b[1].y || a[1].column - b[1].column)) {
        const metrics = size(id), x = columnX.get(point.column);
        const left = x - halfWidth - 14 - metrics.transferWidth;
        const right = x + point.rightTrackOffset + 6 + metrics.labelWidth;
        let y = point.y + extra;
        for (const box of boxes) if (left < box.right && right > box.left) {
            y = Math.max(y, box.y + (box.height + metrics.height) / 2 + 4);
        }
        extra = y - point.y;
        point.y = y;
        boxes.push({ left, right, y, height: metrics.height });
    }
    const margin = 24;
    const left = Math.min(...boxes.map((box) => box.left)) - (loops.size ? laneWidth + 36 : 0);
    const top = Math.min(...boxes.map((box) => box.y - box.height / 2));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height / 2));
    for (const point of positions.values()) {
        point.x = columnX.get(point.column) - left + margin;
        point.y += -top + margin;
    }
    const mainPoints = backbone.map((id) => ({ ...positions.get(id), id }));
    const mainLeft = Math.min(...mainPoints.map((point) => point.x - halfWidth - 14 - size(point.id).transferWidth));
    const mainRight = Math.max(...mainPoints.map((point) => point.x + point.rightTrackOffset + 6 + size(point.id).labelWidth));
    return {
        positions, loops, bends, laneWidth, width: right - left + margin * 2, height: bottom - top + margin * 2,
        loopX: margin + halfWidth,
        mainBounds: { left: mainLeft, right: mainRight, top: Math.min(...mainPoints.map((point) => point.y)), bottom: Math.max(...mainPoints.map((point) => point.y)) }
    };
};

export const buildServiceTrackPath = (a, b, offset, loopX = null, bend = null) => {
    const top = a.y <= b.y ? a : b, bottom = top === a ? b : a;
    if (loopX != null) {
        const x = top.x + offset, side = loopX + offset, height = bend?.height || 120;
        const radius = 16, first = top.y + height / 2, last = bottom.y - height / 2;
        return `M${x},${top.y}L${x},${first - radius}Q${x},${first} ${x - radius},${first}L${side + radius},${first}Q${side},${first} ${side},${first + radius}L${side},${last - radius}Q${side},${last} ${side + radius},${last}L${x - radius},${last}Q${x},${last} ${x},${last + radius}L${x},${bottom.y}`;
    }
    if (a.x === b.x) return `M${a.x + offset},${a.y}L${b.x + offset},${b.y}`;
    const height = bend?.height || bottom.y - top.y;
    const startY = (bend?.side === 'before' ? bottom.y - height : top.y) + 24;
    const sign = Math.sign(bottom.x - top.x), radius = Math.min((height - 48) / 2, Math.abs(bottom.x - top.x) / 2);
    const firstRadius = radius - sign * offset, lastRadius = radius + sign * offset;
    const firstX = top.x + sign * radius, lastX = bottom.x - sign * radius;
    const middleY = startY + radius - sign * offset;
    // 两段圆弧与横线保持种别间距；转弯前后留出站名和换乘徽标的空间。
    return `M${top.x + offset},${top.y}L${top.x + offset},${startY}A${firstRadius},${firstRadius} 0 0 ${sign > 0 ? 0 : 1} ${firstX},${middleY}L${lastX},${middleY}A${lastRadius},${lastRadius} 0 0 ${sign > 0 ? 1 : 0} ${bottom.x + offset},${startY + radius * 2}L${bottom.x + offset},${bottom.y}`;
};
