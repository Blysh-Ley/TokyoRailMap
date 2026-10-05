import { planDiagramLineLabels } from './lineServiceDiagramLineLabels.js';

// 布局只决定图形空间；种别、交路筛选和停站关系来自已处理的拓扑。
export const layoutLineServiceDiagram = (data, stationSizes, lineSizes = new Map()) => {
    const stationById = new Map(data.topology.stations.map((station) => [station.id, station]));
    const backbone = (data.selectedLine.stationOrder.length ? data.selectedLine.stationOrder : data.routes[0]?.path || []).slice().reverse();
    const backboneIndex = new Map(backbone.map((id, index) => [id, index]));
    const adjacent = new Map(data.topology.stations.map((station) => [station.id, []]));
    for (const edge of data.topology.edges) {
        adjacent.get(edge.from).push(edge.to);
        adjacent.get(edge.to).push(edge.from);
    }
    const laneWidth = Math.max(12, data.trainTypes.length * 12);
    const halfWidth = laneWidth / 2;
    const rightTrackOffsets = new Map(), leftTrackOffsets = new Map();
    // 支线缺席的种别不占站名右侧空间，经过但不停车的种别仍计入轨迹边界。
    data.trainTypes.forEach((type, index) => {
        const offset = (index - (data.trainTypes.length - 1) / 2) * 12;
        for (const direction of type.directions) for (const id of direction.stationIds) {
            rightTrackOffsets.set(id, offset);
            if (!leftTrackOffsets.has(id)) leftTrackOffsets.set(id, offset);
        }
    });
    const pitch = Math.max(240, laneWidth + 160);
    const turnHeight = Math.max(120, laneWidth + 72);
    const positions = new Map(backbone.map((id, index) => [id, { column: 0, y: index * 26 }]));
    const size = (id) => stationSizes.get(id);
    const shiftBelow = (boundary, delta) => {
        for (const point of positions.values()) if (point.y >= boundary) point.y += delta;
    };
    const chooseColumn = (anchor, from, to, preferredColumns = []) => {
        const used = [...positions.values()].map((point) => point.column);
        const min = Math.min(0, ...used), max = Math.max(0, ...used);
        const occupied = (column) => {
            const top = Math.min(from, to) - 12, bottom = Math.max(from, to) + 12;
            if ([...positions.values()].some((point) => point.column === column && point.y > top && point.y < bottom)) return true;
            // 站间轨迹也占用整段列空间，不能把另一支线塞进两站之间的空隙。
            return data.topology.edges.some((edge) => {
                const a = positions.get(edge.from), b = positions.get(edge.to);
                return a?.column === column && b?.column === column && Math.min(a.y, b.y) < bottom && Math.max(a.y, b.y) > top;
            });
        };
        for (const column of new Set(preferredColumns)) if (!occupied(column)) return column;
        const candidates = [];
        for (let distance = 1; distance <= max - min + 2; distance += 1) {
            for (const column of [anchor.column - distance, anchor.column + distance]) {
                if (!occupied(column)) candidates.push({ column, cost: distance * 10 + (Math.max(max, column) - Math.min(min, column)) * 3 });
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
            const step = Math.abs(end.y - start.y) / (ids.length + 1);
            // 双端接续优先沿用已有列，不把中间的无分岔区段另放到第三列。
            const column = chooseColumn(start, start.y + direction * step, end.y - direction * step, [start.column, end.column]);
            ids.forEach((id, index) => positions.set(id, { column, y: start.y + direction * step * (index + 1) }));
            return;
        }
        const anchorId = start ? before : after;
        const anchor = start || end;
        const ordered = start ? ids : ids.slice().reverse();
        let direction = start ? sign : -sign;
        const length = ordered.reduce((sum, id) => sum + Math.max(26, size(id).height + 4), 0);
        const isEndpoint = backboneIndex.get(anchorId) === 0 || backboneIndex.get(anchorId) === backbone.length - 1;
        const continues = adjacent.get(anchorId).length === 2;
        const neighbor = continues && adjacent.get(anchorId).map((id) => positions.get(id)).find(Boolean);
        if (neighbor && !backboneIndex.has(anchorId)) direction = Math.sign(anchor.y - neighbor.y) || direction;
        // 交路终点不等于拓扑分岔；后续延伸也应保持原区段的列和方向。
        const column = chooseColumn(anchor, anchor.y + direction * 26, anchor.y + direction * length, isEndpoint || continues ? [anchor.column] : []);
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
    for (const [id, point] of positions) {
        point.rightTrackOffset = rightTrackOffsets.get(id) ?? halfWidth - 6;
        point.leftTrackOffset = leftTrackOffsets.get(id) ?? -halfWidth + 6;
    }
    const cyclePairs = data.topology.lineOrders.flatMap((order) => order.paths.flatMap((path) => path.flatMap((id, index) => {
        const end = path.indexOf(id, index + 1), cycle = path.slice(index, end);
        if (end - index < 3 || new Set(cycle).size !== cycle.length) return [];
        return cycle.map((from, at) => [from, path[index + at + 1]]);
    })));
    // 同列跨站边保持直连，只有站序明确闭合的边需要绕回，避免把通过区间画成分支。
    const loops = new Set(data.topology.edges.filter((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const closesLoop = cyclePairs.some(([from, to]) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
        return closesLoop && a.column === b.column && [...positions].some(([id, point]) => id !== edge.from && id !== edge.to && point.column === a.column && point.y > Math.min(a.y, b.y) && point.y < Math.max(a.y, b.y));
    }).map((edge) => edge.id));
    const bends = new Map(), reserved = new Set();
    const reserveTurn = (id, side, height = turnHeight, columns = null) => {
        const key = `${id}:${side}`;
        const anchor = positions.get(id);
        let delta = height;
        if (columns) {
            const nearby = [...positions.values()].filter((point) => point.column >= columns[0] && point.column <= columns[1]
                && (side === 'after' ? point.y > anchor.y : point.y < anchor.y));
            const gap = Math.min(...nearby.map((point) => Math.abs(point.y - anchor.y)));
            delta = Math.max(0, height - gap);
        } else {
            if (reserved.has(key)) return;
            reserved.add(key);
        }
        if (delta) shiftBelow(anchor.y + (side === 'after' ? 0.1 : 0), delta);
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
            const radius = Math.max(Math.abs(top.leftTrackOffset), Math.abs(top.rightTrackOffset), Math.abs(bottom.leftTrackOffset), Math.abs(bottom.rightTrackOffset)) + 10;
            const padding = size(topId).height / 2 + 6;
            const height = padding + radius * 2 + size(bottomId).height / 2 + 6;
            reserveTurn(side === 'after' ? topId : bottomId, side, height, [Math.min(top.column, bottom.column), Math.max(top.column, bottom.column)]);
            bends.set(edge.id, { side, height, padding, radius });
        }
    }
    const columns = [...new Set([...positions.values()].map((point) => point.column))].sort((a, b) => a - b);
    const columnX = new Map([[columns[0], 0]]);
    for (let index = 1; index < columns.length; index += 1) {
        const previous = columns[index - 1], column = columns[index];
        const previousPoints = [...positions].filter(([, point]) => point.column === previous);
        const currentPoints = [...positions].filter(([, point]) => point.column === column);
        const labelRight = Math.max(...previousPoints.map(([id, point]) => point.rightTrackOffset + 6 + size(id).labelWidth));
        const transferWidth = Math.max(...currentPoints.map(([id]) => size(id).transferWidth));
        let occupiedWidth = Math.max(laneWidth + 16, labelRight + halfWidth + 14);
        for (const [leftId, leftPoint] of previousPoints) for (const [rightId, rightPoint] of currentPoints) {
            const leftSize = size(leftId), rightSize = size(rightId);
            if (Math.abs(leftPoint.y - rightPoint.y) < (leftSize.height + rightSize.height) / 2 + 4) {
                occupiedWidth = Math.max(occupiedWidth, leftPoint.rightTrackOffset + 6 + leftSize.labelWidth + halfWidth + 14 + rightSize.transferWidth);
            }
        }
        // 保留同高站名、轨迹和换乘的宽度，其余横向留白缩至原来的三分之一。
        const previousGap = Math.max(pitch, halfWidth + 28 + labelRight + transferWidth);
        columnX.set(column, columnX.get(previous) + occupiedWidth + (previousGap - occupiedWidth) / 3);
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
        point.x = x;
        boxes.push({ id, left, right, y, height: metrics.height });
    }
    const loopRelativeX = Math.min(...boxes.map((box) => box.left)) - (loops.size ? laneWidth + 36 : 0) + halfWidth;
    const lineLabels = planDiagramLineLabels(data, positions, lineSizes, boxes, { laneWidth, loops, loopX: loopRelativeX });
    boxes.push(...lineLabels.map((label) => ({ left: label.x, right: label.x + label.width, y: label.y, height: label.height })));
    const margin = 24;
    const left = Math.min(...boxes.map((box) => box.left), loops.size ? loopRelativeX - halfWidth : Infinity);
    const top = Math.min(...boxes.map((box) => box.y - box.height / 2));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height / 2));
    for (const point of positions.values()) {
        point.x = columnX.get(point.column) - left + margin;
        point.y += -top + margin;
    }
    for (const label of lineLabels) {
        label.x += -left + margin;
        label.y += -top + margin;
    }
    const mainPoints = backbone.map((id) => ({ ...positions.get(id), id }));
    const mainLeft = Math.min(...mainPoints.map((point) => point.x - halfWidth - 14 - size(point.id).transferWidth));
    const mainRight = Math.max(...mainPoints.map((point) => point.x + point.rightTrackOffset + 6 + size(point.id).labelWidth));
    const mainLabel = lineLabels.find((label) => label.isMain);
    return {
        positions, loops, bends, lineLabels, laneWidth, width: right - left + margin * 2, height: bottom - top + margin * 2,
        loopX: loopRelativeX - left + margin,
        mainBounds: { left: Math.min(mainLeft, mainLabel?.x ?? mainLeft), right: Math.max(mainRight, mainLabel ? mainLabel.x + mainLabel.width : mainRight),
            top: Math.min(...mainPoints.map((point) => point.y), mainLabel ? mainLabel.y - mainLabel.height / 2 : Infinity), bottom: Math.max(...mainPoints.map((point) => point.y)) }
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
    const startY = (bend?.side === 'before' ? bottom.y - height : top.y) + (bend?.padding ?? 24);
    const sign = Math.sign(bottom.x - top.x), radius = Math.min(bend?.radius ?? (height - 48) / 2, Math.abs(bottom.x - top.x) / 2);
    const firstRadius = radius - sign * offset, lastRadius = radius + sign * offset;
    const firstX = top.x + sign * radius, lastX = bottom.x - sign * radius;
    const middleY = startY + radius - sign * offset;
    // 两段圆弧与横线保持种别间距；转弯前后留出站名和换乘徽标的空间。
    return `M${top.x + offset},${top.y}L${top.x + offset},${startY}A${firstRadius},${firstRadius} 0 0 ${sign > 0 ? 0 : 1} ${firstX},${middleY}L${lastX},${middleY}A${lastRadius},${lastRadius} 0 0 ${sign > 0 ? 1 : 0} ${bottom.x + offset},${startY + radius * 2}L${bottom.x + offset},${bottom.y}`;
};
