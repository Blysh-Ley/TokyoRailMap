import { buildLineOffsetMetrics, evaluateLineOffsetProfile, nearestLineOffsetProgress } from './lineOffsetProfile.js';

// 全线曲线切到路线子段时保留原曲线值，避免每个站间重新启动过渡。
export const sliceLineOffsetProfile = (coordinates, profile, segmentCoordinates) => {
    if (!profile || coordinates.length < 2 || segmentCoordinates.length < 2) return null;
    if (coordinates === segmentCoordinates || (coordinates.length === segmentCoordinates.length && coordinates.every((point, i) => point[0] === segmentCoordinates[i][0] && point[1] === segmentCoordinates[i][1]))) return profile;
    const master = buildLineOffsetMetrics(coordinates);
    const local = buildLineOffsetMetrics(segmentCoordinates);
    if (!master.total || !local.total) return [[0, evaluateLineOffsetProfile(profile, 0)], [1, evaluateLineOffsetProfile(profile, 0)]];
    const positions = segmentCoordinates.map(coordinate => nearestLineOffsetProgress(coordinates, coordinate)?.progress || 0);
    const closed = coordinates[0][0] === coordinates.at(-1)[0] && coordinates[0][1] === coordinates.at(-1)[1];
    if (closed) {
        for (let i = 1; i < positions.length; i += 1) {
            while (positions[i] - positions[i - 1] > 0.5) positions[i] -= 1;
            while (positions[i] - positions[i - 1] < -0.5) positions[i] += 1;
        }
    }
    const direction = positions.at(-1) < positions[0] ? -1 : 1;
    const at = progress => evaluateLineOffsetProfile(profile, closed ? ((progress % 1) + 1) % 1 : Math.max(0, Math.min(1, progress))) * direction;
    const out = [[0, at(positions[0])]];
    for (let i = 1; i < segmentCoordinates.length; i += 1) {
        const start = positions[i - 1];
        const end = positions[i];
        const samples = new Set([end]);
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        for (let cycle = Math.floor(min); cycle <= Math.floor(max); cycle += 1) {
            for (let j = 1; j < profile.length; j += 1) {
                const [from, value] = profile[j - 1];
                const [to, next] = profile[j];
                const count = value === next ? 1 : 32;
                for (let k = 0; k <= count; k += 1) {
                    const position = cycle + from + (to - from) * k / count;
                    if (position > min && position < max) samples.add(position);
                }
            }
        }
        const ordered = [...samples].sort((a, b) => (end < start ? -1 : 1) * (a - b));
        for (const position of ordered) {
            const t = end === start ? 1 : (position - start) / (end - start);
            const progress = (local.distances[i - 1] + (local.distances[i] - local.distances[i - 1]) * t) / local.total;
            if (progress > out.at(-1)[0]) out.push([progress, at(position)]);
        }
    }
    return out;
};

export const sampleLineOffsetCoordinates = (coordinates, profile) => {
    const metrics = buildLineOffsetMetrics(coordinates);
    if (!metrics.total) return { coordinates, progress: coordinates.map(() => 0) };
    const samples = new Set(metrics.distances.map(distance => distance / metrics.total));
    const values = profile.map(stop => stop[1]);
    const span = Math.max(...values) - Math.min(...values);
    for (let i = 1; i < profile.length; i += 1) {
        const [start, from] = profile[i - 1];
        const [end, to] = profile[i];
        const steps = from === to ? 1 : Math.max(1, Math.ceil(Math.abs(to - from) * 32 / span));
        for (let j = 0; j <= steps; j += 1) samples.add(start + (end - start) * j / steps);
    }
    const progress = [...samples].sort((a, b) => a - b);
    let index = 1;
    const result = progress.map(position => {
        const distance = position * metrics.total;
        while (index < coordinates.length - 1 && metrics.distances[index] < distance) index += 1;
        const start = metrics.distances[index - 1];
        const length = metrics.distances[index] - start;
        const t = length ? (distance - start) / length : 0;
        if (t === 0) return coordinates[index - 1];
        if (t === 1) return coordinates[index];
        const a = metrics.points[index - 1];
        const b = metrics.points[index];
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        return [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
    });
    return { coordinates: result, progress };
};

export const buildVariableOffsetPolylinePixels = (coordinates, profile, pixelsPerUnit, project, buildFixedOffset) => {
    const sampled = sampleLineOffsetCoordinates(coordinates, profile);
    const pixels = sampled.coordinates.map(project);
    const normalPoints = buildFixedOffset(pixels, 1, { preserveVertices: true });
    return pixels.map((point, index) => {
        const units = evaluateLineOffsetProfile(profile, sampled.progress[index]) * pixelsPerUnit;
        return { x: point.x + (normalPoints[index].x - point.x) * units, y: point.y + (normalPoints[index].y - point.y) * units };
    });
};
