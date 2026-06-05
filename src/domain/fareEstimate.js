const normalizeText = (value) => String(value ?? '').trim();

const uniqueTextList = (values) => {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const text = normalizeText(value);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
};

const compactTextList = (values) => {
    const out = [];
    for (const value of Array.isArray(values) ? values : []) {
        const text = normalizeText(value);
        if (!text) continue;
        if (out[out.length - 1] === text) continue;
        out.push(text);
    }
    return out;
};

export const mapStopIdToFareStationId = (stopId) => {
    const id = normalizeText(stopId);
    if (!id) return '';

    const parts = id.split('.').map((part) => normalizeText(part)).filter(Boolean);
    if (parts.length < 2) return '';
    if (parts.length === 2) return `${parts[0]}.${parts[1]}`;
    return `${parts[0]}.${parts[parts.length - 1]}`;
};

export const getFareOperatorId = (fareStationId) => {
    const id = normalizeText(fareStationId);
    if (!id) return '';
    return normalizeText(id.split('.')[0] || '');
};

const getLineOperatorId = (lineId) => getFareOperatorId(lineId);

const getFareStationBaseName = (fareStationId) => {
    const id = normalizeText(fareStationId);
    const parts = id.split('.');
    return normalizeText(parts.length > 1 ? parts.slice(1).join('.') : id);
};

const collectFareStationWaypoints = ({ fromStop, legs, toStop } = {}) => {
    const legList = Array.isArray(legs) ? legs : [];
    const stops = [];

    if (legList.length) {
        for (const leg of legList) {
            stops.push(leg?.fromStop);
            stops.push(leg?.toStop);
        }
    } else {
        stops.push(fromStop, toStop);
    }

    return compactTextList(stops.map((stopId) => mapStopIdToFareStationId(stopId)));
};

const createRawFareSection = (source, index, sourceType) => {
    const fromStop = normalizeText(source?.fromStop || source?.legs?.[0]?.fromStop || '');
    const toStop = normalizeText(source?.toStop || source?.legs?.[source.legs.length - 1]?.toStop || '');
    if (!fromStop || !toStop) return null;

    const lineIds = uniqueTextList([
        ...(Array.isArray(source?.lineIds) ? source.lineIds : []),
        ...(Array.isArray(source?.legs) ? source.legs.map((leg) => leg?.lineId) : []),
        source?.lineId
    ]);
    const fromFareStationId = mapStopIdToFareStationId(fromStop);
    const toFareStationId = mapStopIdToFareStationId(toStop);
    const fareStationWaypoints = collectFareStationWaypoints({
        fromStop,
        legs: source?.legs,
        toStop
    });

    return {
        index,
        sourceType,
        fromStop,
        toStop,
        fromFareStationId,
        toFareStationId,
        fromOperatorId: getFareOperatorId(fromFareStationId),
        toOperatorId: getFareOperatorId(toFareStationId),
        fareStationWaypoints,
        allowedOperatorIds: uniqueTextList([
            ...lineIds.map((lineId) => getLineOperatorId(lineId)),
            getFareOperatorId(fromFareStationId),
            getFareOperatorId(toFareStationId),
            ...fareStationWaypoints.map((stationId) => getFareOperatorId(stationId))
        ]),
        lineIds
    };
};

const getRawFareSections = (displayPlan) => {
    const sections = Array.isArray(displayPlan?.sections) ? displayPlan.sections : [];
    const source = sections.length ? sections : (Array.isArray(displayPlan?.legs) ? displayPlan.legs : []);
    const sourceType = sections.length ? 'section' : 'leg';
    return source
        .map((item, index) => createRawFareSection(item, index, sourceType))
        .filter(Boolean);
};

const canMergeSameOperatorFareSection = (previous, current) => {
    if (!previous || !current) return false;
    if (!previous.fromOperatorId || !previous.toOperatorId || !current.fromOperatorId || !current.toOperatorId) return false;
    if (previous.fromOperatorId !== previous.toOperatorId) return false;
    if (current.fromOperatorId !== current.toOperatorId) return false;
    return previous.toOperatorId === current.fromOperatorId;
};

export const buildFareChainFromDisplayPlan = (displayPlan) => {
    const rawSections = getRawFareSections(displayPlan);
    const chain = [];

    for (const section of rawSections) {
        if (!section.fromFareStationId || !section.toFareStationId) {
            chain.push({
                ...section,
                missingMapping: true
            });
            continue;
        }

        const previous = chain[chain.length - 1] || null;
        if (canMergeSameOperatorFareSection(previous, section)) {
            previous.toStop = section.toStop;
            previous.toFareStationId = section.toFareStationId;
            previous.toOperatorId = section.toOperatorId;
            previous.fareStationWaypoints = compactTextList([
                ...(previous.fareStationWaypoints || []),
                ...(section.fareStationWaypoints || [])
            ]);
            previous.allowedOperatorIds = uniqueTextList([
                ...(previous.allowedOperatorIds || []),
                ...(section.allowedOperatorIds || [])
            ]);
            previous.lineIds = uniqueTextList([...(previous.lineIds || []), ...(section.lineIds || [])]);
            previous.sourceIndexes = uniqueTextList([...(previous.sourceIndexes || []), String(section.index)]);
            continue;
        }

        chain.push({
            ...section,
            sourceIndexes: [String(section.index)]
        });
    }

    return chain;
};

const getFareEdge = (fareGraph, fromFareStationId, toFareStationId) => {
    const graph = fareGraph && typeof fareGraph === 'object' ? fareGraph : null;
    const from = normalizeText(fromFareStationId);
    const to = normalizeText(toFareStationId);
    if (!graph || !from || !to) return { edge: null, reversed: false };

    const direct = graph?.[from]?.[to];
    if (direct && typeof direct === 'object') return { edge: direct, reversed: false };

    const reverse = graph?.[to]?.[from];
    if (reverse && typeof reverse === 'object') return { edge: reverse, reversed: true };

    return { edge: null, reversed: false };
};

const readFareAmount = (edge, fareType) => {
    const type = normalizeText(fareType) || 'ic_card_fare';
    const amount = Number(edge?.[type]);
    if (Number.isFinite(amount)) return amount;
    const fallback = Number(edge?.ic_card_fare);
    return Number.isFinite(fallback) ? fallback : null;
};

const createOperatorAllowSet = (operatorIds) => {
    const ids = uniqueTextList(operatorIds);
    return ids.length ? new Set(ids) : null;
};

const isFareStationOperatorAllowed = (fareStationId, allowSet) => (
    !allowSet || allowSet.has(getFareOperatorId(fareStationId))
);

const isFareEdgeCompatibleWithOperators = (edge, allowSet) => {
    if (!allowSet || !edge || typeof edge !== 'object') return true;
    const edgePath = Array.isArray(edge.path) ? edge.path : [];
    return edgePath.every((stationId) => isFareStationOperatorAllowed(stationId, allowSet));
};

class MinHeap {
    constructor(compare) {
        this.heap = [];
        this.compare = typeof compare === 'function' ? compare : ((a, b) => a - b);
    }

    get size() {
        return this.heap.length;
    }

    push(value) {
        this.heap.push(value);
        let index = this.heap.length - 1;
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.compare(this.heap[index], this.heap[parent]) >= 0) break;
            const tmp = this.heap[index];
            this.heap[index] = this.heap[parent];
            this.heap[parent] = tmp;
            index = parent;
        }
    }

    pop() {
        if (!this.heap.length) return null;
        const top = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length && last != null) {
            this.heap[0] = last;
            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;
                if (left < this.heap.length && this.compare(this.heap[left], this.heap[smallest]) < 0) smallest = left;
                if (right < this.heap.length && this.compare(this.heap[right], this.heap[smallest]) < 0) smallest = right;
                if (smallest === index) break;
                const tmp = this.heap[index];
                this.heap[index] = this.heap[smallest];
                this.heap[smallest] = tmp;
                index = smallest;
            }
        }
        return top;
    }
}

const reconstructFarePath = (previous, start, goal) => {
    const path = [];
    let node = normalizeText(goal);
    const startId = normalizeText(start);
    let safety = 0;
    while (node && safety < 4096) {
        safety += 1;
        path.push(node);
        if (node === startId) break;
        node = previous.get(node) || '';
    }
    path.reverse();
    return path[0] === startId ? path : [];
};

export const findFareGraphPath = ({
    allowedOperatorIds,
    fareGraph,
    fareType = 'ic_card_fare',
    fromFareStationId,
    toFareStationId
} = {}) => {
    const graph = fareGraph && typeof fareGraph === 'object' ? fareGraph : null;
    const start = normalizeText(fromFareStationId);
    const goal = normalizeText(toFareStationId);
    if (!graph || !start || !goal || !graph[start]) return null;
    const allowSet = createOperatorAllowSet(allowedOperatorIds);
    if (!isFareStationOperatorAllowed(start, allowSet) || !isFareStationOperatorAllowed(goal, allowSet)) return null;
    if (start === goal) return { amount: 0, path: [start], details: [] };

    const distances = new Map([[start, 0]]);
    const previous = new Map();
    const queue = new MinHeap((a, b) => a.cost - b.cost);
    queue.push({ node: start, cost: 0 });

    while (queue.size) {
        const current = queue.pop();
        if (!current) break;
        if (current.cost > (distances.get(current.node) ?? Infinity)) continue;
        if (current.node === goal) break;

        const neighbors = graph[current.node] && typeof graph[current.node] === 'object'
            ? graph[current.node]
            : {};
        for (const [neighborRaw, edge] of Object.entries(neighbors)) {
            const neighbor = normalizeText(neighborRaw);
            if (!neighbor) continue;
            if (!isFareStationOperatorAllowed(neighbor, allowSet)) continue;
            if (!isFareEdgeCompatibleWithOperators(edge, allowSet)) continue;
            const amount = readFareAmount(edge, fareType);
            if (amount == null) continue;
            const nextCost = current.cost + amount;
            if (nextCost >= (distances.get(neighbor) ?? Infinity)) continue;
            distances.set(neighbor, nextCost);
            previous.set(neighbor, current.node);
            queue.push({ node: neighbor, cost: nextCost });
        }
    }

    const amount = distances.get(goal);
    if (!Number.isFinite(amount)) return null;

    const path = reconstructFarePath(previous, start, goal);
    const details = [];
    for (let i = 0; i < path.length - 1; i += 1) {
        const from = path[i];
        const to = path[i + 1];
        const edge = graph?.[from]?.[to] || null;
        details.push({
            from,
            to,
            amount: readFareAmount(edge, fareType)
        });
    }

    return { amount, path, details };
};

const findFareGraphPathThroughWaypoints = ({
    allowedOperatorIds,
    fareGraph,
    fareType,
    waypoints
} = {}) => {
    const points = compactTextList(waypoints);
    if (points.length < 2) return null;

    const details = [];
    const path = [];
    let amount = 0;

    for (let i = 0; i < points.length - 1; i += 1) {
        const part = findFareGraphPath({
            allowedOperatorIds,
            fareGraph,
            fareType,
            fromFareStationId: points[i],
            toFareStationId: points[i + 1]
        });
        if (!part) return null;
        amount += part.amount;
        details.push(...part.details);
        if (!path.length) path.push(...part.path);
        else path.push(...part.path.slice(1));
    }

    return { amount, path, details };
};

const shouldApplyMetroToeiTransferDiscount = (previous, current) => {
    if (!previous?.matched || !current?.matched) return false;
    if (!Number.isFinite(Number(previous.amount)) || !Number.isFinite(Number(current.amount))) return false;

    const previousOperator = getFareOperatorId(previous.toFareStationId);
    const currentOperator = getFareOperatorId(current.fromFareStationId);
    const operators = [previousOperator, currentOperator].sort().join('|');
    if (operators !== 'Toei|TokyoMetro') return false;

    return getFareStationBaseName(previous.toFareStationId) === getFareStationBaseName(current.fromFareStationId);
};

const buildFareAdjustments = (segments) => {
    const adjustments = [];
    const list = Array.isArray(segments) ? segments : [];
    for (let i = 1; i < list.length; i += 1) {
        const previous = list[i - 1];
        const current = list[i];
        if (!shouldApplyMetroToeiTransferDiscount(previous, current)) continue;
        adjustments.push({
            type: 'metro-toei-transfer-discount',
            amount: -70,
            currency: 'JPY',
            fromFareStationId: previous.toFareStationId,
            toFareStationId: current.fromFareStationId,
            segmentIndexes: [i - 1, i]
        });
    }
    return adjustments;
};

export const estimateFareForJourneyPlan = ({
    displayPlan,
    fareGraph,
    fareType = 'ic_card_fare'
} = {}) => {
    const fareChain = buildFareChainFromDisplayPlan(displayPlan);
    const hasFareGraph = fareGraph && typeof fareGraph === 'object';
    const segments = [];
    const missingSegments = [];
    let totalAmount = 0;

    for (const section of fareChain) {
        const base = {
            fromStop: section.fromStop,
            toStop: section.toStop,
            fromFareStationId: section.fromFareStationId,
            toFareStationId: section.toFareStationId,
            lineIds: Array.isArray(section.lineIds) ? section.lineIds.slice() : [],
            fareStationWaypoints: Array.isArray(section.fareStationWaypoints) ? section.fareStationWaypoints.slice() : [],
            allowedOperatorIds: Array.isArray(section.allowedOperatorIds) ? section.allowedOperatorIds.slice() : [],
            sourceType: section.sourceType,
            sourceIndexes: Array.isArray(section.sourceIndexes) ? section.sourceIndexes.slice() : []
        };

        if (section.missingMapping || !section.fromFareStationId || !section.toFareStationId) {
            const missing = { ...base, reason: 'missing-station-mapping' };
            segments.push({ ...base, amount: null, matched: false, reason: missing.reason });
            missingSegments.push(missing);
            continue;
        }

        if (section.fromFareStationId === section.toFareStationId) {
            segments.push({ ...base, amount: 0, matched: true, reason: 'same-fare-station' });
            continue;
        }

        if (!hasFareGraph) {
            const missing = { ...base, reason: 'missing-fare-graph' };
            segments.push({ ...base, amount: null, matched: false, reason: missing.reason });
            missingSegments.push(missing);
            continue;
        }

        const { edge, reversed } = getFareEdge(fareGraph, section.fromFareStationId, section.toFareStationId);
        const allowSet = createOperatorAllowSet(section.allowedOperatorIds);
        const amount = readFareAmount(edge, fareType);
        if (amount != null && isFareEdgeCompatibleWithOperators(edge, allowSet)) {
            totalAmount += amount;
            segments.push({ ...base, amount, matched: true, reversed, matchType: 'direct-edge' });
            continue;
        }

        const constrainedWaypoints = compactTextList(section.fareStationWaypoints);
        const pathResult = constrainedWaypoints.length > 2
            ? findFareGraphPathThroughWaypoints({
                allowedOperatorIds: section.allowedOperatorIds,
                fareGraph,
                fareType,
                waypoints: constrainedWaypoints
            })
            : findFareGraphPath({
                allowedOperatorIds: section.allowedOperatorIds,
                fareGraph,
                fareType,
                fromFareStationId: section.fromFareStationId,
                toFareStationId: section.toFareStationId
            });
        if (!pathResult) {
            const missing = { ...base, reason: edge ? 'missing-fare-amount' : 'missing-fare-path' };
            segments.push({ ...base, amount: null, matched: false, reason: missing.reason });
            missingSegments.push(missing);
            continue;
        }

        totalAmount += pathResult.amount;
        segments.push({
            ...base,
            amount: pathResult.amount,
            matched: true,
            matchType: 'fare-graph-path',
            farePath: pathResult.path,
            fareDetails: pathResult.details
        });
    }

    let confidence = 'complete';
    if (!fareChain.length) confidence = 'no-chain';
    else if (!hasFareGraph) confidence = 'missing-data';
    else if (missingSegments.length) confidence = 'partial';

    const adjustments = confidence === 'complete' ? buildFareAdjustments(segments) : [];
    for (const adjustment of adjustments) totalAmount += adjustment.amount;

    return {
        currency: 'JPY',
        fareType: normalizeText(fareType) || 'ic_card_fare',
        totalAmount: confidence === 'no-chain' || confidence === 'missing-data' ? null : totalAmount,
        confidence,
        segments,
        missingSegments,
        adjustments
    };
};
