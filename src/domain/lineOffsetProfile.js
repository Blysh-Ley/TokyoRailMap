// 两个端点投影到线路后选择连续路径；偏移仍以屏幕像素单位表达。
export const projectOffsetCoordinate = ([lng, lat]) => {
    const radians = lat * Math.PI / 180;
    return { x: (lng + 180) / 360, y: (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2 };
};

export const buildLineOffsetMetrics = (coordinates, project = projectOffsetCoordinate) => {
    const points = coordinates.map(project);
    const distances = [0];
    for (let i = 1; i < points.length; i += 1) {
        distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    return { points, distances, total: distances.at(-1) || 0 };
};

export const evaluateLineOffsetProfile = (profile, progress) => {
    if (progress <= profile[0][0]) return profile[0][1];
    for (let i = 1; i < profile.length; i += 1) {
        const [end, to] = profile[i];
        if (progress > end) continue;
        const [start, from] = profile[i - 1];
        const t = (progress - start) / (end - start);
        return from + (to - from) * t * t * (3 - 2 * t);
    }
    return profile.at(-1)[1];
};

export const readLineOffsetProfile = (properties = {}) => {
    if (properties.line_offset_profile === undefined) return null;
    const raw = properties.line_offset_profile;
    const profile = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const additionalUnits = Number(properties.line_offset_units) || 0;
    return profile.map(([progress, units]) => [progress, units + additionalUnits]);
};

export const normalizeLineOffsetConfig = (value) => {
    if (!value || (!Array.isArray(value.segments) && value.offset === undefined)) return null;
    const offset = value.offset ?? 0;
    if (!Number.isFinite(offset)) throw new Error('线路全局偏移需要数值 offset');
    const transitionMeters = Number(value.transitionMeters ?? 400);
    if (!Number.isFinite(transitionMeters) || transitionMeters <= 0) throw new Error('transitionMeters 必须是大于 0 的沿线距离（米）');
    const segments = (value.segments ?? []).map(({ points, offset }) => {
        if (!Array.isArray(points) || points.length !== 2 || points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n))) || !Number.isFinite(offset)) {
            throw new Error('线路偏移区间需要 points: [[经度, 纬度], [经度, 纬度]] 和数值 offset');
        }
        return { points, offset };
    });
    return { offset, transitionMeters, segments };
};

const distanceMeters = (a, b) => {
    const rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad;
    const dLng = (b[0] - a[0]) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
    return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
};

const interpolateDistance = (distances, values, distance) => {
    for (let i = 1; i < distances.length; i += 1) {
        if (distance > distances[i]) continue;
        const length = distances[i] - distances[i - 1];
        const t = length ? (distance - distances[i - 1]) / length : 0;
        return values[i - 1] + (values[i] - values[i - 1]) * t;
    }
    return values.at(-1);
};

export const buildLineOffsetProfile = (coordinates, config) => {
    if (!config || coordinates.length < 2) return null;
    const metrics = buildLineOffsetMetrics(coordinates);
    const baseOffset = config.offset ?? 0;
    if (!metrics.total) return [[0, baseOffset], [1, baseOffset]];
    const meters = [0];
    for (let i = 1; i < coordinates.length; i += 1) meters.push(meters[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i]));
    const totalMeters = meters.at(-1);
    const intervals = config.segments.map(({ points, offset }) => {
        const positions = points.map(point => {
            const { segmentIndex, t } = nearestLineOffsetPosition(metrics, point);
            return meters[segmentIndex] + (meters[segmentIndex + 1] - meters[segmentIndex]) * t;
        });
        return { start: Math.min(...positions), end: Math.max(...positions), units: offset };
    });
    const boundaries = [...new Set([0, totalMeters, ...intervals.flatMap(({ start, end }) => [start, end])])].sort((a, b) => a - b);
    const runs = [];
    for (let i = 1; i < boundaries.length; i += 1) {
        const start = boundaries[i - 1];
        const end = boundaries[i];
        const middle = (start + end) / 2;
        let units = baseOffset;
        for (const interval of intervals) {
            if (middle >= interval.start && middle <= interval.end) units = interval.units;
        }
        if (runs.at(-1)?.units === units) runs.at(-1).end = end;
        else runs.push({ start, end, units });
    }
    const stops = [[0, runs[0].units]];
    const append = (distance, value) => {
        const progress = interpolateDistance(meters, metrics.distances, distance) / metrics.total;
        if (progress === stops.at(-1)[0]) stops.at(-1)[1] = value;
        else stops.push([progress, value]);
    };
    for (let i = 1; i < runs.length; i += 1) {
        const previous = runs[i - 1];
        const current = runs[i];
        // 每侧最多占相邻区间的一半，短空白仍能达到基础偏移，过渡不会互相覆盖。
        const half = Math.min(config.transitionMeters / 2, (previous.end - previous.start) / 2, (current.end - current.start) / 2);
        append(current.start - half, previous.units);
        append(current.start + half, current.units);
    }
    append(totalMeters, runs.at(-1).units);
    return stops;
};

// 包围盒树只筛选可能更近的线段，最终仍使用原来的投影公式和最早线段优先顺序。
export const buildLineOffsetSegmentIndex = (points) => {
    const build = (indices) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const index of indices) {
            const a = points[index - 1], b = points[index];
            minX = Math.min(minX, a.x, b.x); minY = Math.min(minY, a.y, b.y);
            maxX = Math.max(maxX, a.x, b.x); maxY = Math.max(maxY, a.y, b.y);
        }
        // 包围盒向外扩展浮点误差余量，不能漏掉重叠处距离相同的较早线段。
        const margin = Number.EPSILON * Math.max(1, Math.abs(minX), Math.abs(minY), Math.abs(maxX), Math.abs(maxY));
        const node = { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
        if (indices.length === 1) return { ...node, index: indices[0] };
        const axis = maxX - minX >= maxY - minY ? 'x' : 'y';
        indices.sort((left, right) => (
            points[left - 1][axis] + points[left][axis] - points[right - 1][axis] - points[right][axis]
            || left - right
        ));
        const middle = Math.floor(indices.length / 2);
        return { ...node, left: build(indices.slice(0, middle)), right: build(indices.slice(middle)) };
    };
    return build(points.slice(1).map((_point, index) => index + 1));
};

export const nearestLineOffsetPosition = ({ points, distances, total, segmentIndex }, coordinate) => {
    const target = projectOffsetCoordinate(coordinate);
    let best = null;
    const visitSegment = (i) => {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length2)) : 0;
        const d2 = (target.x - a.x - dx * t) ** 2 + (target.y - a.y - dy * t) ** 2;
        if (!best || d2 < best.d2 || (d2 === best.d2 && i - 1 < best.segmentIndex)) {
            best = { d2, progress: total ? (distances[i - 1] + (distances[i] - distances[i - 1]) * t) / total : 0, segmentIndex: i - 1, t };
        }
    };
    if (segmentIndex) {
        const distanceToBounds = (node) => (
            Math.max(node.minX - target.x, 0, target.x - node.maxX) ** 2
            + Math.max(node.minY - target.y, 0, target.y - node.maxY) ** 2
        );
        const visit = (node, distance) => {
            if (best && distance > best.d2) return;
            if (node.index !== undefined) return visitSegment(node.index);
            const leftDistance = distanceToBounds(node.left), rightDistance = distanceToBounds(node.right);
            if (leftDistance <= rightDistance) {
                visit(node.left, leftDistance); visit(node.right, rightDistance);
            } else {
                visit(node.right, rightDistance); visit(node.left, leftDistance);
            }
        };
        visit(segmentIndex, distanceToBounds(segmentIndex));
    } else {
        for (let i = 1; i < points.length; i += 1) visitSegment(i);
    }
    return best;
};

export const nearestLineOffsetProgress = (coordinates, coordinate) => (
    nearestLineOffsetPosition(buildLineOffsetMetrics(coordinates), coordinate)
);

export const lineOffsetUnitsAtCoordinate = (feature, coordinate) => {
    const profile = readLineOffsetProfile(feature?.properties);
    if (!profile) return Number(feature?.properties?.line_offset_units) || 0;
    const hit = nearestLineOffsetProgress(feature.geometry.coordinates, coordinate);
    return hit ? evaluateLineOffsetProfile(profile, hit.progress) : 0;
};
