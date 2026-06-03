const toText = (value) => String(value ?? '').trim();

const isFiniteCoordinate = (coord) => (
    Array.isArray(coord)
    && coord.length >= 2
    && Number.isFinite(Number(coord[0]))
    && Number.isFinite(Number(coord[1]))
);

const normalizeCoordinate = (coord) => [Number(coord[0]), Number(coord[1])];

const distanceSq = (a, b) => {
    if (!isFiniteCoordinate(a) || !isFiniteCoordinate(b)) return 0;
    const dx = Number(a[0]) - Number(b[0]);
    const dy = Number(a[1]) - Number(b[1]);
    return dx * dx + dy * dy;
};

const flattenLineChains = (geometry) => {
    if (!geometry || typeof geometry !== 'object') return [];
    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        const chain = geometry.coordinates.filter(isFiniteCoordinate).map(normalizeCoordinate);
        return chain.length >= 2 ? [chain] : [];
    }
    if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
        return geometry.coordinates
            .filter(Array.isArray)
            .map((chain) => chain.filter(isFiniteCoordinate).map(normalizeCoordinate))
            .filter((chain) => chain.length >= 2);
    }
    return [];
};

const getChainLength = (chain) => {
    if (!Array.isArray(chain) || chain.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < chain.length; i += 1) {
        length += Math.sqrt(distanceSq(chain[i - 1], chain[i]));
    }
    return length;
};

const getLongestChain = (chains) => {
    let best = null;
    let bestLength = 0;
    for (const chain of Array.isArray(chains) ? chains : []) {
        const length = getChainLength(chain);
        if (length > bestLength) {
            best = chain;
            bestLength = length;
        }
    }
    return { chain: best, length: bestLength };
};

export const pickLineHighlightLabelCoordinate = (geometry) => {
    const { chain, length } = getLongestChain(flattenLineChains(geometry));
    if (!Array.isArray(chain) || chain.length < 2) return null;
    if (length <= 0) return normalizeCoordinate(chain[Math.floor(chain.length / 2)]);

    const target = length / 2;
    let walked = 0;
    for (let i = 1; i < chain.length; i += 1) {
        const from = chain[i - 1];
        const to = chain[i];
        const segmentLength = Math.sqrt(distanceSq(from, to));
        if (segmentLength <= 0) continue;
        if (walked + segmentLength >= target) {
            const ratio = (target - walked) / segmentLength;
            return [
                Number(from[0]) + (Number(to[0]) - Number(from[0])) * ratio,
                Number(from[1]) + (Number(to[1]) - Number(from[1])) * ratio
            ];
        }
        walked += segmentLength;
    }
    return normalizeCoordinate(chain[Math.floor(chain.length / 2)]);
};

export const buildLineHighlightLabelItems = ({
    lineIds,
    lineFeatureById,
    getLineColor = () => '',
    getLineIconText = () => '',
    getLineName = (lineId) => lineId
} = {}) => {
    const ids = lineIds instanceof Set
        ? Array.from(lineIds)
        : (Array.isArray(lineIds) ? lineIds : []);
    const seen = new Set();
    const items = [];

    for (const rawId of ids) {
        const lineId = toText(rawId);
        if (!lineId || seen.has(lineId)) continue;
        seen.add(lineId);

        const feature = lineFeatureById instanceof Map ? lineFeatureById.get(lineId) : null;
        const coordinate = pickLineHighlightLabelCoordinate(feature?.geometry);
        if (!coordinate) continue;

        items.push({
            lineId,
            coordinate,
            lineName: toText(getLineName(lineId)) || lineId,
            iconText: toText(getLineIconText(lineId)),
            color: toText(getLineColor(lineId))
        });
    }

    return items;
};
