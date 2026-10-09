import { planDiagramLineLabels } from './lineServiceDiagramLineLabels.js';
import { layoutDiagramLegendRows } from './lineServiceDiagramLegendLayout.js';
import { layoutRingDiagram } from './lineServiceDiagramRingLayout.js';
import { getServiceBundleShifts, getServiceEdgeShifts } from './lineServiceDiagramAlignment.js';

// 布局只决定图形空间；种别、交路筛选和停站关系来自已处理的拓扑。
export const layoutLineServiceDiagram = (data, stationSizes, lineSizes = new Map()) => {
    const ring = layoutRingDiagram(data, stationSizes, lineSizes);
    const layout = ring || layoutDiagram(data, stationSizes, lineSizes);
    if (ring) {
        for (const point of layout.positions.values()) point.labelOffset += 6;
        layout.width += 6;
        layout.mainBounds.right += 6;
    }
    const services = layoutServices(data, layout, ring ? getServiceBundleShifts(data, ring.positions) : layout.bundleShifts);
    return { ...layout, ...services, legendRows: layoutDiagramLegendRows(data, layout, services.serviceTracks) };
};

const layoutDiagram = (data, stationSizes, lineSizes) => {
    const edgePaths = new Map(data.serviceEdgePaths.map(({ edgeId, path }) => [edgeId, path]));
    const edgeByPair = new Map(data.topology.edges.map((edge) => [JSON.stringify([edge.from, edge.to].sort()), edge]));
    const expandPath = (path) => path.flatMap((id, index) => {
        if (!index) return [id];
        const edge = edgeByPair.get(JSON.stringify([path[index - 1], id].sort()));
        const projected = edgePaths.get(edge.id);
        return (projected[0] === path[index - 1] ? projected : projected.slice().reverse()).slice(1);
    });
    const geometryEdges = data.topology.edges.filter((edge) => edgePaths.get(edge.id).length === 2).map((edge) => ({
        ...edge, lineIds: [...new Set([...edge.lineIds, ...data.serviceBundles.filter((bundle) => bundle.edgeIds.includes(edge.id)).flatMap((bundle) => bundle.lineIds)])]
    }));
    const stationById = new Map(data.topology.stations.map((station) => [station.id, station]));
    const cycles = data.topology.lineOrders.flatMap((order) => order.paths.flatMap((path) => path.flatMap((id, index) => {
        const end = path.indexOf(id, index + 1), cycle = path.slice(index, end);
        if (end - index < 3 || new Set(cycle).size !== cycle.length) return [];
        return [{ lineId: order.lineId, stations: cycle }];
    })));
    const selectedCycle = cycles.find((cycle) => cycle.lineId === data.selectedLine.id);
    const ringStations = new Set(selectedCycle?.stations || []);
    const mainOrder = (data.selectedLine.stationOrder.length ? data.selectedLine.stationOrder : data.routes[0]?.path || []).slice().reverse();
    // 环段先形成主干，真实支线从分岔站另列接出。
    const backbone = selectedCycle ? mainOrder.filter((id) => ringStations.has(id)) : expandPath(mainOrder);
    const backboneIndex = new Map(backbone.map((id, index) => [id, index]));
    const adjacent = new Map(data.topology.stations.map((station) => [station.id, []]));
    for (const edge of geometryEdges) {
        adjacent.get(edge.from).push(edge.to);
        adjacent.get(edge.to).push(edge.from);
    }
    const laneWidth = Math.max(20, data.trainTypes.length * 20, ...data.serviceBundles.map((bundle) => bundle.types.length * 20));
    const halfWidth = laneWidth / 2;
    const rightTrackOffsets = new Map(), leftTrackOffsets = new Map();
    // 支线缺席的种别不占站名右侧空间，经过但不停车的种别仍计入轨迹边界。
    for (const bundle of data.serviceBundles) bundle.types.forEach((type, index) => {
        const offset = (index - (bundle.types.length - 1) / 2) * 20;
        for (const direction of type.directions) for (const id of direction.stationIds) {
            rightTrackOffsets.set(id, Math.max(rightTrackOffsets.get(id) ?? -Infinity, offset));
            leftTrackOffsets.set(id, Math.min(leftTrackOffsets.get(id) ?? Infinity, offset));
        }
    });
    const turnHeight = Math.max(120, laneWidth + 72);
    const stationGap = 8, stationStep = 22 + stationGap;
    const positions = new Map(backbone.map((id, index) => [id, { column: 0, y: index * stationStep }]));
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
            return geometryEdges.some((edge) => {
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
            const required = ids.reduce((sum, id) => sum + Math.max(stationStep, size(id).height + stationGap), stationStep);
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
        const length = ordered.reduce((sum, id) => sum + Math.max(stationStep, size(id).height + stationGap), 0);
        const isEndpoint = backboneIndex.get(anchorId) === 0 || backboneIndex.get(anchorId) === backbone.length - 1;
        const continues = adjacent.get(anchorId).length === 2;
        const neighbor = continues && adjacent.get(anchorId).map((id) => positions.get(id)).find(Boolean);
        if (neighbor && !backboneIndex.has(anchorId)) direction = Math.sign(anchor.y - neighbor.y) || direction;
        // 交路终点不等于拓扑分岔；后续延伸也应保持原区段的列和方向。
        const ringBranch = ringStations.has(anchorId) && !ringStations.has(ordered[0]);
        const column = chooseColumn(anchor, anchor.y + direction * stationStep, anchor.y + direction * length,
            ringBranch ? [anchor.column + 1] : isEndpoint || continues ? [anchor.column] : []);
        let y = anchor.y;
        for (const id of ordered) {
            y += direction * Math.max(stationStep, size(id).height + stationGap);
            positions.set(id, { column, y });
        }
    };
    const routes = data.routes.slice().sort((a, b) => b.path.length - a.path.length);
    for (const route of routes) {
        let path = expandPath(route.path);
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
        const edge = geometryEdges.find(({ from, to }) => positions.has(from) !== positions.has(to));
        if (!edge) throw new Error('线路图存在无法连接到主干的站点');
        const before = positions.has(edge.from) ? edge.from : edge.to;
        place([positions.has(edge.from) ? edge.to : edge.from], before, null, 1);
    }
    for (const [id, point] of positions) {
        point.rightTrackOffset = rightTrackOffsets.get(id) ?? halfWidth - 10;
        point.leftTrackOffset = leftTrackOffsets.get(id) ?? -halfWidth + 10;
    }
    const cyclePairs = cycles.flatMap(({ stations }) => stations.map((from, at) => [from, stations[(at + 1) % stations.length]]));
    // 同列跨站边保持直连，只有站序明确闭合的边需要绕回，避免把通过区间画成分支。
    const loops = new Set(geometryEdges.filter((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const closesLoop = cyclePairs.some(([from, to]) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
        return closesLoop && a.column === b.column && [...positions].some(([id, point]) => id !== edge.from && id !== edge.to && point.column === a.column && point.y > Math.min(a.y, b.y) && point.y < Math.max(a.y, b.y));
    }).map((edge) => edge.id));
    const bends = new Map(), reserved = new Map();
    const reserveTurn = (id, side, height = turnHeight, columns = null) => {
        const key = `${id}:${side}`;
        const anchor = positions.get(id);
        let delta = height;
        if (columns) {
            const nearby = [...positions].filter(([, point]) => point.column >= columns[0] && point.column <= columns[1]
                && (side === 'after' ? point.y > anchor.y : point.y < anchor.y));
            // 同一站间的分叉和合并各留一份空间，不能重复使用另一端已预留的行带。
            delta = Math.max(0, ...nearby.map(([otherId, point]) => {
                const opposite = reserved.get(`${otherId}:${side === 'after' ? 'before' : 'after'}`) || 0;
                const required = opposite ? Math.max(height, opposite) * 2 : height;
                return required - Math.abs(point.y - anchor.y);
            }));
        } else {
            if (reserved.has(key)) return;
        }
        reserved.set(key, Math.max(reserved.get(key) || 0, height));
        if (delta) shiftBelow(anchor.y + (side === 'after' ? 0.1 : 0), delta);
    };
    // 转弯使用独立的空白行带，避免斜线穿过主干或另一支线的站名、换乘徽标。
    for (const edge of geometryEdges) {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const topId = a.y <= b.y ? edge.from : edge.to, bottomId = topId === edge.from ? edge.to : edge.from;
        const top = positions.get(topId), bottom = positions.get(bottomId);
        if (loops.has(edge.id)) {
            // 闭环从首末站外侧回折，圆弧不再挤占内部站间距。
            bends.set(edge.id, { radius: Math.max(16, halfWidth + Math.max(size(topId).height, size(bottomId).height) / 2 + 6) });
        } else if (a.column !== b.column) {
            const between = [...positions.values()].filter((point) => point.y > top.y && point.y < bottom.y);
            const topObstacles = between.filter((point) => point.column === top.column).length;
            const bottomObstacles = between.filter((point) => point.column === bottom.column).length;
            const ringJunction = ringStations.has(topId) !== ringStations.has(bottomId);
            const junctionId = ringStations.has(topId) ? topId : bottomId;
            // 两端同样空闲时，合并弯道靠接入站放置，使用接入站前的独立留白。
            const joinsBelow = topObstacles === bottomObstacles && adjacent.get(bottomId).length > 2 && adjacent.get(topId).length <= 2;
            const side = ringJunction ? junctionId === topId ? 'after' : 'before' : joinsBelow || bottomObstacles > topObstacles ? 'before' : 'after';
            const baseRadius = Math.max(Math.abs(top.leftTrackOffset), Math.abs(top.rightTrackOffset), Math.abs(bottom.leftTrackOffset), Math.abs(bottom.rightTrackOffset)) + 10;
            // 环段支线直接从分岔站起弧，以更大的半径避开站名；不与环段重叠一截竖线。
            const radius = ringJunction ? baseRadius + size(junctionId).height / 2 + 6 : baseRadius;
            const padding = ringJunction ? 0 : size(topId).height / 2 + 6;
            const height = ringJunction ? radius * 2 : padding + radius * 2 + size(bottomId).height / 2 + 6;
            if (ringJunction) {
                // 站名让开圆弧描边，换乘连接仍以实际轨迹边界为准。
                const junction = positions.get(junctionId);
                junction.labelOffset = junction.rightTrackOffset + 12;
            }
            reserveTurn(side === 'after' ? topId : bottomId, side, height, [Math.min(top.column, bottom.column), Math.max(top.column, bottom.column)]);
            bends.set(edge.id, { side, height, padding, radius });
        }
    }
    const labelOffset = (point) => point.labelOffset ?? point.rightTrackOffset + 6;
    packBranches(geometryEdges, positions, bends, stationSizes, backbone[0], loops);
    // 沿用站名和换乘行的纵向避让，横向边界取各分支自己的实际位置。
    const boxes = [];
    let extra = 0;
    for (const [id, point] of [...positions].sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x)) {
        const metrics = size(id), left = point.x + point.leftTrackOffset - 14 - metrics.transferWidth;
        const right = point.x + labelOffset(point) + metrics.labelWidth;
        let y = point.y + extra;
        for (const box of boxes) if (left < box.right && right > box.left) y = Math.max(y, box.y + (box.height + metrics.height) / 2 + stationGap);
        extra = y - point.y; point.y = y;
        boxes.push({ id, left, right, y, height: metrics.height });
    }
    // 收紧末端直线的空白，只移动末站，不改变分支的接续方向和其他站点。
    for (const box of boxes) {
        const neighbors = adjacent.get(box.id), point = positions.get(box.id);
        if (neighbors.length !== 1) continue;
        const neighbor = positions.get(neighbors[0]);
        if (point.x !== neighbor.x || point.y <= neighbor.y) continue;
        let y = neighbor.y + Math.max(stationStep, (size(box.id).height + size(neighbors[0]).height) / 2 + stationGap);
        for (const other of boxes) if (other !== box && box.left < other.right && box.right > other.left
            && Math.abs(y - other.y) < (box.height + other.height) / 2 + stationGap) {
            y = other.y + (box.height + other.height) / 2 + stationGap;
        }
        if (y < point.y) point.y = box.y = y;
    }
    // 原站距与分支方向确定后，再用整段偏移后的边界分配横向空间。
    const shifts = getServiceBundleShifts(data, positions);
    const edgeShifts = getServiceEdgeShifts(data, positions, bends, shifts);
    const edgeOffsets = new Map(), stationOffsets = new Map();
    for (const bundle of data.serviceBundles) {
        const shift = shifts.get(bundle.id), half = (bundle.types.length - 1) * 10;
        const offsets = { left: shift - half, right: shift + half, half };
        const localOffsets = new Map();
        for (const id of bundle.edgeIds) {
            const edge = geometryEdges.find((edge) => edge.id === id);
            const ends = edgeShifts.get(id) || { from: 0, to: 0 };
            edgeOffsets.set(id, { ...offsets, ...ends });
            for (const end of ['from', 'to']) {
                const previous = localOffsets.get(edge[end]);
                localOffsets.set(edge[end], { left: Math.min(previous?.left ?? Infinity, offsets.left + ends[end]),
                    right: Math.max(previous?.right ?? -Infinity, offsets.right + ends[end]) });
            }
        }
        for (const id of new Set(bundle.types.flatMap((type) => type.directions.flatMap((direction) => direction.stationIds)))) {
            const local = localOffsets.get(id) || offsets;
            const previous = stationOffsets.get(id);
            stationOffsets.set(id, { left: Math.min(previous?.left ?? Infinity, local.left), right: Math.max(previous?.right ?? -Infinity, local.right) });
        }
    }
    for (const [id, point] of positions) {
        const offsets = stationOffsets.get(id);
        point.labelOffset = labelOffset(point) + 6 + (offsets ? offsets.right - point.rightTrackOffset : 0);
        if (offsets) { point.leftTrackOffset = offsets.left; point.rightTrackOffset = offsets.right; }
    }
    const branchGroups = packBranches(geometryEdges, positions, bends, stationSizes, backbone[0], loops, edgeOffsets);
    for (const box of boxes) {
        const point = positions.get(box.id);
        box.left = point.x + point.leftTrackOffset - 14 - size(box.id).transferWidth;
        box.right = point.x + point.labelOffset + size(box.id).labelWidth;
    }
    // 排布完成后，直线按实际描边高度占位，不把横向种别宽度算成纵向空间。
    const getTrackBoxes = (edge) => trackBounds(edge, positions, bends.get(edge.id), edgeOffsets.get(edge.id))
        .map((box, index, boxes) => boxes.length === 3 && index === 1 ? box
            : { ...box, height: box.height - (edgeOffsets.get(edge.id)?.half || 0) * 2 });
    let trackBoxes = geometryEdges.flatMap(getTrackBoxes);
    const loopRelativeX = Math.min(...boxes.map((box) => box.left)) - (loops.size ? laneWidth + 36 : 0) + halfWidth;
    const lineLabels = planDiagramLineLabels(data, positions, lineSizes, boxes, { edges: geometryEdges, trackBoxes });
    for (const group of branchGroups) {
        if (group.ids.some((id) => backboneIndex.has(id))) continue;
        const ids = new Set(group.ids);
        const boundaries = geometryEdges.filter((edge) => ids.has(edge.from) !== ids.has(edge.to));
        if (boundaries.length !== 1) continue;
        const edge = boundaries[0], bend = bends.get(edge.id);
        const point = positions.get(ids.has(edge.from) ? edge.from : edge.to);
        const anchor = positions.get(ids.has(edge.from) ? edge.to : edge.from);
        const direction = Math.sign(anchor.y - point.y);
        if (bend?.side !== (direction > 0 ? 'before' : 'after')) continue;
        let distance = Math.max(0, Math.abs(anchor.y - point.y) - bend.height);
        const labelBoxes = lineLabels.map((label) => ({ id: label.anchorId, left: label.x, right: label.x + label.width, y: label.y, height: label.height }));
        const own = [...boxes, ...labelBoxes].filter((box) => ids.has(box.id));
        own.push(...geometryEdges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).flatMap(getTrackBoxes));
        const others = [...boxes, ...labelBoxes].filter((box) => !ids.has(box.id));
        others.push(...geometryEdges.filter((edge) => !ids.has(edge.from) && !ids.has(edge.to)).flatMap(getTrackBoxes));
        // 单端支线连同站名、换乘和线路牌整体靠近弯道，保留组内站距及沿途已有占用。
        for (const box of own) for (const other of others) {
            if (box.left >= other.right + stationGap || box.right + stationGap <= other.left) continue;
            const gap = direction * (other.y - box.y) - (box.height + other.height) / 2 - stationGap;
            if (gap >= 0) distance = Math.min(distance, gap);
        }
        for (const id of group.ids) positions.get(id).y += direction * distance;
        for (const box of boxes) if (ids.has(box.id)) box.y += direction * distance;
        for (const label of lineLabels) if (ids.has(label.anchorId)) label.y += direction * distance;
    }
    trackBoxes = geometryEdges.flatMap(getTrackBoxes);
    boxes.push(...trackBoxes);
    boxes.push(...lineLabels.map((label) => ({ left: label.x, right: label.x + label.width, y: label.y, height: label.height })));
    const margin = 24;
    const left = Math.min(...boxes.map((box) => box.left), loops.size ? loopRelativeX - halfWidth : Infinity);
    const loopBounds = [...loops].map((id) => {
        const edge = geometryEdges.find((edge) => edge.id === id);
        const a = positions.get(edge.from), b = positions.get(edge.to);
        const extent = bends.get(id).radius + halfWidth;
        return { from: edge.from, to: edge.to, left: loopRelativeX - halfWidth,
            top: Math.min(a.y, b.y) - extent, bottom: Math.max(a.y, b.y) + extent };
    });
    const top = Math.min(...boxes.map((box) => box.y - box.height / 2), ...loopBounds.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right));
    const bottom = Math.max(...boxes.map((box) => box.y + box.height / 2), ...loopBounds.map((box) => box.bottom));
    for (const point of positions.values()) {
        point.x += -left + margin;
        point.y += -top + margin;
    }
    for (const label of lineLabels) {
        label.x += -left + margin;
        label.y += -top + margin;
    }
    const mainPoints = mainOrder.map((id) => ({ ...positions.get(id), id }));
    const mainLoops = loopBounds.filter((box) => ringStations.has(box.from) && ringStations.has(box.to))
        .map((box) => ({ left: box.left - left + margin, top: box.top - top + margin, bottom: box.bottom - top + margin }));
    const mainLeft = Math.min(...mainPoints.map((point) => point.x + point.leftTrackOffset - 14 - size(point.id).transferWidth), ...mainLoops.map((box) => box.left));
    const mainRight = Math.max(...mainPoints.map((point) => point.x + labelOffset(point) + size(point.id).labelWidth));
    const mainLabel = lineLabels.find((label) => label.isMain);
    return {
        positions, loops, bends, lineLabels, laneWidth, bundleShifts: shifts, edgeOffsets, width: right - left + margin * 2, height: bottom - top + margin * 2,
        loopX: loopRelativeX - left + margin,
        mainBounds: { left: Math.min(mainLeft, mainLabel?.x ?? mainLeft), right: Math.max(mainRight, mainLabel ? mainLabel.x + mainLabel.width : mainRight),
            top: Math.min(...mainPoints.map((point) => point.y), mainLabel ? mainLabel.y - mainLabel.height / 2 : Infinity, ...mainLoops.map((box) => box.top)),
            bottom: Math.max(...mainPoints.map((point) => point.y), ...mainLoops.map((box) => box.bottom)) }
    };
};

// 轨道与转弯的占用边界同时用于分支摆放、线路牌避让和画布边界。
const trackBounds = (edge, positions, bend, offsets) => {
    const from = positions.get(edge.from), to = positions.get(edge.to);
    const a = { ...from, x: from.x + (offsets?.from || 0) }, b = { ...to, x: to.x + (offsets?.to || 0) };
    const top = a.y <= b.y ? a : b, bottom = top === a ? b : a;
    const extent = Math.max(Math.abs(a.leftTrackOffset), Math.abs(a.rightTrackOffset), Math.abs(b.leftTrackOffset), Math.abs(b.rightTrackOffset)) + 7;
    const box = (left, right, from, to) => ({ left: left + (offsets ? offsets.left - 7 : -extent),
        right: right + (offsets ? offsets.right + 7 : extent), y: (from + to) / 2,
        height: Math.abs(to - from) + (offsets ? offsets.half + 7 : extent) * 2 });
    if (a.x === b.x) return [box(a.x, a.x, top.y, bottom.y)];
    const height = bend.height, start = (bend.side === 'before' ? bottom.y - height : top.y) + bend.padding;
    const radius = Math.min(bend.radius, Math.abs(a.x - b.x) / 2);
    return [box(top.x, top.x, top.y, start), box(Math.min(a.x, b.x), Math.max(a.x, b.x), start, start + radius * 2),
        box(bottom.x, bottom.x, start + radius * 2, bottom.y)];
};

// 连续直行区段共用横坐标；彼此独立的分支只避让实际占用，不再绑定整列宽度。
const packBranches = (edges, positions, bends, sizes, mainId, loops, edgeOffsets = null) => {
    const originalX = new Map([...positions].map(([id, point]) => [id, point.x]));
    const adjacent = new Map([...positions.keys()].map((id) => [id, []]));
    for (const edge of edges) {
        adjacent.get(edge.from).push(edge);
        adjacent.get(edge.to).push(edge);
    }
    const groups = [], groupByStation = new Map();
    for (const [id, point] of positions) {
        if (groupByStation.has(id)) continue;
        const group = { ids: [id], x: null, index: groups.length };
        groups.push(group); groupByStation.set(id, group);
        for (let index = 0; index < group.ids.length; index += 1) for (const edge of adjacent.get(group.ids[index])) {
            const next = edge.from === group.ids[index] ? edge.to : edge.from;
            if (groupByStation.has(next) || positions.get(next).column !== point.column) continue;
            groupByStation.set(next, group); group.ids.push(next);
        }
    }
    const overlaps = (a, b) => a.left < b.right + 8 && a.right + 8 > b.left && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 8;
    const stationBox = (id) => {
        const point = positions.get(id), metrics = sizes.get(id);
        return { id, kind: 'station', left: point.x + point.leftTrackOffset - 14 - metrics.transferWidth,
            right: point.x + (point.labelOffset ?? point.rightTrackOffset + 6) + metrics.labelWidth, y: point.y, height: metrics.height };
    };
    const localBoxes = (group) => [
        ...group.ids.map(stationBox),
        ...edges.filter((edge) => groupByStation.get(edge.from) === group && groupByStation.get(edge.to) === group)
            .flatMap((edge) => trackBounds(edge, positions, bends.get(edge.id), edgeOffsets?.get(edge.id)).map((box) => ({ ...box, kind: 'track' })))
    ];
    const move = (group, x) => { for (const id of group.ids) positions.get(id).x = x; };
    const main = groupByStation.get(mainId), remaining = new Set(groups.filter((group) => group !== main));
    main.x = 0; move(main, 0);
    const occupied = localBoxes(main).map((box) => ({ ...box, group: main }));
    while (remaining.size) {
        const group = [...remaining].find((entry) => entry.ids.some((id) => adjacent.get(id).some((edge) => {
            const other = edge.from === id ? edge.to : edge.from;
            return groupByStation.get(other).x != null;
        })));
        const connections = edges.filter((edge) => {
            const a = groupByStation.get(edge.from), b = groupByStation.get(edge.to);
            return a === group && b.x != null || b === group && a.x != null;
        });
        const anchorIds = connections.map((edge) => groupByStation.get(edge.from) === group ? edge.to : edge.from);
        const anchor = positions.get(anchorIds[0]);
        move(group, 0);
        const relative = localBoxes(group);
        const candidates = new Set([anchor.x]);
        if (edgeOffsets) for (const id of anchorIds) candidates.add(positions.get(id).x + originalX.get(group.ids[0]) - originalX.get(id));
        const extent = edgeOffsets ? Math.max(...connections.map((edge) => bends.get(edge.id)?.radius || 0))
            : Math.max(...group.ids.flatMap((id) => [Math.abs(positions.get(id).leftTrackOffset), Math.abs(positions.get(id).rightTrackOffset)]),
            ...anchorIds.flatMap((id) => [Math.abs(positions.get(id).leftTrackOffset), Math.abs(positions.get(id).rightTrackOffset)])) + 10;
        candidates.add(anchor.x - extent * 2); candidates.add(anchor.x + extent * 2);
        for (const own of relative) for (const box of occupied) {
            if (Math.abs(own.y - box.y) >= (own.height + box.height) / 2 + 8) continue;
            candidates.add(box.left - 8 - own.right); candidates.add(box.right + 8 - own.left);
        }
        const choices = [];
        for (const x of candidates) {
            // 保留原有分支方向和距离，只在新边界需要时向外扩展。
            if (edgeOffsets && anchorIds.some((id) => {
                const before = originalX.get(group.ids[0]) - originalX.get(id), after = x - positions.get(id).x;
                return Math.sign(after) !== Math.sign(before) || Math.abs(after) < Math.abs(before);
            })) continue;
            if (anchorIds.some((id) => x !== positions.get(id).x && Math.abs(x - positions.get(id).x) < extent * 2)) continue;
            move(group, x);
            const own = localBoxes(group);
            let collisions = own.reduce((count, box) => count + occupied.filter((other) => overlaps(box, other)).length, 0);
            const turns = [];
            for (const edge of connections) {
                const anchorId = groupByStation.get(edge.from) === group ? edge.to : edge.from;
                const parent = groupByStation.get(anchorId), point = positions.get(anchorId);
                const boxes = trackBounds(edge, positions, bends.get(edge.id), edgeOffsets?.get(edge.id));
                for (const box of boxes) for (const other of occupied) {
                    if (!overlaps(box, other) || other.id === anchorId || other.kind === 'track' && other.group === parent) continue;
                    // 同一接续站附近允许独立种别束接入，离开站点后的转弯仍须避让。
                    const shared = other.anchors?.includes(anchorId) && Math.max(box.left, other.left) >= point.x + point.leftTrackOffset - 10
                        && Math.min(box.right, other.right) <= point.x + point.rightTrackOffset + 10;
                    if (!shared) collisions += 1;
                }
                turns.push(...boxes.map((box) => ({ ...box, kind: 'turn', anchors: [edge.from, edge.to], group })));
            }
            choices.push({ x, collisions, distance: Math.abs(x - anchor.x), turns });
        }
        choices.sort((a, b) => a.collisions - b.collisions || a.distance - b.distance || a.x - b.x);
        const choice = choices[0];
        group.x = choice.x; move(group, choice.x); remaining.delete(group);
        occupied.push(...localBoxes(group).map((box) => ({ ...box, group })), ...choice.turns);
    }
    for (const [id, point] of positions) point.column = Math.sign(point.x) * (groupByStation.get(id).index + 1);
    for (const edge of edges) if (positions.get(edge.from).x === positions.get(edge.to).x && !loops.has(edge.id)) bends.delete(edge.id);
    return groups;
};

// 种别保留束内居中位置，整束平移与弯道半径、纵向位置分开计算。
const layoutServices = (data, layout, shifts) => {
    const edgeById = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const serviceTracks = new Map(data.topology.edges.map((edge) => [edge.id, []]));
    const stops = new Map(data.topology.stations.map((station) => [station.id, new Map()]));
    const stationTracks = new Map(data.topology.stations.map((station) => [station.id, []]));
    for (const bundle of data.serviceBundles) bundle.types.forEach((type, index) => {
        const laneOffset = (index - (bundle.types.length - 1) / 2) * 20;
        const shift = shifts.get(bundle.id), offset = laneOffset + shift;
        for (const edgeId of bundle.edgeIds) {
            const edge = edgeById.get(edgeId), from = layout.positions.get(edge.from), to = layout.positions.get(edge.to);
            const ends = layout.edgeOffsets?.get(edgeId);
            const a = { ...from, x: from.x + (ends?.from || 0) }, b = { ...to, x: to.x + (ends?.to || 0) };
            const endpointOffsets = new Map([[edge.from, offset + (ends?.from || 0)], [edge.to, offset + (ends?.to || 0)]]);
            const path = layout.trackPaths?.get(edgeId)?.(laneOffset)
                ?? buildServiceTrackPath(a, b, laneOffset, layout.loops.has(edgeId) ? layout.loopX : null, layout.bends.get(edgeId));
            const track = { type, bundleId: bundle.id, lineIds: bundle.lineIds, offset, shift, path, endpointOffsets };
            serviceTracks.get(edgeId).push(track);
            for (const [stationId, localOffset] of endpointOffsets) stationTracks.get(stationId).push({ type, bundleId: bundle.id, offset: localOffset });
        }
        const stationIds = new Set(type.directions.flatMap((direction) => direction.stopStationIds));
        for (const stationId of stationIds) {
            const offsets = new Set(stationTracks.get(stationId).filter((track) => track.bundleId === bundle.id && track.type === type).map((track) => track.offset));
            if (!offsets.size) offsets.add(offset);
            for (const localOffset of offsets) {
                const local = stops.get(stationId), key = JSON.stringify([type.key, localOffset]);
                if (!local.has(key)) local.set(key, { type, offset: localOffset, sourceTypeIds: new Set(), directions: new Map() });
                const marker = local.get(key);
                for (const id of type.sourceTypeIds) marker.sourceTypeIds.add(id);
                for (const direction of type.directions) {
                    if (!marker.directions.has(direction.ascending)) marker.directions.set(direction.ascending, {
                        ascending: direction.ascending, names: new Set(), stops: false
                    });
                    const entry = marker.directions.get(direction.ascending);
                    for (const name of direction.names) entry.names.add(name);
                    entry.stops ||= direction.stopStationIds.includes(stationId);
                }
            }
        }
    });
    const serviceStops = new Map([...stops].map(([stationId, entries]) => {
        const point = layout.positions.get(stationId);
        const markers = [...entries.values()].map((entry) => {
            const directions = [...entry.directions.values()].sort((a, b) => Number(b.ascending) - Number(a.ascending));
            const stopping = directions.filter((direction) => direction.stops);
            const round = directions.length === 1 || stopping.length === directions.length;
            const sign = stopping.some((direction) => direction.ascending) ? -1 : 1;
            const x = point.x + entry.offset, y = point.y;
            return {
                type: entry.type, sourceTypeIds: [...entry.sourceTypeIds], x, y, round,
                directions: directions.map((direction) => ({ ...direction, names: [...direction.names] })),
                dotY: round ? y : y - sign / 3,
                path: round ? null : `M${x},${y + sign * 5.2}L${x - 4.4},${y - sign * 3.1}L${x + 4.4},${y - sign * 3.1}Z`
            };
        });
        return [stationId, markers];
    }));
    // 不同线路或种别束在站点接续时，用胶囊覆盖原有线段接缝和停站符号。
    const stationCapsules = new Map([...stationTracks].filter(([, tracks]) => new Set(tracks.map((track) => track.bundleId)).size > 1)
        .map(([stationId, tracks]) => {
            const point = layout.positions.get(stationId);
            const left = Math.min(...tracks.map((track) => track.offset)) - 8;
            const right = Math.max(...tracks.map((track) => track.offset)) + 8;
            return [stationId, { x: point.x + left, y: point.y - 8, width: right - left, height: 16 }];
        }));
    return { serviceTracks, serviceStops, stationCapsules };
};

export const buildServiceTrackPath = (a, b, offset, loopX = null, bend = null) => {
    const top = a.y <= b.y ? a : b, bottom = top === a ? b : a;
    if (loopX != null) {
        const x = top.x + offset, side = loopX - offset;
        const radius = (bend?.radius || 16) + offset, first = top.y - radius, last = bottom.y + radius;
        return `M${x},${top.y}A${radius},${radius} 0 0 0 ${x - radius},${first}L${side + radius},${first}A${radius},${radius} 0 0 0 ${side},${top.y}L${side},${bottom.y}A${radius},${radius} 0 0 0 ${side + radius},${last}L${x - radius},${last}A${radius},${radius} 0 0 0 ${x},${bottom.y}`;
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
