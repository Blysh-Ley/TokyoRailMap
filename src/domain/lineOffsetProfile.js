// 矩形只选择原始坐标上的连续区间；偏移仍以屏幕像素单位表达。
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
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (!value || !Array.isArray(value.segments)) return null;
    const transitionMeters = Number(value.transitionMeters ?? 400);
    if (!Number.isFinite(transitionMeters) || transitionMeters <= 0) throw new Error('transitionMeters 必须是大于 0 的沿线距离（米）');
    const segments = value.segments.map(({ bounds, offset }) => {
        if (!Array.isArray(bounds) || bounds.length !== 2 || bounds.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n))) || !Number.isFinite(offset)) {
            throw new Error('线路偏移区间需要 bounds: [[经度, 纬度], [经度, 纬度]] 和数值 offset');
        }
        return { west: Math.min(bounds[0][0], bounds[1][0]), east: Math.max(bounds[0][0], bounds[1][0]), south: Math.min(bounds[0][1], bounds[1][1]), north: Math.max(bounds[0][1], bounds[1][1]), offset };
    });
    return { transitionMeters, segments };
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
    if (!config || typeof config === 'number' || coordinates.length < 2) return null;
    const metrics = buildLineOffsetMetrics(coordinates);
    if (!metrics.total) return [[0, 0], [1, 0]];
    const meters = [0];
    for (let i = 1; i < coordinates.length; i += 1) meters.push(meters[i - 1] + distanceMeters(coordinates[i - 1], coordinates[i]));
    const totalMeters = meters.at(-1);
    const units = coordinates.map(([lng, lat]) => {
        let target = 0;
        for (const segment of config.segments) {
            if (lng >= segment.west && lng <= segment.east && lat >= segment.south && lat <= segment.north) target = segment.offset;
        }
        return target;
    });
    const runs = [{ start: 0, end: totalMeters, units: units[0] }];
    for (let i = 1; i < units.length; i += 1) {
        if (units[i] === units[i - 1]) continue;
        const boundary = (meters[i - 1] + meters[i]) / 2;
        runs.at(-1).end = boundary;
        runs.push({ start: boundary, end: totalMeters, units: units[i] });
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
        // 每侧最多占相邻区间的一半，短空白仍能达到 0，过渡不会互相覆盖。
        const half = Math.min(config.transitionMeters / 2, (previous.end - previous.start) / 2, (current.end - current.start) / 2);
        append(current.start - half, previous.units);
        append(current.start + half, current.units);
    }
    append(totalMeters, runs.at(-1).units);
    return stops;
};

export const nearestLineOffsetProgress = (coordinates, coordinate) => {
    const { points, distances, total } = buildLineOffsetMetrics(coordinates);
    const target = projectOffsetCoordinate(coordinate);
    let best = null;
    for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length2 = dx * dx + dy * dy;
        const t = length2 ? Math.max(0, Math.min(1, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length2)) : 0;
        const d2 = (target.x - a.x - dx * t) ** 2 + (target.y - a.y - dy * t) ** 2;
        if (!best || d2 < best.d2) best = { d2, progress: total ? (distances[i - 1] + (distances[i] - distances[i - 1]) * t) / total : 0, segmentIndex: i - 1, t };
    }
    return best;
};

export const lineOffsetUnitsAtCoordinate = (feature, coordinate) => {
    const profile = readLineOffsetProfile(feature?.properties);
    if (!profile) return Number(feature?.properties?.line_offset_units) || 0;
    const hit = nearestLineOffsetProgress(feature.geometry.coordinates, coordinate);
    return hit ? evaluateLineOffsetProfile(profile, hit.progress) : 0;
};
