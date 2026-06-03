const toText = (value) => String(value ?? '').trim();
const LINE_NAME_LABEL_BLOCKED_TOKENS = Object.freeze(['货物', '貨物', '支线', '支線']);
const LINE_NAME_LABEL_NORMAL_OFFSET_EM = 1.1;
const LINE_NAME_LABEL_LINE_OFFSET_EM_PER_UNIT = 1 / 3;
const DEGREE_TO_RADIAN = Math.PI / 180;
const EARTH_RADIUS_METERS = 6371000;
const LABEL_SEGMENT_MIN_METERS = 6000;
const LABEL_SEGMENT_MAX_METERS = 18000;
const LABEL_ANCHOR_SEGMENT_MIN_METERS = 4200;
const LABEL_ANCHOR_SEGMENT_MAX_METERS = 9000;

const isLineGeometry = (geometry) => (
    (geometry?.type === 'LineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2)
    || (geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0)
);

const isFiniteCoordinate = (coord) => (
    Array.isArray(coord)
    && coord.length >= 2
    && Number.isFinite(Number(coord[0]))
    && Number.isFinite(Number(coord[1]))
);

const normalizeCoordinate = (coord) => [Number(coord[0]), Number(coord[1])];

const flattenLineChains = (geometry) => {
    if (geometry?.type === 'LineString') {
        const chain = (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
            .filter(isFiniteCoordinate)
            .map(normalizeCoordinate);
        return chain.length >= 2 ? [chain] : [];
    }

    if (geometry?.type === 'MultiLineString') {
        return (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
            .filter(Array.isArray)
            .map((chain) => chain.filter(isFiniteCoordinate).map(normalizeCoordinate))
            .filter((chain) => chain.length >= 2);
    }

    return [];
};

const approxDistanceMeters = (a, b) => {
    if (!isFiniteCoordinate(a) || !isFiniteCoordinate(b)) return 0;
    const lng1 = Number(a[0]);
    const lat1 = Number(a[1]);
    const lng2 = Number(b[0]);
    const lat2 = Number(b[1]);
    const meanLat = ((lat1 + lat2) / 2) * DEGREE_TO_RADIAN;
    const x = (lng2 - lng1) * DEGREE_TO_RADIAN * Math.cos(meanLat);
    const y = (lat2 - lat1) * DEGREE_TO_RADIAN;
    return Math.hypot(x, y) * EARTH_RADIUS_METERS;
};

const chainLengthMeters = (chain) => {
    if (!Array.isArray(chain) || chain.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < chain.length; i += 1) {
        length += approxDistanceMeters(chain[i - 1], chain[i]);
    }
    return length;
};

const getLongestChain = (chains) => {
    let best = null;
    let bestLength = 0;
    for (const chain of chains) {
        const length = chainLengthMeters(chain);
        if (length > bestLength) {
            best = chain;
            bestLength = length;
        }
    }
    return { chain: best, length: bestLength };
};

const pointAtDistance = (chain, distanceMeters) => {
    if (!Array.isArray(chain) || !chain.length) return null;
    if (chain.length === 1) return chain[0];

    const target = Math.max(0, Number(distanceMeters) || 0);
    let walked = 0;
    for (let i = 1; i < chain.length; i += 1) {
        const from = chain[i - 1];
        const to = chain[i];
        const segmentLength = approxDistanceMeters(from, to);
        if (segmentLength <= 0) continue;
        if (walked + segmentLength >= target) {
            const ratio = (target - walked) / segmentLength;
            return [
                from[0] + (to[0] - from[0]) * ratio,
                from[1] + (to[1] - from[1]) * ratio
            ];
        }
        walked += segmentLength;
    }
    return chain[chain.length - 1];
};

const destinationCoordinate = (coordinate, bearing, distanceMeters) => {
    if (!isFiniteCoordinate(coordinate) || !Number.isFinite(bearing) || !Number.isFinite(distanceMeters)) {
        return null;
    }

    const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
    const bearingRadians = bearing * DEGREE_TO_RADIAN;
    const lng1 = Number(coordinate[0]) * DEGREE_TO_RADIAN;
    const lat1 = Number(coordinate[1]) * DEGREE_TO_RADIAN;

    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinAngular = Math.sin(angularDistance);
    const cosAngular = Math.cos(angularDistance);
    const lat2 = Math.asin(
        sinLat1 * cosAngular + cosLat1 * sinAngular * Math.cos(bearingRadians)
    );
    const lng2 = lng1 + Math.atan2(
        Math.sin(bearingRadians) * sinAngular * cosLat1,
        cosAngular - sinLat1 * Math.sin(lat2)
    );

    return [
        ((((lng2 / DEGREE_TO_RADIAN) + 540) % 360) - 180),
        lat2 / DEGREE_TO_RADIAN
    ];
};

const sliceChainByDistance = (chain, startMeters, endMeters) => {
    if (!Array.isArray(chain) || chain.length < 2) return null;
    const total = chainLengthMeters(chain);
    const start = Math.max(0, Math.min(total, Number(startMeters) || 0));
    const end = Math.max(start, Math.min(total, Number(endMeters) || 0));
    if (end <= start) return null;

    const points = [pointAtDistance(chain, start)];
    let walked = 0;
    for (let i = 1; i < chain.length; i += 1) {
        const segmentLength = approxDistanceMeters(chain[i - 1], chain[i]);
        const nextWalked = walked + segmentLength;
        if (nextWalked > start && nextWalked < end) {
            points.push(chain[i]);
        }
        walked = nextWalked;
        if (walked >= end) break;
    }
    points.push(pointAtDistance(chain, end));

    const out = [];
    for (const point of points.filter(isFiniteCoordinate).map(normalizeCoordinate)) {
        const prev = out[out.length - 1];
        if (prev && approxDistanceMeters(prev, point) < 1) continue;
        out.push(point);
    }
    return out.length >= 2 ? out : null;
};

const bearingDegrees = (a, b) => {
    if (!isFiniteCoordinate(a) || !isFiniteCoordinate(b)) return null;
    const lng1 = Number(a[0]) * DEGREE_TO_RADIAN;
    const lat1 = Number(a[1]) * DEGREE_TO_RADIAN;
    const lng2 = Number(b[0]) * DEGREE_TO_RADIAN;
    const lat2 = Number(b[1]) * DEGREE_TO_RADIAN;
    const y = Math.sin(lng2 - lng1) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lng2 - lng1);
    return ((Math.atan2(y, x) / DEGREE_TO_RADIAN) + 360) % 360;
};

const angleDelta = (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    const delta = Math.abs(a - b) % 360;
    return delta > 180 ? 360 - delta : delta;
};

const bendScore = (chain) => {
    if (!Array.isArray(chain) || chain.length < 3) return 0;
    let score = 0;
    let prevBearing = null;
    for (let i = 1; i < chain.length; i += 1) {
        const nextBearing = bearingDegrees(chain[i - 1], chain[i]);
        if (prevBearing != null && nextBearing != null) {
            score += angleDelta(prevBearing, nextBearing);
        }
        if (nextBearing != null) prevBearing = nextBearing;
    }
    return score;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const isVisibleLineFeature = (feature) => {
    const props = feature?.properties || {};
    const lineId = toText(props.id || feature?.id);
    return Boolean(
        lineId
        && !lineId.startsWith('Base.')
        && Number(props.hidden_by_opacity_zero) !== 1
        && isLineGeometry(feature?.geometry)
    );
};

const shouldShowLineNameLabel = (name) => {
    const text = toText(name);
    if (!text) return false;
    return !LINE_NAME_LABEL_BLOCKED_TOKENS.some((token) => text.includes(token));
};

const roundOffset = (value) => Math.round(value * 10000) / 10000;

const buildLineNameTextOffset = (lineOffsetUnits) => {
    const units = Number(lineOffsetUnits);

    if (!Number.isFinite(units)) {
        return [0, LINE_NAME_LABEL_NORMAL_OFFSET_EM];
    }

    if (units === 0) {
        return [0, LINE_NAME_LABEL_NORMAL_OFFSET_EM];
    }

    const direction = Math.sign(units);
    const distance =
        Math.abs(units) * LINE_NAME_LABEL_LINE_OFFSET_EM_PER_UNIT
        + LINE_NAME_LABEL_NORMAL_OFFSET_EM;

    return [0, roundOffset(direction * distance)];
};

const getLabelCountForLength = (lengthMeters) => {
    return 1;
};

const getTargetFractions = (count) => {
    if (count >= 3) return [0.23, 0.5, 0.77];
    if (count === 2) return [0.34, 0.66];
    return [0.5];
};

const getCandidateFractions = (target) => {
    const offsets = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24];
    const seen = new Set();
    const out = [];
    for (const offset of offsets) {
        const value = clamp(target + offset, 0.08, 0.92);
        const key = value.toFixed(3);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

const buildLabelSegments = (geometry) => {
    const { chain, length } = getLongestChain(flattenLineChains(geometry));
    if (!Array.isArray(chain) || chain.length < 2 || length <= 0) return [];

    const count = getLabelCountForLength(length);
    const windowMeters = Math.min(
        length,
        clamp(length / Math.max(2.5, count * 2.2), LABEL_SEGMENT_MIN_METERS, LABEL_SEGMENT_MAX_METERS)
    );

    const segments = [];
    for (const targetFraction of getTargetFractions(count)) {
        let best = null;
        for (const fraction of getCandidateFractions(targetFraction)) {
            const center = length * fraction;
            const start = center - windowMeters / 2;
            const end = center + windowMeters / 2;
            const segment = sliceChainByDistance(chain, start, end);
            if (!segment) continue;
            const score = bendScore(segment) + Math.abs(fraction - targetFraction) * 100;
            if (!best || score < best.score) {
                best = { segment, score };
            }
        }
        if (best?.segment) segments.push(best.segment);
    }

    return segments;
};

const getAnchorSegmentLengthMeters = (name) => {
    const textLength = Array.from(toText(name)).length;
    return clamp(
        textLength * 900 + 2800,
        LABEL_ANCHOR_SEGMENT_MIN_METERS,
        LABEL_ANCHOR_SEGMENT_MAX_METERS
    );
};

const buildLineNameAnchorSegment = (segment, name) => {
    const length = chainLengthMeters(segment);
    if (!Array.isArray(segment) || segment.length < 2 || length <= 0) return null;

    const centerDistance = length / 2;
    const center = pointAtDistance(segment, centerDistance);
    const tangentWindow = Math.max(200, Math.min(1200, length / 4));
    const from = pointAtDistance(segment, Math.max(0, centerDistance - tangentWindow));
    const to = pointAtDistance(segment, Math.min(length, centerDistance + tangentWindow));
    const bearing = bearingDegrees(from, to);
    if (!isFiniteCoordinate(center) || !Number.isFinite(bearing)) return null;

    const halfLength = getAnchorSegmentLengthMeters(name) / 2;
    const start = destinationCoordinate(center, (bearing + 180) % 360, halfLength);
    const end = destinationCoordinate(center, bearing, halfLength);
    return isFiniteCoordinate(start) && isFiniteCoordinate(end) ? [start, end] : null;
};

export const buildLineNameLabelGeoJSON = (lineFeatures = []) => {
    const features = [];
    const seen = new Set();

    for (const feature of Array.isArray(lineFeatures) ? lineFeatures : []) {
        if (!isVisibleLineFeature(feature)) continue;

        const props = feature.properties || {};
        const lineId = toText(props.id || feature.id);
        if (!lineId || seen.has(lineId)) continue;

        const name = toText(props.name) || lineId;
        if (!shouldShowLineNameLabel(name)) continue;
        const lineOffsetUnits = Number(props.line_offset_units) || 0;

        const labelSegments = buildLabelSegments(feature.geometry);
        if (!labelSegments.length) continue;

        seen.add(lineId);
        const labelCount = labelSegments.length;
        labelSegments.forEach((segment, index) => {
            const anchorSegment = buildLineNameAnchorSegment(segment, name);
            if (!anchorSegment) return;
            features.push({
                type: 'Feature',
                id: labelCount === 1 ? `${lineId}.name-label` : `${lineId}.name-label.${index + 1}`,
                properties: {
                    id: lineId,
                    name,
                    color: toText(props.color),
                    line_offset_units: lineOffsetUnits,
                    text_offset: buildLineNameTextOffset(lineOffsetUnits),
                    label_index: index + 1,
                    label_count: labelCount,
                    type: 'line-name-label'
                },
                geometry: {
                    type: 'LineString',
                    coordinates: anchorSegment
                }
            });
        });
    }

    return { type: 'FeatureCollection', features };
};
