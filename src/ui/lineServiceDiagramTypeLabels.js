import { getDiagramDrawingEdges, getDiagramCrossingTracks, getDiagramTrackOccluders } from './lineServiceDiagramTrackVisibility.js';
import { measureTypeLabel } from '../lib/typeLabelText.js';

const padding = 6;
const metricFor = (type, sizes) => sizes.get(type.name) || measureTypeLabel(type.name);

// 读取绘图函数已经生成的线段与圆角，文字使用与轨道相同的最终几何。
const trackParts = (track) => {
    const commands = [...track.path.matchAll(/([MLAQ])([^MLAQ]*)/g)];
    let point;
    return commands.flatMap(([ , command, values], index) => {
        const numbers = values.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
        const to = { x: numbers.at(-2) + track.shift, y: numbers.at(-1) }, from = point;
        point = to;
        if (command === 'M') return [];
        const at = command === 'Q' ? (t) => ({
            x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * (numbers[0] + track.shift) + t ** 2 * to.x,
            y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * numbers[1] + t ** 2 * to.y
        }) : command === 'A' ? quarterArc(from, to, numbers[4])
            : (t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
        const curvedNeighbors = /[AQ]/.test(commands[index - 1][1]) && /[AQ]/.test(commands[index + 1]?.[1] || '');
        const horizontal = from.y === to.y && (from.x !== to.x || curvedNeighbors);
        return [{ index, command, orientation: horizontal ? 'horizontal' : 'vertical', from, to, at }];
    });
};

// 现有轨道的 A 指令都是轴对齐四分之一圆弧，两种圆心中按转向取实际圆心。
const quarterArc = (from, to, sweep) => {
    const first = { x: from.x, y: to.y }, second = { x: to.x, y: from.y };
    const cross = (from.x - first.x) * (to.y - first.y) - (from.y - first.y) * (to.x - first.x);
    const center = Number(cross > 0) === sweep ? first : second;
    const radius = Math.hypot(from.x - center.x, from.y - center.y);
    const angle = Math.atan2(from.y - center.y, from.x - center.x), turn = (sweep ? 1 : -1) * Math.PI / 2;
    return (t) => ({ x: center.x + radius * Math.cos(angle + turn * t), y: center.y + radius * Math.sin(angle + turn * t) });
};

const diagramParts = (data, layout, services) => {
    const drawingEdges = getDiagramDrawingEdges(data, layout);
    const straightEdges = drawingEdges.filter((edge) => !layout.bends.has(edge.id));
    return new Map(drawingEdges.map((edge) => {
        const tracks = services.serviceTracks.get(edge.id);
        const crossing = getDiagramCrossingTracks(edge, layout, straightEdges, services.serviceTracks);
        return [edge.id, { parts: tracks.map(trackParts),
            masks: tracks.map((track) => getDiagramTrackOccluders(track, crossing).flatMap(trackParts)) }];
    }));
};

const blockedRange = (part, axis, across) => {
    const crossAxis = axis === 'x' ? 'y' : 'x';
    // 十四像素色带和十七像素清底描边共同决定相交占用。
    const low = across - 15.5, high = across + 15.5;
    const a = part.from[crossAxis], b = part.to[crossAxis];
    if (Math.max(a, b) < low || Math.min(a, b) > high) return null;
    const parameter = (value) => {
        if (a === b) return 0;
        const target = Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
        let start = 0, end = 1;
        for (let index = 0; index < 24; index += 1) {
            const middle = (start + end) / 2;
            if ((part.at(middle)[crossAxis] < target) === (a < b)) start = middle;
            else end = middle;
        }
        return (start + end) / 2;
    };
    const first = part.at(a === b ? 0 : parameter(low))[axis];
    const last = part.at(a === b ? 1 : parameter(high))[axis];
    return [Math.min(first, last) - 8.5 - padding, Math.max(first, last) + 8.5 + padding];
};

const edgeSlots = (edgeId, layout, stationSizes, edgeById, geometry) => {
    const { parts, masks } = geometry.get(edgeId), edge = edgeById.get(edgeId);
    const ordered = [...geometry];
    // 扣除后绘制轨道，以及接点遮罩中仍会透出的先绘制轨道。
    const obstacles = ordered.slice(ordered.findIndex(([id]) => id === edgeId) + 1).flatMap(([, item]) => item.parts.flat());
    const vertical = parts[0].filter((part) => part.command === 'L' && part.orientation === 'vertical');
    const bend = layout.bends.get(edgeId);
    return parts[0].filter((part) => part.command === 'L').flatMap((part) => {
        const segments = parts.map((list) => list.find((candidate) => candidate.index === part.index));
        if (!segments.every((segment) => segment?.orientation === part.orientation)) return [];
        const axis = part.orientation === 'horizontal' ? 'x' : 'y', crossAxis = axis === 'x' ? 'y' : 'x';
        let start = Math.max(...segments.map(({ from, to }) => Math.min(from[axis], to[axis])));
        let end = Math.min(...segments.map(({ from, to }) => Math.max(from[axis], to[axis])));
        const rawLength = end - start;
        if (axis === 'y') {
            for (const id of [edge.from, edge.to]) {
                const y = layout.positions.get(id).y, half = Math.max(8, stationSizes.get(id).height / 2);
                if (Math.abs(y - start) < 0.01) start += half;
                if (Math.abs(y - end) < 0.01) end -= half;
            }
        }
        start += padding; end -= padding;
        let spaces = [[start, end]];
        for (const [index, segment] of segments.entries()) for (const obstacle of [...obstacles, ...masks[index]]) {
            if (Math.max(obstacle.from[axis], obstacle.to[axis]) + 14.5 < start
                || Math.min(obstacle.from[axis], obstacle.to[axis]) - 14.5 > end) continue;
            const blocked = blockedRange(obstacle, axis, segment.from[crossAxis]);
            if (!blocked) continue;
            spaces = spaces.flatMap(([a, b]) => {
                if (blocked[1] <= a || blocked[0] >= b) return [[a, b]];
                return [...(blocked[0] > a ? [[a, blocked[0]]] : []), ...(blocked[1] < b ? [[blocked[1], b]] : [])];
            });
        }
        const space = spaces.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || [start, start];
        return [{ edgeId, index: part.index, orientation: part.orientation, segments,
            start: space[0], end: space[1], length: space[1] - space[0], rawLength,
            growable: axis === 'x' || !bend?.side || part.index === (bend.side === 'before' ? vertical[0]?.index : vertical.at(-1)?.index) }];
    });
};

export const planDiagramTypeLabels = (data, layout, services, stationSizes, typeSizes) => {
    const edges = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const geometry = diagramParts(data, layout, services);
    const slots = [];
    let extension = null;
    for (const section of data.serviceLabelSections) {
        const anchor = layout.positions.get(section.anchorId);
        const candidates = section.edgeIds.flatMap((id) => edgeSlots(id, layout, stationSizes, edges, geometry)).filter((slot) => slot.growable);
        let chosen;
        if (section.primary) {
            const incident = data.topology.edges.filter((edge) => services.serviceTracks.get(edge.id).length
                && [edge.from, edge.to].includes(section.anchorId));
            const above = incident.filter((edge) => layout.positions.get(edge.from === section.anchorId ? edge.to : edge.from).y < anchor.y);
            const onLoop = incident.some((edge) => layout.loops.has(edge.id));
            if (!above.length && !onLoop) {
                const edgeId = section.edgeIds.find((id) => [edges.get(id).from, edges.get(id).to].includes(section.anchorId));
                const height = Math.max(...services.serviceTracks.get(edgeId).map(({ type }) => metricFor(type, typeSizes).height));
                extension = { stationId: section.anchorId, edgeId,
                    length: height + padding * 2 + Math.max(8, stationSizes.get(section.anchorId).height / 2) };
                slots.push({ ...section, edgeId, orientation: 'vertical', extension: true });
                continue;
            }
            // 先占用起始站上方的相同种别区段，例如高砂与青砥之间。
            chosen = above.filter((edge) => section.entryEdgeIds.includes(edge.id))
                .flatMap((edge) => edgeSlots(edge.id, layout, stationSizes, edges, geometry))
                .filter((slot) => slot.growable && slot.orientation === 'vertical' && !layout.loops.has(slot.edgeId))
                .sort((a, b) => b.length - a.length)[0];
            chosen ||= candidates.filter((slot) => slot.growable && slot.orientation === 'vertical' && !layout.loops.has(slot.edgeId))
                .sort((a, b) => Math.abs(a.start - anchor.y) - Math.abs(b.start - anchor.y))[0];
        } else {
            chosen = candidates.filter((slot) => slot.orientation === 'horizontal' && !layout.loops.has(slot.edgeId))
                .sort((a, b) => b.length - a.length)[0];
        }
        chosen ||= candidates.filter((slot) => slot.growable && slot.orientation === 'vertical' && !layout.loops.has(slot.edgeId))
            .sort((a, b) => Number(b.length >= Math.max(...section.types.map((type) => metricFor(type, typeSizes).height)))
                - Number(a.length >= Math.max(...section.types.map((type) => metricFor(type, typeSizes).height)))
                || Math.abs(a.start - anchor.y) - Math.abs(b.start - anchor.y))[0] || candidates[0];
        slots.push({ ...section, edgeId: chosen.edgeId, orientation: chosen.orientation, index: chosen.index });
    }
    const plan = { slots, edgeGaps: new Map(), horizontalWidths: new Map(), extension };
    reserveDiagramTypeLabelSpace(data, layout, services, plan, stationSizes, typeSizes);
    return plan;
};

// 分支横移也会改变遮罩的相交位置；以重排后的可见直线补足同一份预留。
export const reserveDiagramTypeLabelSpace = (data, layout, services, plan, stationSizes, typeSizes) => {
    const edges = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const geometry = diagramParts(data, layout, services);
    let changed = false;
    for (const slot of plan.slots.filter((slot) => !slot.extension)) {
        const final = edgeSlots(slot.edgeId, layout, stationSizes, edges, geometry).find((part) => part.index === slot.index);
        const horizontal = slot.orientation === 'horizontal';
        const required = Math.max(...services.serviceTracks.get(slot.edgeId)
            .map(({ type }) => metricFor(type, typeSizes)[horizontal ? 'width' : 'height']));
        const reservations = horizontal ? plan.horizontalWidths : plan.edgeGaps;
        if (reservations.has(slot.edgeId) && final.length + 0.01 >= required) continue;
        const edge = edges.get(slot.edgeId), a = layout.positions.get(edge.from), b = layout.positions.get(edge.to);
        const minimum = horizontal ? required + final.rawLength - final.length
            : Math.abs(a.y - b.y) + Math.max(0, required - final.length);
        if (minimum > (reservations.get(slot.edgeId) || 0) + 0.01) {
            reservations.set(slot.edgeId, minimum);
            changed = true;
        }
    }
    return changed;
};

export const typeLabelExtensionBox = (extension, positions) => {
    if (!extension) return [];
    const point = positions.get(extension.stationId);
    return [{ left: point.x + point.leftTrackOffset - 7, right: point.x + point.rightTrackOffset + 7,
        y: point.y - extension.length / 2, height: extension.length }];
};

export const layoutDiagramTypeLabels = (data, layout, services, plan, stationSizes, typeSizes) => {
    const edges = new Map(data.topology.edges.map((edge) => [edge.id, edge]));
    const geometry = diagramParts(data, layout, services);
    const typeLabels = [], typeLabelExtensions = [];
    for (const slot of plan.slots) {
        const tracks = services.serviceTracks.get(slot.edgeId);
        const vertical = slot.orientation === 'vertical';
        const length = Math.max(...tracks.map(({ type }) => metricFor(type, typeSizes)[vertical ? 'height' : 'width']));
        let center, segments;
        if (slot.extension) {
            const point = layout.positions.get(plan.extension.stationId);
            center = point.y - plan.extension.length + padding + length / 2;
            segments = tracks.map((track) => {
                const x = point.x + track.endpointOffsets.get(plan.extension.stationId);
                typeLabelExtensions.push({ type: track.type, path: `M${x},${point.y}L${x},${point.y - plan.extension.length}` });
                return { from: { x }, to: { x } };
            });
        } else {
            const final = edgeSlots(slot.edgeId, layout, stationSizes, edges, geometry)
                .find((part) => part.index === slot.index);
            center = (final.start + final.end) / 2;
            segments = final.segments;
        }
        tracks.forEach((track, index) => {
            const segment = segments[index], metrics = metricFor(track.type, typeSizes);
            // 同组文字共用顶部或左侧起点，整组仍使用已预留的位置。
            const offset = (length - metrics[vertical ? 'height' : 'width']) / 2;
            const label = { type: track.type, edgeId: slot.edgeId, orientation: slot.orientation, metrics,
                x: vertical ? segment.from.x : center - offset, y: vertical ? center - offset : segment.from.y };
            typeLabels.push(label);
            if (slot.isCurrent || slot.primary) {
                const width = vertical ? 12 : metrics.width, height = vertical ? metrics.height : 12;
                layout.mainBounds.left = Math.min(layout.mainBounds.left, label.x - width / 2 - padding);
                layout.mainBounds.right = Math.max(layout.mainBounds.right, label.x + width / 2 + padding);
                layout.mainBounds.top = Math.min(layout.mainBounds.top, label.y - height / 2 - padding);
                layout.mainBounds.bottom = Math.max(layout.mainBounds.bottom, label.y + height / 2 + padding);
            }
        });
    }
    return { typeLabels, typeLabelExtensions };
};
