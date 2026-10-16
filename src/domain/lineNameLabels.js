import { readLineOffsetProfile } from './lineOffsetProfile.js';
import { buildVariableOffsetPolylinePixels } from './lineOffsetGeometry.js';
import { getLineOffsetPixelsPerUnitAtZoom } from './lineOffsetScale.js';
import { getHighlightLineWidthAtZoom } from './highlightStyleSizing.js';

const toText = value => String(value ?? '').trim();
const BLOCKED_TOKENS = ['货物', '貨物', '支线', '支線'];
export const LINE_NAME_LABEL_LETTER_SPACING = 0.15;
export const LINE_NAME_LABEL_TEXT_SIZE_EXPR = ['interpolate', ['linear'], ['zoom'], 8, 9, 11, 10, 15, 11, 18, 12];

export const getLineNameLabelTextSizeForZoom = zoom => {
    const stops = [[8, 9], [11, 10], [15, 11], [18, 12]];
    for (let i = 1; i < stops.length; i += 1) {
        if (zoom > stops[i][0]) continue;
        const [z, size] = stops[i - 1];
        return size + (stops[i][1] - size) * Math.max(0, (zoom - z) / (stops[i][0] - z));
    }
    return stops.at(-1)[1];
};

const chainsOf = geometry => geometry?.type === 'LineString' ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];

// 保留所有真实分段和偏移，选位推迟到知道视口和文字尺寸之后。
export const buildLineNameLabelGeoJSON = (lineFeatures = []) => ({
    type: 'FeatureCollection',
    features: lineFeatures.flatMap((feature, index) => {
        const props = feature.properties || {};
        const id = toText(props.id || feature.id);
        const name = toText(props.name) || id;
        if (!id || id.startsWith('Base.') || Number(props.hidden_by_opacity_zero) === 1
            || BLOCKED_TOKENS.some(token => name.includes(token))) return [];
        return chainsOf(feature.geometry).filter(chain => chain.length >= 2).map((coordinates, part) => ({
            type: 'Feature', id: `${id}.name-path.${index}.${part}`,
            properties: { ...props, id, name, type: 'line-name-path' },
            geometry: { type: 'LineString', coordinates }
        }));
    })
});

const pointAt = (points, distances, distance) => {
    let lo = 1;
    let hi = distances.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (distances[mid] < distance) lo = mid + 1;
        else hi = mid;
    }
    const a = points[lo - 1];
    const b = points[lo];
    const span = distances[lo] - distances[lo - 1];
    const t = span ? Math.max(0, Math.min(1, (distance - distances[lo - 1]) / span)) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, index: lo };
};

const clipInterval = (a, b, width, height) => {
    let start = 0;
    let end = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x], [dx, width - a.x], [-dy, a.y], [dy, height - a.y]]) {
        if (p === 0) { if (q < 0) return null; }
        else if (p < 0) start = Math.max(start, q / p);
        else end = Math.min(end, q / p);
        if (start > end) return null;
    }
    return [start, end];
};

export const getLineNameLabelBounds = (point, angle, width, height) => {
    const radians = angle * Math.PI / 180;
    const dx = (Math.abs(Math.cos(radians)) * width + Math.abs(Math.sin(radians)) * height) / 2;
    const dy = (Math.abs(Math.sin(radians)) * width + Math.abs(Math.cos(radians)) * height) / 2;
    return { minX: point.x - dx, maxX: point.x + dx, minY: point.y - dy, maxY: point.y + dy };
};

const measurePath = points => {
    const distances = [0];
    for (let i = 1; i < points.length; i += 1) {
        distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    return distances;
};

const slicePath = (points, distances, start, end) => {
    const first = pointAt(points, distances, start);
    const last = pointAt(points, distances, end);
    const result = [{ x: first.x, y: first.y }];
    for (let i = first.index; i < last.index; i += 1) result.push(points[i]);
    result.push({ x: last.x, y: last.y });
    return result;
};

const textPath = (points, textWidth) => {
    const distances = measurePath(points);
    const margin = Math.max(0, (distances.at(-1) - textWidth) / 2);
    return slicePath(points, distances, margin, distances.at(-1) - margin);
};

// 按字形覆盖的屏幕长度判断可读性；短线、急弯、折返和小环线不再降分后强行显示。
const readablePathTurn = (points, textWidth, fontSize) => {
    const distances = measurePath(points);
    if (distances.at(-1) < textWidth + fontSize * 0.5) return null;
    const run = textPath(points, textWidth);
    const runDistances = measurePath(run);
    const length = runDistances.at(-1);
    if (Math.hypot(run.at(-1).x - run[0].x, run.at(-1).y - run[0].y) < length * 0.8) return null;
    const steps = Math.max(2, Math.ceil(length / (fontSize * 0.5)));
    let previous = null;
    let direction = 0;
    let minDirection = 0;
    let maxDirection = 0;
    let totalTurn = 0;
    for (let i = 0; i <= steps; i += 1) {
        const distance = length * i / steps;
        const a = pointAt(run, runDistances, Math.max(0, distance - fontSize * 0.3));
        const b = pointAt(run, runDistances, Math.min(length, distance + fontSize * 0.3));
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (previous !== null) {
            const delta = Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
            if (Math.abs(delta) > Math.PI / 6) return null;
            direction += delta;
            totalTurn += Math.abs(delta);
            minDirection = Math.min(minDirection, direction);
            maxDirection = Math.max(maxDirection, direction);
        }
        previous = angle;
    }
    if (maxDirection - minDirection > Math.PI * 80 / 180 || totalTurn > Math.PI * 100 / 180) return null;
    return totalTurn;
};

const labelPathBoxes = (points, textWidth, textHeight) => {
    const run = textPath(points, textWidth);
    return run.slice(1).map((point, index) => {
        const previous = run[index];
        const angle = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
        return getLineNameLabelBounds({ x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 },
            angle, Math.hypot(point.x - previous.x, point.y - previous.y) + 4, textHeight + 4);
    });
};

// 与原生 composite 顶点属性一致，按相邻整数 zoom 指数插值。
const renderedOffsetPixels = zoom => {
    const lower = Math.floor(zoom);
    const t = 2 ** (zoom - lower) - 1;
    return getLineOffsetPixelsPerUnitAtZoom(lower) * (1 - t) + getLineOffsetPixelsPerUnitAtZoom(lower + 1) * t;
};

// 班次和分段偏移会拆开同一条线；只在没有分叉的真实共用端点接续，保留每段自己的偏移。
const continuousPathParts = features => {
    const nodes = new Map();
    const endpoints = features.map((feature, index) => {
        const coordinates = feature.geometry.coordinates;
        return [coordinates[0], coordinates.at(-1)].map((coordinate, end) => {
            const key = `${feature.properties.id}:${coordinate.map(value => Number(value).toFixed(9)).join(',')}`;
            if (!nodes.has(key)) nodes.set(key, []);
            nodes.get(key).push({ index, end });
            return key;
        });
    });
    const visited = new Set();
    const chains = [];
    const walk = (index, reversed) => {
        const parts = [];
        while (!visited.has(index)) {
            visited.add(index);
            parts.push({ feature: features[index], reversed });
            const tail = endpoints[index][reversed ? 0 : 1];
            const connections = nodes.get(tail);
            if (connections.length !== 2) break;
            const next = connections.find(connection => !visited.has(connection.index));
            if (!next) break;
            index = next.index;
            reversed = next.end === 1;
        }
        chains.push(parts);
    };
    features.forEach((feature, index) => {
        if (visited.has(index)) return;
        if (nodes.get(endpoints[index][0]).length !== 2) walk(index, false);
        else if (nodes.get(endpoints[index][1]).length !== 2) walk(index, true);
    });
    features.forEach((feature, index) => { if (!visited.has(index)) walk(index, false); });
    return chains;
};

export const buildLineNameLabelCandidates = (paths, {
    project, unproject, width, height, zoom, measureText, buildFixedOffset,
    lineIds = null, previous = new Map(), labelScale = 1, previousOnly = false
}) => {
    const fontSize = getLineNameLabelTextSizeForZoom(zoom) * labelScale;
    const byLine = new Map();
    const visiblePaths = (paths?.features || []).filter(feature => (!lineIds || lineIds.has(feature.properties.id))
        && (!previousOnly || previous.has(feature.properties.id)));
    const renderedPaths = [];
    for (const parts of continuousPathParts(visiblePaths)) {
        let current = null;
        for (const { feature, reversed } of parts) {
            const profile = readLineOffsetProfile(feature.properties);
            const pixels = profile
                ? buildVariableOffsetPolylinePixels(feature.geometry.coordinates, profile, renderedOffsetPixels(zoom), project, buildFixedOffset)
                : buildFixedOffset(feature.geometry.coordinates.map(project), (Number(feature.properties.line_offset_units) || 0) * renderedOffsetPixels(zoom), { preserveVertices: true });
            if (reversed) pixels.reverse();
            // 偏移后连线的笔画仍相接才能跨段排字，真实空隙不补线。
            if (!current || Math.hypot(current.pixels.at(-1).x - pixels[0].x, current.pixels.at(-1).y - pixels[0].y) > getHighlightLineWidthAtZoom(zoom)) {
                current = { id: `${feature.id}.continuous`, properties: feature.properties, pixels };
                renderedPaths.push(current);
            } else current.pixels.push(...pixels.slice(1));
        }
    }
    for (const feature of renderedPaths) {
        const props = feature.properties;
        const previousLabel = previous.get(props.id);
        if (previousOnly && previousLabel?.label_path !== feature.id) continue;
        const textWidth = measureText(props.name, fontSize) + Math.max(0, Array.from(props.name).length - 1) * fontSize * LINE_NAME_LABEL_LETTER_SPACING;
        const textHeight = fontSize * 1.2;
        const pixels = feature.pixels;
        const distances = [0];
        const intervals = [];
        for (let i = 1; i < pixels.length; i += 1) {
            const length = Math.hypot(pixels[i].x - pixels[i - 1].x, pixels[i].y - pixels[i - 1].y);
            distances.push(distances[i - 1] + length);
            const clip = clipInterval(pixels[i - 1], pixels[i], width, height);
            if (!clip) continue;
            const start = distances[i - 1] + length * clip[0];
            const end = distances[i - 1] + length * clip[1];
            if (intervals.length && start <= intervals.at(-1)[1] + 0.01) intervals.at(-1)[1] = end;
            else intervals.push([start, end]);
        }
        const total = distances.at(-1);
        const minimumHalf = (textWidth + fontSize) / 2;
        if (total < minimumHalf * 2 || !intervals.length) continue;
        const positions = new Set();
        const stride = Math.max(fontSize * 2, textWidth * 0.8);
        if (!previousOnly) {
            for (const [start, end] of intervals) {
                if (end - start < minimumHalf * 2) continue;
                positions.add((start + end) / 2);
                for (let distance = Math.ceil((start + minimumHalf) / stride) * stride; distance <= end - minimumHalf; distance += stride) positions.add(distance);
            }
        }
        if (previousLabel?.label_path === feature.id) {
            const segment = previousLabel.label_segment;
            // 相机变化只重投影原锚点，不按变化后的屏幕总长度滑动锚点。
            positions.add(segment > 0 && segment < distances.length
                ? distances[segment - 1] + (distances[segment] - distances[segment - 1]) * previousLabel.label_segment_t
                : previousLabel.label_progress * total);
        }
        const candidates = byLine.get(props.id) || [];
        byLine.set(props.id, candidates);
        for (const distance of positions) {
            const interval = intervals.find(([start, end]) => distance >= start + minimumHalf && distance <= end - minimumHalf);
            if (!interval) continue;
            const center = pointAt(pixels, distances, distance);
            const halfWindow = Math.min((textWidth + fontSize * 2) / 2, distance - interval[0], interval[1] - distance);
            const windowPixels = slicePath(pixels, distances, distance - halfWindow, distance + halfWindow);
            // 同段的两侧及稍远旁置都是备用；碰撞失败交给原生流程继续尝试。
            for (const side of previousOnly ? [previousLabel.label_side] : [1, -1, 1.65, -1.65]) {
                const gap = fontSize * 1.25 * side;
                const labelPixels = buildFixedOffset(windowPixels, gap, { preserveVertices: true });
                const turn = readablePathTurn(labelPixels, textWidth, fontSize);
                if (turn === null) continue;
                const boxes = labelPathBoxes(labelPixels, textWidth, textHeight);
                if (boxes.some(box => box.minX < 4 || box.maxX > width - 4 || box.minY < 4 || box.maxY > height - 4)) continue;
                const samePrevious = previousLabel?.label_path === feature.id
                    && Math.abs(previousLabel.label_progress - distance / total) < 0.00001 && previousLabel.label_side === side;
                const score = turn * 8
                    + Math.hypot(center.x - width / 2, center.y - height / 2) / Math.hypot(width, height) * 12
                    + (side < 0 ? 1 : 0) + (Math.abs(side) > 1 ? 8 : 0) - (samePrevious ? 18 : 0);
                candidates.push({
                    type: 'Feature', id: `${feature.id}.${(distance / total).toFixed(6)}.${side}`,
                    properties: { id: props.id, name: props.name, color: props.color, _dark_color: props._dark_color,
                        type: 'line-name-label', label_font_size: fontSize,
                        label_width: textWidth, label_height: textHeight, label_score: score,
                        label_path: feature.id, label_progress: distance / total, label_side: side,
                        label_segment: center.index, label_segment_t: (distance - distances[center.index - 1]) / (distances[center.index] - distances[center.index - 1] || 1) },
                    geometry: { type: 'LineString', coordinates: labelPixels.map(point => {
                        const lngLat = unproject(point);
                        return Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat];
                    }) }
                });
            }
        }
    }
    const features = [];
    for (const candidates of byLine.values()) {
        candidates.sort((a, b) => a.properties.label_score - b.properties.label_score || a.id.localeCompare(b.id));
        candidates.forEach((feature, index) => {
            // 各线路先尝试首选，再轮到备用，显示数量由成功放置决定。
            feature.properties.label_rank = index * 100 + Math.max(0, feature.properties.label_score);
            features.push(feature);
        });
    }
    return { type: 'FeatureCollection', features };
};

// SVG 复用同一候选和文字边界，成功放置后才占用该线路的名额。
export const selectLineNameLabelCandidates = (data, project) => {
    const selected = [];
    const placed = new Set();
    const boxes = [];
    for (const feature of data.features.slice().sort((a, b) => a.properties.label_rank - b.properties.label_rank)) {
        const props = feature.properties;
        if (placed.has(props.id)) continue;
        const bounds = labelPathBoxes(feature.geometry.coordinates.map(project), props.label_width, props.label_height);
        if (bounds.some(bound => boxes.some(box => bound.minX <= box.maxX && bound.maxX >= box.minX && bound.minY <= box.maxY && bound.maxY >= box.minY))) continue;
        boxes.push(...bounds);
        selected.push(feature);
        placed.add(props.id);
    }
    return selected;
};
