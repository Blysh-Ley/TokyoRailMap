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

    return {
        index,
        sourceType,
        fromStop,
        toStop,
        fromFareStationId,
        toFareStationId,
        fromOperatorId: getFareOperatorId(fromFareStationId),
        toOperatorId: getFareOperatorId(toFareStationId),
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
    fareGraph,
    fareType = 'ic_card_fare',
    fromFareStationId,
    toFareStationId
} = {}) => {
    const graph = fareGraph && typeof fareGraph === 'object' ? fareGraph : null;
    const start = normalizeText(fromFareStationId);
    const goal = normalizeText(toFareStationId);
    if (!graph || !start || !goal || !graph[start]) return null;
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
        const amount = readFareAmount(edge, fareType);
        if (amount != null) {
            totalAmount += amount;
            segments.push({ ...base, amount, matched: true, reversed, matchType: 'direct-edge' });
            continue;
        }

        const pathResult = findFareGraphPath({
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

    return {
        currency: 'JPY',
        fareType: normalizeText(fareType) || 'ic_card_fare',
        totalAmount: confidence === 'no-chain' || confidence === 'missing-data' ? null : totalAmount,
        confidence,
        segments,
        missingSegments
    };
};
