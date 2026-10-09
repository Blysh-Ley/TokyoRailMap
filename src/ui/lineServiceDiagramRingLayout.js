import { typeLabelExtensionBox } from './lineServiceDiagramTypeLabels.js';

// 四条环形线路直接设计绘图几何，不经过通用的分支选列和转弯分配。
export const layoutRingDiagram = (data, sizes, lineSizes, reservations) => {
    const order = data.selectedLine.stationOrder;
    switch (data.selectedLine.id) {
    case 'JR-East.Yamanote':
        return layoutClosedRing(data, sizes, lineSizes, order.slice().reverse(), 36, reservations);
    case 'Disney.DisneyResortLine':
        return layoutClosedRing(data, sizes, lineSizes, order.slice().reverse(), 32, reservations);
    case 'Toei.Oedo': {
        const junction = order.indexOf('Toei.Oedo.Tochomae.1');
        return layoutSixRing(data, sizes, lineSizes, [order[0], order[junction]],
            order.slice(1, junction).reverse(), order.slice(junction + 1).map((id) => [id]), 32, reservations);
    }
    case 'Yamaman.Yukarigaoka':
        return layoutSixRing(data, sizes, lineSizes, [order[2], order[6]], order.slice(3, 6).reverse(),
            [[order[1], order[7]], [order[0], order[8]]], 24, reservations);
    default:
        return null;
    }
};

const pointAt = (x, y, column = 0, labelOffset = 6, hideLabel = false) =>
    ({ x, y, column, labelOffset, hideLabel, leftTrackOffset: 0, rightTrackOffset: 0 });
const rowGap = (a, b, sizes) => (sizes.get(a).height + sizes.get(b).height) / 2 + 8;
const edgeBetween = (data, a, b) => data.topology.edges.find((edge) =>
    (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)).id;

const layoutClosedRing = (data, sizes, lineSizes, ids, radius, reservations) => {
    const positions = new Map();
    let y = 0;
    ids.forEach((id, index) => {
        if (index) y += Math.max(rowGap(ids[index - 1], id, sizes), reservations.edgeGaps.get(edgeBetween(data, ids[index - 1], id)) || 0);
        positions.set(id, pointAt(0, y));
    });
    const loopX = Math.min(...ids.map((id) => -20 - sizes.get(id).transferWidth)) - 48;
    const top = { ...positions.get(ids[0]) }, bottom = { ...positions.get(ids.at(-1)) };
    const loopId = edgeBetween(data, ids[0], ids.at(-1));
    const trackPaths = new Map([[loopId, (offset) => {
        const x = top.x + offset, side = loopX - offset, r = radius + offset;
        return `M${x},${top.y}Q${x},${top.y - r} ${x - r},${top.y - r}L${side + r},${top.y - r}Q${side},${top.y - r} ${side},${top.y}L${side},${bottom.y}Q${side},${bottom.y + r} ${side + r},${bottom.y + r}L${x - r},${bottom.y + r}Q${x},${bottom.y + r} ${x},${bottom.y}`;
    }]]);
    return finishLayout(data, sizes, lineSizes, positions, trackPaths, loopId, loopX,
        { top: top.y - radius, bottom: bottom.y + radius }, reservations);
};

const layoutSixRing = (data, sizes, lineSizes, junction, ringIds, branchRows, radius, reservations) => {
    const pairGap = 24, positions = new Map();
    // 环口左点接入外侧回线，右点接入竖直环段；两点各自保留真实站序。
    positions.set(junction[0], pointAt(0, 0, 0, pairGap + 12));
    positions.set(junction[1], pointAt(pairGap, 0, 0, 6, true));
    let y = Math.max(radius * 2, reservations.edgeGaps.get(edgeBetween(data, junction[1], ringIds[0])) || 0);
    ringIds.forEach((id, index) => {
        if (index) y += Math.max(rowGap(ringIds[index - 1], id, sizes), reservations.edgeGaps.get(edgeBetween(data, ringIds[index - 1], id)) || 0);
        positions.set(id, pointAt(pairGap, y));
    });
    let branchX = pairGap + 6 + Math.max(...[...junction.slice(0, 1), ...ringIds].map((id) => sizes.get(id).labelWidth))
        + Math.max(...branchRows.map((row) => sizes.get(row[0]).transferWidth)) + 60;
    const pairedBranch = branchRows[0].length === 2;
    const branchRadius = pairedBranch ? 16 : 24;
    const branchStarts = pairedBranch ? junction : [junction[1]];
    for (const [index, id] of branchStarts.entries()) {
        const width = reservations.horizontalWidths.get(edgeBetween(data, id, branchRows[0][index])) || 0;
        branchX = Math.max(branchX, pairGap + branchRadius * 2 + width);
    }
    let branchY = -(branchRadius * 2 + (pairedBranch ? pairGap : 0) + 12 + sizes.get(branchRows[0][0]).height / 2);
    for (const [index, id] of branchStarts.entries()) {
        branchY = Math.min(branchY, -(reservations.edgeGaps.get(edgeBetween(data, id, branchRows[0][index])) || 0));
    }
    const stationLinks = [{ from: junction[0], to: junction[1] }];
    branchRows.forEach((row, index) => {
        if (index) branchY -= Math.max(rowGap(branchRows[index - 1][0], row[0], sizes),
            ...row.map((id, side) => reservations.edgeGaps.get(edgeBetween(data, branchRows[index - 1][side], id)) || 0));
        row.forEach((id, side) => positions.set(id, pointAt(branchX + side * pairGap, branchY, 1,
            (row.length - 1) * pairGap + 6, side > 0)));
        if (row.length === 2) stationLinks.push({ from: row[0], to: row[1] });
    });
    const loopX = Math.min(...[...positions].filter(([, point]) => !point.hideLabel)
        .map(([id, point]) => point.x - 20 - sizes.get(id).transferWidth)) - 48;
    const first = { ...positions.get(junction[0]) }, last = { ...positions.get(ringIds.at(-1)) };
    const loopId = edgeBetween(data, junction[0], ringIds.at(-1));
    const trackPaths = new Map([[loopId, (offset) => {
        const x = first.x + offset, endX = last.x + offset, side = loopX - offset, r = radius + offset;
        // 从环口向下出发再向左回折，回线的下端与竖直环段顺接。
        return `M${x},${first.y}Q${x},${first.y + r} ${x - r},${first.y + r}L${side + r},${first.y + r}Q${side},${first.y + r} ${side},${first.y + r * 2}L${side},${last.y}Q${side},${last.y + r} ${side + r},${last.y + r}L${endX - r},${last.y + r}Q${endX},${last.y + r} ${endX},${last.y}`;
    }]]);
    branchStarts.forEach((id, index) => {
        const from = { ...positions.get(id) }, targetId = branchRows[0][index], to = { ...positions.get(targetId) };
        const firstRadius = branchRadius + (pairedBranch && index === 0 ? pairGap : 0);
        const lastRadius = branchRadius + (pairedBranch && index === 1 ? pairGap : 0);
        trackPaths.set(edgeBetween(data, id, targetId), (offset) => {
            const x = from.x + offset, endX = to.x + offset, turnY = from.y - firstRadius;
            // 两条支线使用内外嵌套圆角，水平段保持间距，不相互重叠或交叉。
            return `M${x},${from.y}Q${x},${turnY} ${x + firstRadius},${turnY}L${endX - lastRadius},${turnY}Q${endX},${turnY} ${endX},${turnY - lastRadius}L${endX},${to.y}`;
        });
    });
    return finishLayout(data, sizes, lineSizes, positions, trackPaths, loopId, loopX,
        { top: branchY - 12, bottom: last.y + radius }, reservations, stationLinks);
};

// 共用的收尾只计算文字、换乘和轨迹的边界，不决定线路形状。
const finishLayout = (data, sizes, lineSizes, positions, trackPaths, loopId, loopX, trackBounds, reservations, stationLinks = []) => {
    const boxes = [...positions].filter(([, point]) => !point.hideLabel).map(([id, point]) => ({
        column: point.column,
        left: point.x - 20 - sizes.get(id).transferWidth, right: point.x + point.labelOffset + sizes.get(id).labelWidth,
        top: point.y - sizes.get(id).height / 2, bottom: point.y + sizes.get(id).height / 2
    }));
    boxes.push(...typeLabelExtensionBox(reservations.extension, positions).map((box) => ({
        ...box, top: box.y - box.height / 2, bottom: box.y + box.height / 2
    })));
    const lineSize = lineSizes.get(data.selectedLine.id);
    const ringPoints = [...positions.values()].filter((point) => point.column === 0);
    const label = lineSize ? { lineId: data.selectedLine.id, side: 'right', isMain: true, ...lineSize,
        x: Math.max(...boxes.filter((box) => box.column === 0).map((box) => box.right)) + 18,
        y: (Math.min(...ringPoints.map((point) => point.y)) + Math.max(...ringPoints.map((point) => point.y))) / 2 } : null;
    const left = loopX - 5, top = Math.min(trackBounds.top - 5, ...boxes.map((box) => box.top));
    const right = Math.max(...boxes.map((box) => box.right), label ? label.x + label.width : -Infinity);
    const bottom = Math.max(trackBounds.bottom + 5, ...boxes.map((box) => box.bottom));
    const dx = 24 - left, dy = 24 - top;
    // 保留路径闭包中的原坐标，最终 SVG 路径统一平移到带边距的画布。
    const paths = new Map([...trackPaths].map(([id, build]) => [id, (offset) =>
        build(offset).replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${Number(x) + dx},${Number(y) + dy}`)]));
    for (const point of positions.values()) { point.x += dx; point.y += dy; }
    if (label) { label.x += dx; label.y += dy; }
    return { positions, trackPaths: paths, loops: new Set([loopId]), bends: new Map([...paths.keys()].map((id) => [id, {}])),
        stationLinks, lineLabels: label ? [label] : [], laneWidth: Math.max(20, data.trainTypes.length * 20), loopX: loopX + dx,
        width: right - left + 48, height: bottom - top + 48,
        mainBounds: { left: 24, right: right + dx,
            top: 24,
            bottom: bottom + dy } };
};
