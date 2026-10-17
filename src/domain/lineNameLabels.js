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

const clipInterval = (a, b, viewport) => {
    let start = 0;
    let end = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (let edge = 0; edge < 4; edge += 1) {
        const p = edge === 0 ? -dx : edge === 1 ? dx : edge === 2 ? -dy : dy;
        const q = edge === 0 ? a.x - viewport.minX : edge === 1 ? viewport.maxX - a.x
            : edge === 2 ? a.y - viewport.minY : viewport.maxY - a.y;
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

// 按字形覆盖的屏幕长度判断可读性；短线、急弯、折返和小环线不再降分后强行显示。
const readablePathTurn = (points, textWidth, fontSize, distances = measurePath(points)) => {
    if (distances.at(-1) < textWidth + fontSize * 0.5) return null;
    const margin = (distances.at(-1) - textWidth) / 2;
    const first = pointAt(points, distances, margin);
    const last = pointAt(points, distances, margin + textWidth);
    const length = textWidth;
    if (Math.hypot(last.x - first.x, last.y - first.y) < length * 0.8) return null;
    const steps = Math.max(2, Math.ceil(length / (fontSize * 0.5)));
    let previous = null;
    let direction = 0;
    let minDirection = 0;
    let maxDirection = 0;
    let totalTurn = 0;
    for (let i = 0; i <= steps; i += 1) {
        const distance = length * i / steps;
        const a = pointAt(points, distances, margin + Math.max(0, distance - fontSize * 0.3));
        const b = pointAt(points, distances, margin + Math.min(length, distance + fontSize * 0.3));
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        if (previous !== null) {
            const difference = angle - previous;
            const delta = difference > Math.PI ? difference - Math.PI * 2
                : difference < -Math.PI ? difference + Math.PI * 2 : difference;
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

const labelPathBoxes = (points, textWidth, textHeight, distances = measurePath(points)) => {
    const margin = Math.max(0, (distances.at(-1) - textWidth) / 2);
    // 按字形尺度取样，避免原始坐标越密，遮挡得分和碰撞框数量就越大。
    const steps = Math.max(1, Math.ceil(textWidth / textHeight * 2));
    let previous = pointAt(points, distances, margin);
    return Array.from({ length: steps }, (_, index) => {
        const point = pointAt(points, distances, margin + textWidth * (index + 1) / steps);
        const dx = point.x - previous.x;
        const dy = point.y - previous.y;
        const length = Math.hypot(dx, dy);
        const ux = length ? Math.abs(dx) / length : 1;
        const uy = length ? Math.abs(dy) / length : 0;
        // 直接使用单位方向求旋转框，避免每个字形重复做角度及三角函数转换。
        const halfWidth = ((length + 4) * ux + (textHeight + 4) * uy) / 2;
        const halfHeight = ((length + 4) * uy + (textHeight + 4) * ux) / 2;
        const x = (previous.x + point.x) / 2;
        const y = (previous.y + point.y) / 2;
        const box = { minX: x - halfWidth, maxX: x + halfWidth, minY: y - halfHeight, maxY: y + halfHeight };
        previous = point;
        return box;
    });
};

const createObstacleLookup = (obstacles, cellSize) => {
    if (!obstacles.length) return () => 0;
    const cells = new Map();
    const visit = (box, callback) => {
        for (let x = Math.floor(box.minX / cellSize); x <= Math.floor(box.maxX / cellSize); x += 1) {
            for (let y = Math.floor(box.minY / cellSize); y <= Math.floor(box.maxY / cellSize); y += 1) callback(`${x}:${y}`);
        }
    };
    for (const box of obstacles) visit(box, key => {
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(box);
    });
    return boxes => {
        const extent = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        for (const box of boxes) {
            extent.minX = Math.min(extent.minX, box.minX);
            extent.minY = Math.min(extent.minY, box.minY);
            extent.maxX = Math.max(extent.maxX, box.maxX);
            extent.maxY = Math.max(extent.maxY, box.maxY);
        }
        // 同一个名字只查询一次邻近站名，再逐字形累积覆盖面积。
        const nearby = new Set();
        visit(extent, key => { for (const obstacle of cells.get(key) || []) nearby.add(obstacle); });
        if (!nearby.size) return 0;
        let area = 0;
        let covered = 0;
        for (const box of boxes) {
            const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
            let overlap = 0;
            for (const obstacle of nearby) {
                overlap += Math.max(0, Math.min(box.maxX, obstacle.maxX) - Math.max(box.minX, obstacle.minX))
                    * Math.max(0, Math.min(box.maxY, obstacle.maxY) - Math.max(box.minY, obstacle.minY));
            }
            area += boxArea;
            covered += Math.min(boxArea, overlap);
        }
        return area ? covered / area : 0;
    };
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

const continuousPartsCache = new WeakMap();

const visibleAreaCenter = viewport => {
    const occlusions = viewport.occlusions || [];
    if (!occlusions.length) return { x: (viewport.minX + viewport.maxX) / 2, y: (viewport.minY + viewport.maxY) / 2 };
    const cuts = (axis, min, max) => [...new Set([min, max, ...occlusions.flatMap(box => [box[`min${axis}`], box[`max${axis}`]])
        .map(value => Math.max(min, Math.min(max, value)))])].sort((a, b) => a - b);
    const xs = cuts('X', viewport.minX, viewport.maxX);
    const ys = cuts('Y', viewport.minY, viewport.maxY);
    let area = 0;
    let xMoment = 0;
    let yMoment = 0;
    // 少量面板边界划分可见区域，重叠抽屉只扣除一次面积。
    for (let i = 1; i < xs.length; i += 1) for (let j = 1; j < ys.length; j += 1) {
        const x = (xs[i - 1] + xs[i]) / 2;
        const y = (ys[j - 1] + ys[j]) / 2;
        if (occlusions.some(box => x > box.minX && x < box.maxX && y > box.minY && y < box.maxY)) continue;
        const cellArea = (xs[i] - xs[i - 1]) * (ys[j] - ys[j - 1]);
        area += cellArea;
        xMoment += x * cellArea;
        yMoment += y * cellArea;
    }
    return area ? { x: xMoment / area, y: yMoment / area }
        : { x: (viewport.minX + viewport.maxX) / 2, y: (viewport.minY + viewport.maxY) / 2 };
};

export const buildLineNameLabelCandidates = (paths, {
    project, unproject, width, height, zoom, measureText, buildFixedOffset,
    lineIds = null, previous = new Map(), labelScale = 1, previousOnly = false,
    obstacles = [], viewport = { minX: 0, minY: 0, maxX: width, maxY: height }
}) => {
    const fontSize = getLineNameLabelTextSizeForZoom(zoom) * labelScale;
    const byLine = new Map();
    const previousCandidates = new Map();
    const candidatePaths = new WeakMap();
    const coveredRatio = createObstacleLookup(obstacles, fontSize * 8);
    const viewWidth = viewport.maxX - viewport.minX;
    const viewHeight = viewport.maxY - viewport.minY;
    const viewCenter = visibleAreaCenter(viewport);
    if (viewWidth <= 8 || viewHeight <= 8) return { type: 'FeatureCollection', features: [] };
    if (paths && !continuousPartsCache.has(paths)) continuousPartsCache.set(paths, continuousPathParts(paths.features || []));
    const renderedPaths = [];
    for (const parts of (paths && continuousPartsCache.get(paths)) || []) {
        const id = parts[0].feature.properties.id;
        if ((lineIds && !lineIds.has(id)) || (previousOnly && !previous.has(id))) continue;
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
        // 按文字半高、线路半宽及留白贴线排字；避让时沿线换位或换侧，不再向外推远。
        const labelGap = (textHeight + getHighlightLineWidthAtZoom(zoom) * labelScale) / 2 + fontSize * 0.2;
        const pixels = feature.pixels;
        const coordinateCache = new WeakMap();
        const distances = [0];
        const intervals = [];
        for (let i = 1; i < pixels.length; i += 1) {
            const length = Math.hypot(pixels[i].x - pixels[i - 1].x, pixels[i].y - pixels[i - 1].y);
            distances.push(distances[i - 1] + length);
            const clip = clipInterval(pixels[i - 1], pixels[i], viewport);
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
        let previousDistance = null;
        if (previousLabel?.label_path === feature.id) {
            const segment = previousLabel.label_segment;
            // 相机变化只重投影原锚点，不按变化后的屏幕总长度滑动锚点。
            previousDistance = segment > 0 && segment < distances.length
                ? distances[segment - 1] + (distances[segment] - distances[segment - 1]) * previousLabel.label_segment_t
                : previousLabel.label_progress * total;
            positions.add(previousDistance);
        }
        const candidates = byLine.get(props.id) || [];
        byLine.set(props.id, candidates);
        const evaluated = new Set();
        const seeds = [];
        const evaluate = distance => {
            const key = distance.toFixed(4);
            if (evaluated.has(key)) return;
            evaluated.add(key);
            const interval = intervals.find(([start, end]) => distance >= start + minimumHalf && distance <= end - minimumHalf);
            if (!interval) return;
            const center = pointAt(pixels, distances, distance);
            const centerScore = Math.hypot(center.x - viewCenter.x, center.y - viewCenter.y) / Math.hypot(viewWidth, viewHeight) * 12;
            const runStart = pointAt(pixels, distances, distance - textWidth / 2);
            const runEnd = pointAt(pixels, distances, distance + textWidth / 2);
            const usableSpan = Math.hypot(runEnd.x - runStart.x, runEnd.y - runStart.y);
            // 只检查文字对应的原线局部区间；旁置扩张不能把小环线变成长线路。
            // 长线路继续遍历其他区间，不因全线弯折或首尾重合而被隐藏。
            if (usableSpan < textWidth * 0.8) {
                return { distance, score: 100 + centerScore + (1 - usableSpan / textWidth) * 20 };
            }
            const halfWindow = Math.min((textWidth + fontSize * 2) / 2, distance - interval[0], interval[1] - distance);
            const windowPixels = slicePath(pixels, distances, distance - halfWindow, distance + halfWindow);
            // miter 旁置与距离成比例，同一窗口只计算一次法线和交点。
            const unitOffset = buildFixedOffset(windowPixels, 1, { preserveVertices: true });
            let bestScore = Infinity;
            const localCandidates = [];
            // 两侧和沿线其他位置都是备用，碰撞失败交给原生流程继续尝试。
            for (const side of previousOnly ? [previousLabel.label_side] : [1, -1]) {
                const gap = labelGap * side;
                const labelPixels = windowPixels.map((point, index) => ({
                    x: point.x + (unitOffset[index].x - point.x) * gap,
                    y: point.y + (unitOffset[index].y - point.y) * gap
                }));
                const labelDistances = measurePath(labelPixels);
                const turn = readablePathTurn(labelPixels, textWidth, fontSize, labelDistances);
                if (turn === null) continue;
                const boxes = labelPathBoxes(labelPixels, textWidth, textHeight, labelDistances);
                if (viewport.occlusions?.some(occlusion => boxes.some(box => box.minX < occlusion.maxX && box.maxX > occlusion.minX
                    && box.minY < occlusion.maxY && box.maxY > occlusion.minY))) continue;
                let clearance = Infinity;
                for (const box of boxes) clearance = Math.min(clearance, box.minX - viewport.minX, viewport.maxX - box.maxX,
                    box.minY - viewport.minY, viewport.maxY - box.maxY);
                if (clearance < 4) continue;
                const samePrevious = previousDistance !== null
                    && Math.abs(previousDistance - distance) < 0.001 && previousLabel.label_side === side;
                const score = turn * 8 + centerScore + coveredRatio(boxes) * 100
                    + Math.max(0, textHeight * 2 - clearance) / (textHeight * 2) * 8
                    + (side < 0 ? 1 : 0);
                bestScore = Math.min(bestScore, score);
                const candidate = {
                    type: 'Feature', id: `${feature.id}.${(distance / total).toFixed(6)}.${side}`,
                    properties: { id: props.id, name: props.name, color: props.color, _dark_color: props._dark_color,
                        type: 'line-name-label', label_font_size: fontSize,
                        label_width: textWidth, label_height: textHeight, label_score: score,
                        label_path: feature.id, label_progress: distance / total, label_side: side,
                        label_segment: center.index, label_segment_t: (distance - distances[center.index - 1]) / (distances[center.index] - distances[center.index - 1] || 1) },
                    geometry: { type: 'LineString', coordinates: [] }
                };
                candidatePaths.set(candidate, { labelPixels, windowPixels, coordinateCache });
                localCandidates.push(candidate);
                if (samePrevious) previousCandidates.set(props.id, candidate);
            }
            return { distance, score: Number.isFinite(bestScore) ? bestScore : 100 + centerScore, candidates: localCandidates };
        };
        for (const distance of positions) {
            const seed = evaluate(distance);
            if (seed) {
                seeds.push(seed);
                candidates.push(...(seed.candidates || []));
            }
        }
        if (!previousOnly) {
            // 只细搜粗排中较好的局部窗口；全线其他粗候选仍保留为备用。
            const refined = [];
            for (const seed of seeds.sort((a, b) => a.score - b.score)) {
                if (refined.some(distance => Math.abs(seed.distance - distance) < stride * 0.75)) continue;
                refined.push(seed.distance);
                const localBest = new Map((seed.candidates || []).map(candidate => [candidate.properties.label_side, candidate]));
                for (const offset of [-0.5, -0.25, 0.25, 0.5]) {
                    const result = evaluate(seed.distance + stride * offset);
                    for (const candidate of result?.candidates || []) {
                        const side = candidate.properties.label_side;
                        if (!localBest.has(side) || candidate.properties.label_score < localBest.get(side).properties.label_score) localBest.set(side, candidate);
                    }
                }
                // 每个局部窗口只补充各侧更好的位置，保留全线粗候选供原生碰撞回退。
                for (const candidate of localBest.values()) if (!seed.candidates?.includes(candidate)) candidates.push(candidate);
                if (refined.length === 3) break;
            }
        }
    }
    const features = [];
    for (const candidates of byLine.values()) {
        candidates.sort((a, b) => a.properties.label_score - b.properties.label_score || a.id.localeCompare(b.id));
        const previousCandidate = previousCandidates.get(candidates[0]?.properties.id);
        // 质量相近才保持原位置；明显遮挡、靠边或远离可见区域时允许迁移。
        if (previousCandidate && previousCandidate.properties.label_score <= candidates[0].properties.label_score + 1.5) {
            candidates.splice(candidates.indexOf(previousCandidate), 1);
            candidates.unshift(previousCandidate);
        }
        candidates.forEach((feature, index) => {
            // 各线路先尝试首选，再轮到备用，显示数量由成功放置决定。
            feature.properties.label_rank = index * 100 + Math.max(0, feature.properties.label_score);
            const { labelPixels, windowPixels, coordinateCache } = candidatePaths.get(feature);
            const side = feature.properties.label_side;
            feature.geometry.coordinates = labelPixels.map((point, vertexIndex) => {
                const vertex = windowPixels[vertexIndex];
                // 仅为实际提交的候选转换坐标，内部原始顶点在相邻窗口间复用。
                const cacheable = vertexIndex > 1 && vertexIndex < windowPixels.length - 2
                    && Math.hypot(vertex.x - windowPixels[vertexIndex - 1].x, vertex.y - windowPixels[vertexIndex - 1].y) > 1e-8
                    && Math.hypot(vertex.x - windowPixels[vertexIndex + 1].x, vertex.y - windowPixels[vertexIndex + 1].y) > 1e-8;
                if (cacheable && coordinateCache.get(vertex)?.has(side)) return coordinateCache.get(vertex).get(side);
                const lngLat = unproject(point);
                const coordinate = Array.isArray(lngLat) ? lngLat : [lngLat.lng, lngLat.lat];
                if (cacheable) {
                    if (!coordinateCache.has(vertex)) coordinateCache.set(vertex, new Map());
                    coordinateCache.get(vertex).set(side, coordinate);
                }
                return coordinate;
            });
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
