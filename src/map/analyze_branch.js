import { getCachedJson } from '../lib/fetch.js';
import { buildVirtualTripPreviewPayload } from '../lib/trip-preview.js';
import {
    buildAlternateTripSourceIndex,
    getAlternateTripSources,
    getLineIdFromStationId
} from '../domain/alternateLineMembership.js';
import {
    detectThroughServiceCategoryFromTrips,
    THROUGH_SERVICE_CONFIGS_OBJECT
} from '../lib/throughServiceManager.js';

const toText = (v) => String(v ?? '').trim();

const branchAnalysisCacheByLine = new Map();
let allTimetableRecordsPromise = null;

const toFileStem = (lineId) => {
    const raw = toText(lineId);
    if (!raw) return '';

    const normalized = raw
        .replace(/^JR[.-]East\b/i, 'JREast')
        .replace(/^JR[.-]Central\b/i, 'JRCentral')
        .replace(/^JR-East\b/i, 'JREast')
        .replace(/^JR-Central\b/i, 'JRCentral')
        .replace(/^Seibu.S-Yurakucho\b/i, 'Seibu.SYurakucho')
        .replace(/^Seibu.S-Fukutoshin\b/i, 'Seibu.SFukutoshin');

    return normalized.replace(/\./g, '-').toLowerCase();
};

const runWithConcurrency = async (tasks, concurrency = 8) => {
    const list = Array.isArray(tasks) ? tasks : [];
    const limit = Math.max(1, Number(concurrency) || 8);
    let idx = 0;

    const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
        while (idx < list.length) {
            const current = idx;
            idx += 1;
            await list[current]();
        }
    });

    await Promise.all(workers);
};

const dedupKeepOrder = (seq) => {
    const out = [];
    for (const x of Array.isArray(seq) ? seq : []) {
        if (!x) continue;
        if (!out.length || out[out.length - 1] !== x) out.push(x);
    }
    return out;
};

const canonicalKey = (seq) => {
    const fwd = Array.isArray(seq) ? seq.slice() : [];
    const rev = fwd.slice().reverse();
    const a = JSON.stringify(fwd);
    const b = JSON.stringify(rev);
    return a <= b ? a : b;
};

const canonicalEndpointKey = (seq) => {
    const list = Array.isArray(seq) ? seq : [];
    if (list.length < 2) return '';
    const a = toText(list[0]);
    const b = toText(list[list.length - 1]);
    return a <= b ? `${a}||${b}` : `${b}||${a}`;
};

const isSubsequence = (shortSeq, longSeq) => {
    const a = Array.isArray(shortSeq) ? shortSeq : [];
    const b = Array.isArray(longSeq) ? longSeq : [];
    if (a.length > b.length) return false;

    let i = 0;
    for (const x of b) {
        if (i < a.length && x === a[i]) i += 1;
        if (i === a.length) return true;
    }
    return i === a.length;
};

const isSubsequenceAnyDirection = (seqA, seqB) => {
    const a1 = Array.isArray(seqA) ? seqA : [];
    const a2 = a1.slice().reverse();
    const b1 = Array.isArray(seqB) ? seqB : [];
    const b2 = b1.slice().reverse();
    return isSubsequence(a1, b1) || isSubsequence(a1, b2) || isSubsequence(a2, b1) || isSubsequence(a2, b2);
};

const mergeStationSequences = (sequences) => {
    let merged = [];
    for (const seqRaw of Array.isArray(sequences) ? sequences : []) {
        const seq = dedupKeepOrder(seqRaw);
        if (!seq.length) continue;

        if (!merged.length) {
            merged = seq.slice();
            continue;
        }

        const maxOverlap = Math.min(merged.length, seq.length);
        let overlap = 0;
        for (let k = maxOverlap; k > 0; k -= 1) {
            const left = merged.slice(merged.length - k);
            const right = seq.slice(0, k);
            if (left.length !== right.length) continue;
            if (left.every((x, i) => x === right[i])) {
                overlap = k;
                break;
            }
        }

        if (overlap > 0) merged.push(...seq.slice(overlap));
        else if (merged[merged.length - 1] === seq[0]) merged.push(...seq.slice(1));
        else merged.push(...seq);

        merged = dedupKeepOrder(merged);
    }
    return merged;
};

const getTripLineId = (trip) => {
    const rid = toText(trip?.r);
    if (rid) return rid;
    const id = toText(trip?.id) || toText(trip?.t);
    if (!id) return '';
    const parts = id.split('.').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

const getTripId = (trip) => toText(trip?.id) || toText(trip?.t);

const getRouteStationIds = (route) => {
    const source = Array.isArray(route)
        ? route
        : (Array.isArray(route?.stationIds) ? route.stationIds : []);
    return source.map((x) => toText(x)).filter(Boolean);
};

const getRouteSegments = (route) => {
    return Array.isArray(route?.segments) ? route.segments : [];
};

const resolveLinkedIds = (idMap, ids) => {
    const map = idMap instanceof Map ? idMap : new Map();
    const list = Array.isArray(ids) ? ids : [];
    return list.map((x) => toText(x)).filter((x) => x && map.has(x));
};

const buildBackwardPathsToStart = (startId, idMap, maxPathCount = 2000) => {
    const walk = (curId, visited) => {
        const cur = idMap.get(curId);
        const prevIds = resolveLinkedIds(idMap, cur?.pt).filter((x) => !visited.has(x));
        if (!prevIds.length) return [[curId]];

        const paths = [];
        const sorted = prevIds.slice().sort();
        for (const pid of sorted) {
            const nextVisited = new Set(visited);
            nextVisited.add(pid);
            for (const p of walk(pid, nextVisited)) {
                paths.push([...p, curId]);
                if (paths.length >= maxPathCount) return paths;
            }
        }
        return paths;
    };

    return walk(startId, new Set([startId]));
};

const buildForwardPathsFromStart = (startId, idMap, maxPathCount = 2000) => {
    const walk = (curId, visited) => {
        const cur = idMap.get(curId);
        const nextIds = resolveLinkedIds(idMap, cur?.nt).filter((x) => !visited.has(x));
        if (!nextIds.length) return [[curId]];

        const paths = [];
        const sorted = nextIds.slice().sort();
        for (const nid of sorted) {
            const nextVisited = new Set(visited);
            nextVisited.add(nid);
            for (const p of walk(nid, nextVisited)) {
                paths.push([curId, ...p]);
                if (paths.length >= maxPathCount) return paths;
            }
        }
        return paths;
    };

    return walk(startId, new Set([startId]));
};

const buildThroughServiceIdPaths = (startId, idMap) => {
    const backward = buildBackwardPathsToStart(startId, idMap);
    const forward = buildForwardPathsFromStart(startId, idMap);
    const out = [];
    const seen = new Set();

    for (const bp of backward) {
        for (const fp of forward) {
            if (bp[bp.length - 1] !== startId || fp[0] !== startId) continue;
            const merged = [...bp.slice(0, -1), ...fp];
            const key = JSON.stringify(merged);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(merged);
        }
    }

    return out;
};

const buildThroughServiceRouteCandidatesForRecord = (rec, idMap) => {
    const rid = getTripId(rec);
    if (!rid || !idMap.has(rid)) return [];
    const idPaths = buildThroughServiceIdPaths(rid, idMap);
    const out = [];

    for (const idPath of idPaths) {
        const stationSequences = [];
        const segments = [];
        for (const oid of idPath) {
            const refRec = idMap.get(oid);
            const tt = Array.isArray(refRec?.tt) ? refRec.tt : [];
            const seq = tt.map((row) => toText(row?.s)).filter(Boolean);
            if (seq.length) stationSequences.push(seq);
            const lineIdForTrip = getTripLineId(refRec);
            if (lineIdForTrip && seq.length >= 2) {
                segments.push({
                    kind: 'main',
                    lineId: lineIdForTrip,
                    r: lineIdForTrip,
                    d: toText(refRec?.d),
                    tripId: getTripId(refRec),
                    stationIds: dedupKeepOrder(seq)
                });
            }
        }

        const merged = mergeStationSequences(stationSequences);
        if (merged.length < 2) continue;
        out.push({
            stationIds: merged,
            segments,
            __canonicalKey: canonicalKey(merged)
        });
    }

    return out;
};

const buildThroughServiceTtLists = (targetTimetables, idMap, {
    routeCandidatesByTripId = null
} = {}) => {
    const out = [];
    const seenRoutes = new Set();
    const candidateCache = routeCandidatesByTripId instanceof Map ? routeCandidatesByTripId : null;

    for (const rec of Array.isArray(targetTimetables) ? targetTimetables : []) {
        const rid = getTripId(rec);
        if (!rid || !idMap.has(rid)) continue;

        let routeCandidates = candidateCache?.get(rid);
        if (!routeCandidates) {
            routeCandidates = buildThroughServiceRouteCandidatesForRecord(rec, idMap);
            candidateCache?.set(rid, routeCandidates);
        }
        for (const candidate of routeCandidates) {
            const key = toText(candidate?.__canonicalKey) || canonicalKey(getRouteStationIds(candidate));
            if (seenRoutes.has(key)) continue;
            seenRoutes.add(key);
            out.push(candidate);
        }
    }

    return out;
};

const selectFullRoutes = (ttLists) => {
    const unique = [];
    const seen = new Set();
    for (const route of Array.isArray(ttLists) ? ttLists : []) {
        const seq = getRouteStationIds(route);
        const key = canonicalKey(seq);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(Array.isArray(route) ? seq : { ...route, stationIds: seq });
    }

    const fullRoutes = [];
    for (let i = 0; i < unique.length; i += 1) {
        const route = unique[i];
        const seq = getRouteStationIds(route);
        let absorbed = false;
        for (let j = 0; j < unique.length; j += 1) {
            if (i === j) continue;
            const other = getRouteStationIds(unique[j]);
            if (other.length <= seq.length) continue;
            if (isSubsequenceAnyDirection(seq, other)) {
                absorbed = true;
                break;
            }
        }
        if (!absorbed) fullRoutes.push(route);
    }

    const byEndpoint = new Map();
    for (const route of fullRoutes) {
        const seq = getRouteStationIds(route);
        if (!Array.isArray(seq) || seq.length < 2) continue;
        const key = canonicalEndpointKey(seq);
        const best = byEndpoint.get(key);
        const bestSeq = getRouteStationIds(best);
        if (!best || seq.length > bestSeq.length) {
            byEndpoint.set(key, route);
            continue;
        }
        if (seq.length === bestSeq.length) {
            const a = canonicalKey(seq);
            const b = canonicalKey(bestSeq);
            if (a < b) byEndpoint.set(key, route);
        }
    }

    return Array.from(byEndpoint.values());
};

const getThroughServiceStationSet = (category) => {
    const info = THROUGH_SERVICE_CONFIGS_OBJECT[toText(category)] || null;
    if (!info) return null;
    if (info.stationIdSet instanceof Set && info.stationIdSet.size) return info.stationIdSet;

    const stations = Array.isArray(info.stations) ? info.stations.map((x) => toText(x)).filter(Boolean) : [];
    return stations.length ? new Set(stations) : null;
};

const splitAllowedStationRuns = (stationIds, allowedStationSet) => {
    const out = [];
    let current = [];

    for (const stationId of Array.isArray(stationIds) ? stationIds : []) {
        const sid = toText(stationId);
        if (sid && allowedStationSet?.has?.(sid)) {
            current.push(sid);
            continue;
        }

        if (current.length >= 2) out.push(dedupKeepOrder(current));
        current = [];
    }

    if (current.length >= 2) out.push(dedupKeepOrder(current));
    return out.filter((run) => run.length >= 2);
};

const clipSegmentsToAllowedStations = (segments, allowedStationSet) => {
    const out = [];
    for (const segment of Array.isArray(segments) ? segments : []) {
        const runs = splitAllowedStationRuns(getRouteStationIds(segment), allowedStationSet);
        for (const run of runs) {
            out.push({
                ...(segment || {}),
                stationIds: run
            });
        }
    }
    return out;
};

const clipRouteToAllowedStations = (route, allowedStationSet) => {
    if (!(allowedStationSet instanceof Set) || !allowedStationSet.size) return [route].filter(Boolean);

    const routeRuns = splitAllowedStationRuns(getRouteStationIds(route), allowedStationSet);
    if (!routeRuns.length) return [];

    const clippedSegments = clipSegmentsToAllowedStations(getRouteSegments(route), allowedStationSet);
    return routeRuns.map((stationIds) => ({
        ...(Array.isArray(route) ? {} : route),
        stationIds,
        segments: clippedSegments.filter((segment) => {
            const ids = getRouteStationIds(segment);
            return ids.length >= 2 && ids.every((stationId) => stationIds.includes(stationId));
        })
    }));
};

const clipRoutesToThroughServiceSegments = (routes, throughServiceCategory) => {
    const allowedStationSet = getThroughServiceStationSet(throughServiceCategory);
    if (!(allowedStationSet instanceof Set) || !allowedStationSet.size) return routes;

    const out = [];
    const seen = new Set();
    for (const route of Array.isArray(routes) ? routes : []) {
        for (const clipped of clipRouteToAllowedStations(route, allowedStationSet)) {
            const ids = getRouteStationIds(clipped);
            if (ids.length < 2) continue;
            const key = canonicalKey(ids);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(clipped);
        }
    }
    return out;
};

const collectRouteEndpoints = (routes) => {
    const originStationIds = [];
    const terminalStationIds = [];
    const seenPair = new Set();

    for (const route of Array.isArray(routes) ? routes : []) {
        const seq = getRouteStationIds(route);
        if (seq.length < 2) continue;
        const originId = seq[0];
        const terminalId = seq[seq.length - 1];
        const pairKey = `${originId}||${terminalId}`;
        if (seenPair.has(pairKey)) continue;
        seenPair.add(pairKey);
        originStationIds.push(originId);
        terminalStationIds.push(terminalId);
    }

    return {
        originStationIds,
        terminalStationIds
    };
};

const buildGraph = (routes) => {
    const detailedPairs = new Set();
    for (const route of Array.isArray(routes) ? routes : []) {
        const list = getRouteStationIds(route);
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 2; j < list.length; j += 1) {
                const a = toText(list[i]);
                const b = toText(list[j]);
                if (!a || !b || a === b) continue;
                detailedPairs.add(a <= b ? `${a}||${b}` : `${b}||${a}`);
            }
        }
    }

    const graph = new Map();
    const addEdge = (a, b) => {
        if (!graph.has(a)) graph.set(a, new Set());
        graph.get(a).add(b);
    };

    for (const route of Array.isArray(routes) ? routes : []) {
        const list = getRouteStationIds(route);
        for (let i = 0; i < list.length - 1; i += 1) {
            const a = toText(list[i]);
            const b = toText(list[i + 1]);
            if (!a || !b || a === b) continue;
            const pairKey = a <= b ? `${a}||${b}` : `${b}||${a}`;
            if (detailedPairs.has(pairKey)) continue;
            addEdge(a, b);
            addEdge(b, a);
        }
    }

    return graph;
};

const edgeKey = (a, b) => (a <= b ? `${a}||${b}` : `${b}||${a}`);

const walkBranch = (graph, start, neighbor, visitedEdges, splitNodes) => {
    const path = [start, neighbor];
    visitedEdges.add(edgeKey(start, neighbor));

    let prev = start;
    let cur = neighbor;

    while (!splitNodes.has(cur)) {
        const neighbors = Array.from(graph.get(cur) || []).filter((n) => n !== prev);
        if (!neighbors.length) break;

        const nxt = neighbors[0];
        const e = edgeKey(cur, nxt);
        if (visitedEdges.has(e)) break;

        path.push(nxt);
        visitedEdges.add(e);
        prev = cur;
        cur = nxt;
    }

    return path;
};

const orientSegmentForOutput = (segment, routes) => {
    const seg = Array.isArray(segment) ? segment : [];
    if (seg.length < 2) return seg;
    const rev = seg.slice().reverse();

    let forwardScore = 0;
    let reverseScore = 0;

    for (const route of Array.isArray(routes) ? routes : []) {
        const list = getRouteStationIds(route);
        if (list.length < seg.length) continue;
        for (let i = 0; i <= list.length - seg.length; i += 1) {
            const chunk = list.slice(i, i + seg.length);
            if (chunk.every((x, idx) => x === seg[idx])) forwardScore += 1;
            if (chunk.every((x, idx) => x === rev[idx])) reverseScore += 1;
        }
    }

    if (reverseScore > forwardScore) return rev;
    if (forwardScore > reverseScore) return seg;

    const fwdKey = JSON.stringify(seg);
    const revKey = JSON.stringify(rev);
    return revKey < fwdKey ? rev : seg;
};

const extractBranchLists = (graph, routes) => {
    if (!(graph instanceof Map) || !graph.size) return [];

    const visitedEdges = new Set();
    const rawBranches = [];
    const degree = new Map();
    for (const [node, neighbors] of graph.entries()) {
        degree.set(node, (neighbors instanceof Set) ? neighbors.size : 0);
    }
    const splitOrEndNodes = new Set(Array.from(degree.entries()).filter(([, deg]) => deg !== 2).map(([node]) => node));

    const sortedNodes = Array.from(splitOrEndNodes).sort();
    for (const node of sortedNodes) {
        const neighbors = Array.from(graph.get(node) || []);
        for (const neighbor of neighbors) {
            const e = edgeKey(node, neighbor);
            if (visitedEdges.has(e)) continue;
            const branch = walkBranch(graph, node, neighbor, visitedEdges, splitOrEndNodes);
            rawBranches.push(branch);
        }
    }

    for (const [node, neighborsSet] of graph.entries()) {
        const neighbors = Array.from(neighborsSet || []);
        for (const neighbor of neighbors) {
            const e = edgeKey(node, neighbor);
            if (visitedEdges.has(e)) continue;
            const branch = walkBranch(graph, node, neighbor, visitedEdges, splitOrEndNodes);
            rawBranches.push(branch);
        }
    }

    const dedup = new Map();
    for (const segRaw of rawBranches) {
        const seg = Array.isArray(segRaw) ? segRaw.filter(Boolean) : [];
        if (seg.length < 2) continue;
        const key = canonicalKey(seg);
        if (dedup.has(key)) continue;
        dedup.set(key, orientSegmentForOutput(seg, routes));
    }

    return Array.from(dedup.values());
};

const getRecordStationIds = (rec) => {
    const tt = Array.isArray(rec?.tt) ? rec.tt : [];
    return tt.map((row) => toText(row?.s)).filter(Boolean);
};

const collectAdjacentPairKeys = (stationIds) => {
    const list = Array.isArray(stationIds) ? stationIds : [];
    const out = new Set();
    for (let i = 0; i < list.length - 1; i += 1) {
        const a = toText(list[i]);
        const b = toText(list[i + 1]);
        if (!a || !b || a === b) continue;
        out.add(edgeKey(a, b));
    }
    return out;
};

const addCurrentLineCoverageRecords = ({
    targetTimetables,
    baseFilteredRecords,
    activeLineIds,
    lineStationIdsById,
    shouldContinue
} = {}) => {
    if (!Array.isArray(targetTimetables) || !Array.isArray(baseFilteredRecords)) return;
    if (!(lineStationIdsById instanceof Map)) return;
    const isActive = typeof shouldContinue === 'function' ? shouldContinue : (() => true);

    const selectedTripIds = new Set(targetTimetables.map((rec) => getTripId(rec)).filter(Boolean));
    const coveredPairKeys = new Set();
    for (const rec of targetTimetables) {
        if (!isActive()) return false;
        for (const key of collectAdjacentPairKeys(getRecordStationIds(rec))) coveredPairKeys.add(key);
    }

    const requiredPairKeys = [];
    const seenRequired = new Set();
    for (const lineId of Array.isArray(activeLineIds) ? activeLineIds : []) {
        if (!isActive()) return false;
        const stationIds = lineStationIdsById.get(toText(lineId)) || [];
        for (const key of collectAdjacentPairKeys(stationIds)) {
            if (seenRequired.has(key)) continue;
            seenRequired.add(key);
            requiredPairKeys.push(key);
        }
    }

    for (const requiredPairKey of requiredPairKeys) {
        if (!isActive()) return false;
        if (coveredPairKeys.has(requiredPairKey)) continue;

        const coverageRecord = baseFilteredRecords.find((rec) => {
            if (!isActive()) return false;
            const tripId = getTripId(rec);
            if (tripId && selectedTripIds.has(tripId)) return false;
            return collectAdjacentPairKeys(getRecordStationIds(rec)).has(requiredPairKey);
        });
        if (!coverageRecord) continue;

        targetTimetables.push(coverageRecord);
        const tripId = getTripId(coverageRecord);
        if (tripId) selectedTripIds.add(tripId);
        for (const key of collectAdjacentPairKeys(getRecordStationIds(coverageRecord))) {
            coveredPairKeys.add(key);
        }
    }
    return true;
};

const loadAllTimetableRecords = async () => {
    if (allTimetableRecordsPromise) return allTimetableRecordsPromise;

    allTimetableRecordsPromise = (async () => {
        const railways = await getCachedJson('./data/railways.json');
        const lineStationIdsById = new Map();
        for (const railway of Array.isArray(railways) ? railways : []) {
            const id = toText(railway?.id);
            if (!id) continue;
            lineStationIdsById.set(id, Array.isArray(railway?.stations)
                ? railway.stations.map((x) => toText(x)).filter(Boolean)
                : []);
        }
        const railwayIds = Array.from(lineStationIdsById.keys());

        const lineDataById = new Map();
        const tasks = railwayIds.map((lineId) => async () => {
            const stem = toFileStem(lineId);
            if (!stem) {
                lineDataById.set(lineId, []);
                return;
            }
            const url = `./data/train-timetables/${encodeURIComponent(stem)}.json`;
            const data = await getCachedJson(url);
            lineDataById.set(lineId, Array.isArray(data) ? data : []);
        });
        await runWithConcurrency(tasks, 8);

        const allRecords = [];
        const recordsByLineId = new Map();
        const idMap = new Map();
        for (const list of lineDataById.values()) {
            for (const rec of Array.isArray(list) ? list : []) {
                const id = getTripId(rec);
                if (!id) continue;
                allRecords.push(rec);
                if (!idMap.has(id)) idMap.set(id, rec);
                const recLineId = getTripLineId(rec);
                if (recLineId) {
                    if (!recordsByLineId.has(recLineId)) recordsByLineId.set(recLineId, []);
                    recordsByLineId.get(recLineId).push(rec);
                }
            }
        }

        return {
            allRecords,
            idMap,
            lineStationIdsById,
            recordsByLineId
        };
    })();

    return allTimetableRecordsPromise;
};

const alternateTripSourceIndexByMembership = new WeakMap();

const resolveAlternateTripSourceIndex = (alternateLineMembership) => {
    if (!alternateLineMembership || typeof alternateLineMembership !== 'object') return null;
    if (alternateTripSourceIndexByMembership.has(alternateLineMembership)) {
        return alternateTripSourceIndexByMembership.get(alternateLineMembership) || null;
    }

    const built = buildAlternateTripSourceIndex(alternateLineMembership);
    alternateTripSourceIndexByMembership.set(alternateLineMembership, built);
    return built || null;
};

const normalizeLineIdList = (value) => {
    const list = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const item of list) {
        const id = toText(item);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
};

const expandLineIdsByAlternateStations = ({
    sourceLineIds = [],
    anchorStationIds = [],
    alternateLineMembership = null
} = {}) => {
    const lineIds = normalizeLineIdList(sourceLineIds);
    if (!lineIds.length) return lineIds;
    if (!alternateLineMembership || typeof alternateLineMembership !== 'object') return lineIds;

    const index = resolveAlternateTripSourceIndex(alternateLineMembership);
    if (!(index instanceof Map) || !index.size) return lineIds;

    const stations = normalizeLineIdList(anchorStationIds);
    if (!stations.length) return lineIds;

    const expanded = new Set(lineIds);
    for (const lineId of lineIds) {
        for (const stationId of stations) {
            const sources = getAlternateTripSources(index, stationId, lineId);
            for (const source of Array.isArray(sources) ? sources : []) {
                const sourceLineId = toText(source?.sourceLineId);
                if (sourceLineId) expanded.add(sourceLineId);
            }
        }
    }

    return Array.from(expanded);
};

const toTripFilterSet = (targetTripKeys) => {
    const list = Array.isArray(targetTripKeys) ? targetTripKeys : [];
    const set = new Set();
    for (const item of list) {
        const k = toText(item);
        if (!k) continue;
        set.add(k);
        const base = k.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
        if (base) set.add(base);
    }
    return set;
};

const tripFilterMatchKeysByRecord = new WeakMap();

const getTripFilterMatchKeys = (rec) => {
    if (!rec || typeof rec !== 'object') return [];
    if (tripFilterMatchKeysByRecord.has(rec)) {
        return tripFilterMatchKeysByRecord.get(rec) || [];
    }
    const keys = [];
    const seen = new Set();
    const add = (value) => {
        const key = toText(value);
        if (!key || seen.has(key)) return;
        seen.add(key);
        keys.push(key);
    };
    const addWithBase = (value) => {
        const key = toText(value);
        if (!key) return;
        add(key);
        add(key.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, ''));
    };
    addWithBase(rec?.id);
    addWithBase(rec?.t);
    tripFilterMatchKeysByRecord.set(rec, keys);
    return keys;
};

const matchesTripFilter = (rec, tripFilterSet) => {
    if (!(tripFilterSet instanceof Set) || !tripFilterSet.size) return true;
    for (const key of getTripFilterMatchKeys(rec)) {
        if (tripFilterSet.has(key)) return true;
    }
    return false;
};


const addRefId = (outSet, raw) => {
    const id = toText(raw);
    if (id) outSet.add(id);
};

const collectRefTripIds = (trip) => {
    const out = new Set();
    const pt = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
    const nt = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
    for (const id of pt) addRefId(out, id);
    for (const id of nt) addRefId(out, id);
    return Array.from(out);
};

const collectConnectedTrips = (seedTrip, idMap) => {
    const map = idMap instanceof Map ? idMap : new Map();
    const queue = [seedTrip];
    const visited = new Set();
    const out = [];

    while (queue.length) {
        const cur = queue.shift();
        if (!cur) continue;
        const id = toText(cur?.id) || toText(cur?.t);
        if (id && visited.has(id)) continue;
        if (id) visited.add(id);
        out.push(cur);

        const refIds = collectRefTripIds(cur);
        for (const refId of refIds) {
            const ref = map.get(refId);
            if (!ref) continue;
            const refTripId = toText(ref?.id) || toText(ref?.t);
            if (refTripId && visited.has(refTripId)) continue;
            queue.push(ref);
        }
    }

    return out;
};

const matchesThroughServiceCategory = (trip, idMap, expectedCategory, cache) => {
    const wanted = toText(expectedCategory);
    if (!wanted) return true;

    const tripId = toText(trip?.id) || toText(trip?.t);
    if (cache instanceof Map && tripId && cache.has(tripId)) {
        return cache.get(tripId) === wanted;
    }

    const connectedTrips = collectConnectedTrips(trip, idMap);
    const category = detectThroughServiceCategoryFromTrips(connectedTrips);
    if (cache instanceof Map) {
        for (const connectedTrip of connectedTrips) {
            const connectedTripId = getTripId(connectedTrip);
            if (connectedTripId) cache.set(connectedTripId, category);
        }
        if (tripId) cache.set(tripId, category);
    }
    return category === wanted;
};

const createBranchAnalysisPlan = (lineId, options = {}) => {
    const sourceLineIds = expandLineIdsByAlternateStations({
        sourceLineIds: Array.isArray(options?.sourceLineIds)
            ? options.sourceLineIds.map((x) => toText(x)).filter(Boolean)
            : [],
        anchorStationIds: options?.anchorStationIds,
        alternateLineMembership: options?.alternateLineMembership || null
    });

    const lid = toText(lineId) || sourceLineIds[0] || '';
    if (!lid) return null;

    const activeLineIds = sourceLineIds.length
        ? Array.from(new Set(sourceLineIds))
        : [lid];
    const activeLineSet = new Set(activeLineIds);
    const throughServiceCategory = toText(options?.throughServiceCategory);

    const tripFilterSet = toTripFilterSet(options?.targetTripKeys);
    const tripFilterKey = (() => {
        if (!tripFilterSet.size) return '*';
        return Array.from(tripFilterSet).sort().join('||');
    })();
    const lineIdsKey = activeLineIds.slice().sort().join('|');
    const categoryKey = throughServiceCategory || '*';
    const filterSpecial = options?.filterSpecial === true;
    const cacheKey = `${lineIdsKey}##${tripFilterKey}##${categoryKey}##${filterSpecial ? 'base' : 'all'}##${options?.alternateLineMembership ? 'alt' : 'no-alt'}`;
    return {
        lid,
        activeLineIds,
        activeLineSet,
        throughServiceCategory,
        tripFilterSet,
        filterSpecial,
        cacheKey,
        baseFilteredRecords: [],
        dsFrequencyMap: new Map(),
        osFrequencyMap: new Map(),
        throughCategoryCache: new Map()
    };
};

const createStaleBranchAnalysisResult = (plan) => ({
    ok: false,
    reason: 'stale',
    lineId: plan?.lid || '',
    sourceLineIds: Array.isArray(plan?.activeLineIds) ? plan.activeLineIds : [],
    throughServiceCategory: toText(plan?.throughServiceCategory),
    originStationIds: [],
    terminalStationIds: [],
    lineStationIdsById: new Map(),
    targetCount: 0,
    throughServiceCount: 0,
    fullRouteCount: 0,
    fullRouteChains: [],
    branchList: []
});

const createEmptyBranchAnalysisResult = (plan, lineStationIdsById) => ({
    lineId: plan.lid,
    sourceLineIds: plan.activeLineIds,
    throughServiceCategory: plan.throughServiceCategory,
    originStationIds: [],
    terminalStationIds: [],
    lineStationIdsById,
    targetCount: 0,
    throughServiceCount: 0,
    fullRouteCount: 0,
    fullRouteChains: [],
    branchList: []
});

const getCandidateRecordsForLineIds = ({
    allRecords,
    recordsByLineId,
    lineIds,
    lineSet
} = {}) => {
    const ids = Array.isArray(lineIds) ? lineIds : [];
    if (recordsByLineId instanceof Map) {
        return ids.flatMap((id) => recordsByLineId.get(id) || []);
    }
    const activeSet = lineSet instanceof Set ? lineSet : new Set(ids);
    return (Array.isArray(allRecords) ? allRecords : []).filter((rec) => activeSet.has(getTripLineId(rec)));
};

const appendRecordToBranchAnalysisPlan = (plan, rec, idMap, throughCategoryCache = null, {
    skipTripFilter = false
} = {}) => {
    if (!plan || !rec) return false;
    if (plan.filterSpecial && rec.nm) return false;
    if (!skipTripFilter && !matchesTripFilter(rec, plan.tripFilterSet)) return false;
    if (!matchesThroughServiceCategory(
        rec,
        idMap,
        plan.throughServiceCategory,
        throughCategoryCache instanceof Map ? throughCategoryCache : plan.throughCategoryCache
    )) return false;

    plan.baseFilteredRecords.push(rec);

    const dsKey = rec.ds && Array.isArray(rec.ds) ? rec.ds.join(',') : '';
    plan.dsFrequencyMap.set(dsKey, (plan.dsFrequencyMap.get(dsKey) || 0) + 1);

    const osKey = rec.os && Array.isArray(rec.os) ? rec.os.join(',') : '';
    plan.osFrequencyMap.set(osKey, (plan.osFrequencyMap.get(osKey) || 0) + 1);
    return true;
};

const addPlanToTripFilterIndex = (index, lineId, key, plan) => {
    const lid = toText(lineId);
    const filterKey = toText(key) || '*';
    if (!lid || !plan) return;
    if (!index.has(lid)) index.set(lid, new Map());
    const byKey = index.get(lid);
    if (!byKey.has(filterKey)) byKey.set(filterKey, new Set());
    byKey.get(filterKey).add(plan);
};

const buildPlanTripFilterIndexByLineId = (plans) => {
    const index = new Map();
    for (const plan of Array.isArray(plans) ? plans : []) {
        const keys = plan?.tripFilterSet instanceof Set && plan.tripFilterSet.size
            ? Array.from(plan.tripFilterSet)
            : ['*'];
        for (const lineId of Array.isArray(plan?.activeLineIds) ? plan.activeLineIds : []) {
            for (const key of keys) addPlanToTripFilterIndex(index, lineId, key, plan);
        }
    }
    return index;
};

const finalizeBranchAnalysisPlan = ({
    plan,
    idMap,
    lineStationIdsById,
    isActive = () => true,
    throughServiceRouteCandidatesByTripId = null,
    analysisBodyCache = null
} = {}) => {
    if (!isActive()) return createStaleBranchAnalysisResult(plan);
    const targetTimetables = [];
    const baseFilteredRecords = Array.isArray(plan?.baseFilteredRecords) ? plan.baseFilteredRecords : [];

    const includeAllBaseRecords = plan.filterSpecial !== true;
    if (!includeAllBaseRecords) {
        for (let i = 0; i < baseFilteredRecords.length; i += 1) {
            if (i % 128 === 0 && !isActive()) return createStaleBranchAnalysisResult(plan);
            const rec = baseFilteredRecords[i];
            const dsKey = rec.ds && Array.isArray(rec.ds) ? rec.ds.join(',') : '';
            const osKey = rec.os && Array.isArray(rec.os) ? rec.os.join(',') : '';

            const dsCount = plan.dsFrequencyMap.get(dsKey) || 0;
            const osCount = plan.osFrequencyMap.get(osKey) || 0;

            if (dsCount >= 10 && osCount >= 10) {
                targetTimetables.push(rec);
            }
        }
        addCurrentLineCoverageRecords({
            targetTimetables,
            baseFilteredRecords,
            activeLineIds: plan.activeLineIds,
            lineStationIdsById,
            shouldContinue: isActive
        });
        if (!isActive()) return createStaleBranchAnalysisResult(plan);
    } else {
        targetTimetables.push(...baseFilteredRecords);
    }

    if (!targetTimetables.length) {
        return createEmptyBranchAnalysisResult(plan, lineStationIdsById);
    }
    const analysisBodyKey = (() => {
        if (!(analysisBodyCache instanceof Map)) return '';
        const ids = targetTimetables.map((rec) => getTripId(rec)).filter(Boolean).sort();
        return `${toText(plan?.throughServiceCategory) || '*'}##${ids.join('|')}`;
    })();
    if (analysisBodyKey && analysisBodyCache.has(analysisBodyKey)) {
        const cached = analysisBodyCache.get(analysisBodyKey);
        return {
            lineId: plan.lid,
            sourceLineIds: plan.activeLineIds,
            throughServiceCategory: plan.throughServiceCategory,
            originStationIds: cached.originStationIds,
            terminalStationIds: cached.terminalStationIds,
            lineStationIdsById,
            targetCount: cached.targetCount,
            throughServiceCount: cached.throughServiceCount,
            fullRouteCount: cached.fullRouteCount,
            fullRouteChains: cached.fullRouteChains,
            branchList: cached.branchList
        };
    }

    if (!isActive()) return createStaleBranchAnalysisResult(plan);
    const ttLists = buildThroughServiceTtLists(targetTimetables, idMap, {
        routeCandidatesByTripId: throughServiceRouteCandidatesByTripId
    });
    if (!isActive()) return createStaleBranchAnalysisResult(plan);
    const fullRoutes = clipRoutesToThroughServiceSegments(
        selectFullRoutes(ttLists),
        plan.throughServiceCategory
    );
    if (!isActive()) return createStaleBranchAnalysisResult(plan);
    const graph = buildGraph(fullRoutes);
    const branchList = extractBranchLists(graph, fullRoutes).map((seq) => dedupKeepOrder(seq));
    const endpoints = collectRouteEndpoints(fullRoutes);
    if (!isActive()) return createStaleBranchAnalysisResult(plan);

    const resultBody = {
        originStationIds: endpoints.originStationIds,
        terminalStationIds: endpoints.terminalStationIds,
        targetCount: targetTimetables.length,
        throughServiceCount: ttLists.length,
        fullRouteCount: fullRoutes.length,
        fullRouteChains: fullRoutes,
        branchList: branchList.filter((x) => Array.isArray(x) && x.length >= 2)
    };
    if (analysisBodyKey && analysisBodyCache instanceof Map) {
        analysisBodyCache.set(analysisBodyKey, resultBody);
    }

    return {
        lineId: plan.lid,
        sourceLineIds: plan.activeLineIds,
        throughServiceCategory: plan.throughServiceCategory,
        originStationIds: resultBody.originStationIds,
        terminalStationIds: resultBody.terminalStationIds,
        lineStationIdsById,
        targetCount: resultBody.targetCount,
        throughServiceCount: resultBody.throughServiceCount,
        fullRouteCount: resultBody.fullRouteCount,
        fullRouteChains: resultBody.fullRouteChains,
        branchList: resultBody.branchList
    };
};

const runBranchAnalysisPlan = async ({
    plan,
    isActive = () => true
} = {}) => {
    if (!isActive()) return createStaleBranchAnalysisResult(plan);
    const { allRecords, idMap, lineStationIdsById, recordsByLineId } = await loadAllTimetableRecords();
    if (!isActive()) return createStaleBranchAnalysisResult(plan);

    const candidateRecords = getCandidateRecordsForLineIds({
        allRecords,
        recordsByLineId,
        lineIds: plan.activeLineIds,
        lineSet: plan.activeLineSet
    });

    for (let i = 0; i < candidateRecords.length; i += 1) {
        if (i % 128 === 0 && !isActive()) return createStaleBranchAnalysisResult(plan);
        appendRecordToBranchAnalysisPlan(plan, candidateRecords[i], idMap);
    }
    if (!isActive()) return createStaleBranchAnalysisResult(plan);

    return finalizeBranchAnalysisPlan({
        plan,
        idMap,
        lineStationIdsById,
        isActive,
        throughServiceRouteCandidatesByTripId: new Map()
    });
};

const runBranchAnalysisPlansBatch = async ({
    plans,
    isActive = () => true
} = {}) => {
    const list = Array.isArray(plans) ? plans.filter(Boolean) : [];
    if (!list.length) return [];
    if (!isActive()) return list.map((plan) => createStaleBranchAnalysisResult(plan));
    const uniquePlans = [];
    const uniquePlanByCacheKey = new Map();
    for (const plan of list) {
        const key = toText(plan?.cacheKey) || `__plan_${uniquePlans.length}`;
        if (!uniquePlanByCacheKey.has(key)) {
            uniquePlanByCacheKey.set(key, plan);
            uniquePlans.push(plan);
        }
    }
    const resultForOriginalPlan = (result, plan) => {
        if (!result || result?.reason === 'stale') return result;
        return {
            ...result,
            lineId: plan?.lid || result.lineId,
            sourceLineIds: Array.isArray(plan?.activeLineIds) ? plan.activeLineIds : result.sourceLineIds,
            throughServiceCategory: toText(plan?.throughServiceCategory) || result.throughServiceCategory
        };
    };

    const { allRecords, idMap, lineStationIdsById, recordsByLineId } = await loadAllTimetableRecords();
    if (!isActive()) return list.map((plan) => createStaleBranchAnalysisResult(plan));

    const lineIds = [];
    const lineIdSet = new Set();
    const plansByLineId = new Map();
    for (const plan of uniquePlans) {
        for (const lineId of plan.activeLineIds) {
            if (!lineId) continue;
            if (!lineIdSet.has(lineId)) {
                lineIdSet.add(lineId);
                lineIds.push(lineId);
            }
            if (!plansByLineId.has(lineId)) plansByLineId.set(lineId, []);
            plansByLineId.get(lineId).push(plan);
        }
    }

    const candidateRecords = getCandidateRecordsForLineIds({
        allRecords,
        recordsByLineId,
        lineIds,
        lineSet: lineIdSet
    });

    const sharedThroughCategoryCache = new Map();
    const sharedThroughServiceRouteCandidatesByTripId = new Map();
    const planTripFilterIndexByLineId = buildPlanTripFilterIndexByLineId(uniquePlans);
    for (let i = 0; i < candidateRecords.length; i += 1) {
        if (i % 128 === 0 && !isActive()) return list.map((plan) => createStaleBranchAnalysisResult(plan));
        const rec = candidateRecords[i];
        const recLineId = getTripLineId(rec);
        const matchingPlans = plansByLineId.get(recLineId) || [];
        if (!matchingPlans.length) continue;
        const byFilterKey = planTripFilterIndexByLineId.get(recLineId);
        if (!(byFilterKey instanceof Map)) continue;
        const candidatePlans = new Set(byFilterKey.get('*') || []);
        for (const key of getTripFilterMatchKeys(rec)) {
            const keyedPlans = byFilterKey.get(key);
            if (!keyedPlans) continue;
            for (const plan of keyedPlans) candidatePlans.add(plan);
        }
        if (!candidatePlans.size) continue;
        for (const plan of matchingPlans) {
            if (!candidatePlans.has(plan)) continue;
            appendRecordToBranchAnalysisPlan(plan, rec, idMap, sharedThroughCategoryCache, {
                skipTripFilter: true
            });
        }
    }
    if (!isActive()) return list.map((plan) => createStaleBranchAnalysisResult(plan));

    const resultsByCacheKey = new Map();
    const sharedAnalysisBodyCache = new Map();
    for (const plan of uniquePlans) {
        const result = finalizeBranchAnalysisPlan({
            plan,
            idMap,
            lineStationIdsById,
            isActive,
            throughServiceRouteCandidatesByTripId: sharedThroughServiceRouteCandidatesByTripId,
            analysisBodyCache: sharedAnalysisBodyCache
        });
        resultsByCacheKey.set(toText(plan?.cacheKey) || '', result);
        if (result?.reason === 'stale') {
            return list.map((originalPlan) => createStaleBranchAnalysisResult(originalPlan));
        }
    }
    return list.map((plan) => resultForOriginalPlan(
        resultsByCacheKey.get(toText(plan?.cacheKey) || ''),
        plan
    ));
};

export const analyzeBranchesForLine = async (lineId, options = {}) => {
    const plan = createBranchAnalysisPlan(lineId, options);
    if (!plan) return null;
    const shouldContinue = typeof options?.isStillActive === 'function'
        ? () => options.isStillActive() !== false
        : null;
    const isActive = () => (shouldContinue ? shouldContinue() : true);

    const runAnalysis = () => runBranchAnalysisPlan({ plan, isActive });

    if (shouldContinue) return runAnalysis();

    if (!branchAnalysisCacheByLine.has(plan.cacheKey)) {
        const p = runAnalysis();

        branchAnalysisCacheByLine.set(plan.cacheKey, p.catch((error) => {
            branchAnalysisCacheByLine.delete(plan.cacheKey);
            throw error;
        }));
    }

    return branchAnalysisCacheByLine.get(plan.cacheKey);
};

export const prewarmThroughServiceBranchAnalysis = async ({
    throughServiceConfigsObject = THROUGH_SERVICE_CONFIGS_OBJECT
} = {}) => {
    const configs = Object.values(throughServiceConfigsObject || {});
    const tasks = [];

    for (const info of configs) {
        const lineId = toText(info?.lineId);
        const throughServiceCategory = toText(info?.category);
        const sourceLineIds = Array.isArray(info?.segmentLineIds)
            ? info.segmentLineIds.map((x) => toText(x)).filter(Boolean)
            : [];
        if (!lineId || !throughServiceCategory || !sourceLineIds.length) continue;

        for (const filterSpecial of [false, true]) {
            tasks.push(analyzeBranchesForLine(lineId, {
                throughServiceCategory,
                sourceLineIds,
                filterSpecial
            }));
        }
    }

    const results = await Promise.allSettled(tasks);
    return {
        requested: tasks.length,
        fulfilled: results.filter((result) => result.status === 'fulfilled').length,
        rejected: results.filter((result) => result.status === 'rejected').length
    };
};

export const buildBranchVirtualTrips = ({ lineId, lineName, branchList } = {}) => {
    const lid = toText(lineId);
    const lname = toText(lineName) || lid;
    const list = Array.isArray(branchList) ? branchList : [];
    const out = [];

    for (let i = 0; i < list.length; i += 1) {
        const stationIds = dedupKeepOrder(list[i]);
        if (stationIds.length < 2) continue;

        const payload = buildVirtualTripPreviewPayload({
            lineId: lid,
            lineName: lname,
            segments: [{
                lineId: lid,
                r: lid,
                geometryLineId: lid,
                offsetLineId: lid,
                stationIds
            }],
            stationIds,
            tripKey: `branch-${i + 1}`,
            previewSource: 'route-map-branch',
            fitMode: 'none'
        });
        if (payload) out.push(payload);
    }

    return out;
};

const findContiguousIndex = (source, part) => {
    const list = Array.isArray(source) ? source : [];
    const target = Array.isArray(part) ? part : [];
    if (!target.length || target.length > list.length) return -1;
    for (let i = 0; i <= list.length - target.length; i += 1) {
        let ok = true;
        for (let j = 0; j < target.length; j += 1) {
            if (toText(list[i + j]) !== toText(target[j])) {
                ok = false;
                break;
            }
        }
        if (ok) return i;
    }
    return -1;
};

const reverseRouteSegment = (segment) => ({
    ...(segment || {}),
    stationIds: getRouteStationIds(segment).slice().reverse()
});

const orientRouteChainForBranch = (route, stationIds) => {
    const ids = getRouteStationIds(route);
    const target = Array.isArray(stationIds) ? stationIds : [];
    if (ids.length < target.length || target.length < 2) return null;

    if (findContiguousIndex(ids, target) >= 0) {
        return {
            stationIds: ids,
            segments: getRouteSegments(route)
        };
    }

    const reversedIds = ids.slice().reverse();
    if (findContiguousIndex(reversedIds, target) >= 0) {
        return {
            stationIds: reversedIds,
            segments: getRouteSegments(route).slice().reverse().map(reverseRouteSegment)
        };
    }

    return null;
};

const findSegmentForPair = (segments, a, b) => {
    const from = toText(a);
    const to = toText(b);
    if (!from || !to) return null;
    for (const seg of Array.isArray(segments) ? segments : []) {
        const ids = getRouteStationIds(seg);
        for (let i = 0; i < ids.length - 1; i += 1) {
            if (ids[i] === from && ids[i + 1] === to) return seg;
        }
    }
    return null;
};

const resolveBranchPairSegmentInfo = ({ sourceSegment, fallbackLineId, fromStationId, toStationId } = {}) => {
    const fromLineId = getLineIdFromStationId(fromStationId);
    const toLineId = getLineIdFromStationId(toStationId);
    if (fromLineId && fromLineId === toLineId) {
        return {
            lineId: fromLineId,
            allowMerge: true
        };
    }

    return {
        lineId: toText(sourceSegment?.r || sourceSegment?.lineId || fallbackLineId),
        allowMerge: !(fromLineId && toLineId && fromLineId !== toLineId)
    };
};

const appendBranchPairSegment = (segments, lineId, d, a, b, options = {}) => {
    const rid = toText(lineId);
    const from = toText(a);
    const to = toText(b);
    if (!rid || !from || !to) return;

    const direction = toText(d);
    const last = segments.length ? segments[segments.length - 1] : null;
    if (
        options?.allowMerge !== false &&
        last
        && last.__allowMerge !== false
        && toText(last.r || last.lineId) === rid
        && toText(last.d) === direction
        && last.stationIds?.[last.stationIds.length - 1] === from
    ) {
        last.stationIds.push(to);
        last.stationIds = dedupKeepOrder(last.stationIds);
        return;
    }

    segments.push({
        kind: 'main',
        lineId: rid,
        r: rid,
        geometryLineId: rid,
        offsetLineId: rid,
        __allowMerge: options?.allowMerge !== false,
        ...(direction ? { d: direction } : {}),
        stationIds: [from, to]
    });
};

const buildBranchSegmentsFromRouteChains = (stationIds, routeChains, fallbackLineId) => {
    const list = Array.isArray(stationIds)
        ? stationIds.map((x) => toText(x)).filter(Boolean)
        : [];
    if (list.length < 2) return [];

    const chain = (Array.isArray(routeChains) ? routeChains : [])
        .map((route) => orientRouteChainForBranch(route, list))
        .find((route) => route && Array.isArray(route?.segments) && route.segments.length)
        || null;

    const segments = [];
    const chainSegments = Array.isArray(chain?.segments) ? chain.segments : [];
    const fallback = toText(fallbackLineId);

    for (let i = 0; i < list.length - 1; i += 1) {
        const a = list[i];
        const b = list[i + 1];
        const sourceSegment = findSegmentForPair(chainSegments, a, b);
        const pairInfo = resolveBranchPairSegmentInfo({
            sourceSegment,
            fallbackLineId: fallback,
            fromStationId: a,
            toStationId: b
        });
        appendBranchPairSegment(segments, pairInfo.lineId, sourceSegment?.d, a, b, {
            allowMerge: pairInfo.allowMerge
        });
    }

    return segments
        .filter((seg) => toText(seg?.r || seg?.lineId) && Array.isArray(seg?.stationIds) && seg.stationIds.length >= 2)
        .map((seg) => {
            const { __allowMerge, ...rest } = seg || {};
            return rest;
        });
};

const isLoopDirection = (value) => toText(value).toLowerCase().includes('loop');

const resolveFullLoopStationIds = (lineId, direction, lineStationIdsById) => {
    const lid = toText(lineId);
    const source = lineStationIdsById instanceof Map ? lineStationIdsById.get(lid) : null;
    const stations = Array.isArray(source)
        ? source.map((stationId) => toText(stationId)).filter(Boolean)
        : [];
    if (stations.length < 2) return [];
    const ordered = toText(direction).toLowerCase().includes('outer')
        ? stations.slice().reverse()
        : stations.slice();
    if (ordered[0] && ordered[ordered.length - 1] !== ordered[0]) {
        ordered.push(ordered[0]);
    }
    return ordered;
};

const replaceLoopSegmentsWithFullLoop = (segments, lineStationIdsById) => {
    const loopSegments = [];
    for (const segment of Array.isArray(segments) ? segments : []) {
        if (!isLoopDirection(segment?.d)) continue;
        const lineId = toText(segment?.r || segment?.lineId);
        const fullStationIds = resolveFullLoopStationIds(lineId, segment?.d, lineStationIdsById);
        if (fullStationIds.length < 2) continue;
        loopSegments.push({
            ...(segment || {}),
            lineId,
            r: lineId,
            geometryLineId: lineId,
            offsetLineId: lineId,
            stationIds: fullStationIds
        });
    }
    return loopSegments.length ? loopSegments : segments;
};

const appendUnique = (target, item, key, seen) => {
    if (!item || !key) return false;
    const set = seen instanceof Set ? seen : new Set();
    if (set.has(key)) return false;
    set.add(key);
    target.push(item);
    return true;
};

const buildBranchPreviewPayload = ({
    applyHighlightColor = true,
    highlightColor,
    lineId,
    lineName,
    previewSource,
    routeChains,
    lineStationIdsById,
    stationIds,
    tripKey
} = {}) => {
    const lid = toText(lineId);
    const ids = dedupKeepOrder(stationIds);
    if (!lid || ids.length < 2) return null;

    const segments = replaceLoopSegmentsWithFullLoop(
        buildBranchSegmentsFromRouteChains(ids, routeChains, lid),
        lineStationIdsById
    );
    if (!segments.length) return null;

    const payload = buildVirtualTripPreviewPayload({
        lineId: lid,
        lineName: toText(lineName) || lid,
        segments,
        stationIds: ids,
        tripKey,
        previewSource: toText(previewSource) || 'route-map-branch',
        fitMode: 'none'
    });
    if (!payload) return null;

    const color = applyHighlightColor === false ? '' : toText(highlightColor);
    if (color) {
        payload.typeColor = color;
        if (Array.isArray(payload.segments)) {
            payload.segments = payload.segments.map((seg) => ({ ...seg, typeColor: color }));
        }
    }
    return payload;
};

const buildBranchPayloadKey = (payload) => {
    const segs = Array.isArray(payload?.segments) ? payload.segments : [];
    if (segs.length) {
        return segs.map((seg) => {
            const rid = toText(seg?.r || seg?.lineId);
            const ids = getRouteStationIds(seg).join('>');
            return `${rid}:${ids}`;
        }).join('||');
    }
    const ids = Array.isArray(payload?.stationIds) ? payload.stationIds.map((x) => toText(x)).filter(Boolean) : [];
    return ids.length ? ids.join('>') : '';
};

const mergeEndpointIds = (...groups) => {
    const out = [];
    const seen = new Set();
    for (const group of groups) {
        for (const raw of Array.isArray(group) ? group : []) {
            const id = toText(raw);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
    }
    return out;
};

const buildBranchPreviewFromAnalysisResult = ({
    lid,
    lineName,
    result,
    previewSource,
    highlightColor,
    applyHighlightColor = true,
    originStationIds,
    terminalStationIds
} = {}) => {
    const source = toText(previewSource) || 'route-map-branch';
    const normalizedHighlightColor = toText(highlightColor);
    let fullChainOriginStationIds = Array.isArray(originStationIds) && originStationIds.length
        ? originStationIds.map((x) => toText(x)).filter(Boolean)
        : (Array.isArray(result?.originStationIds) ? result.originStationIds.map((x) => toText(x)).filter(Boolean) : []);
    let fullChainTerminalStationIds = Array.isArray(terminalStationIds) && terminalStationIds.length
        ? terminalStationIds.map((x) => toText(x)).filter(Boolean)
        : (Array.isArray(result?.terminalStationIds) ? result.terminalStationIds.map((x) => toText(x)).filter(Boolean) : []);
    const rawBranchList = Array.isArray(result?.branchList) ? result.branchList : [];
    const routeChains = Array.isArray(result?.fullRouteChains) ? result.fullRouteChains : [];
    const lineStationIdsById = result?.lineStationIdsById instanceof Map ? result.lineStationIdsById : new Map();
    const virtualTrips = [];
    const virtualTripKeys = new Set();

    for (let i = 0; i < rawBranchList.length; i += 1) {
        const stationIds = dedupKeepOrder(rawBranchList[i]);
        if (stationIds.length < 2) continue;
        const payload = buildBranchPreviewPayload({
            applyHighlightColor,
            lineId: lid,
            lineName: toText(lineName) || lid,
            highlightColor: normalizedHighlightColor,
            previewSource: source,
            routeChains,
            lineStationIdsById,
            stationIds,
            tripKey: `branch-${i + 1}`,
        });
        appendUnique(virtualTrips, payload, buildBranchPayloadKey(payload), virtualTripKeys);
    }

    if (!virtualTrips.length) {
        return {
            ok: false,
            reason: 'empty-branches',
            result
        };
    }

    return {
        ok: true,
        lineId: lid,
        lineName: toText(lineName) || lid,
        previewSource: source,
        originStationIds: fullChainOriginStationIds,
        terminalStationIds: fullChainTerminalStationIds,
        result,
        virtualTrips,
        virtualTripCount: virtualTrips.length
    };
};

export const buildBranchPreviewForLineRequest = async ({
    lineId,
    lineName,
    targetTripKeys,
    previewSource = 'route-map-branch',
    throughServiceCategory,
    sourceLineIds,
    highlightColor,
    applyHighlightColor = true,
    filterSpecial = false,
    originStationIds,
    terminalStationIds,
    anchorStationIds,
    alternateLineMembership = null,
    isStillActive
} = {}) => {
    const lid = toText(lineId);
    if (!lid) return { ok: false, reason: 'line-id-empty' };

    const source = toText(previewSource) || 'route-map-branch';
    const normalizedCategory = toText(throughServiceCategory);
    const normalizedSourceLineIds = Array.isArray(sourceLineIds)
        ? sourceLineIds.map((x) => toText(x)).filter(Boolean)
        : [];
    const normalizedAnchorStationIds = Array.isArray(anchorStationIds)
        ? Array.from(new Set(anchorStationIds.map((x) => toText(x)).filter(Boolean)))
        : [];

    const normalizedHighlightColor = toText(highlightColor);
    const hasStillActive = typeof isStillActive === 'function';
    const stillActive = () => (
        hasStillActive ? isStillActive() !== false : true
    );
    const cancellationOptions = hasStillActive ? { isStillActive: stillActive } : {};
    if (!stillActive()) return { ok: false, reason: 'stale' };
    const result = await analyzeBranchesForLine(lid, {
        targetTripKeys,
        throughServiceCategory: normalizedCategory,
        sourceLineIds: normalizedSourceLineIds,
        filterSpecial: filterSpecial === true,
        anchorStationIds: normalizedAnchorStationIds,
        alternateLineMembership,
        ...cancellationOptions
    });
    if (!stillActive() || result?.reason === 'stale') return { ok: false, reason: 'stale', result };

    return buildBranchPreviewFromAnalysisResult({
        lid,
        lineName,
        result,
        previewSource: source,
        highlightColor: normalizedHighlightColor,
        applyHighlightColor,
        originStationIds,
        terminalStationIds
    });
};

export const previewBranchesForLine = async ({
    lineId,
    lineName,
    fitMode = 'commit',
    targetTripKeys,
    highlightStationIds,
    previewSource = 'route-map-branch',
    throughServiceCategory,
    sourceLineIds,
    highlightColor,
    applyHighlightColor = true,
    filterSpecial = false,
    originStationIds,
    terminalStationIds,
    endpointOnlyStationPreview = false,
    endpointLabelCounts,
    anchorStationIds,
    alternateLineMembership = null
} = {}) => {
    const source = toText(previewSource) || 'route-map-branch';
    const actions = window?.TokyoRailSearchMapActions;
    if (!actions || typeof actions.previewTripPath !== 'function') {
        return { ok: false, reason: 'map-actions-unavailable' };
    }

    const normalizedAnchorStationIds = Array.isArray(anchorStationIds)
        ? Array.from(new Set(anchorStationIds.map((x) => toText(x)).filter(Boolean)))
        : (Array.isArray(highlightStationIds)
            ? Array.from(new Set(highlightStationIds.map((x) => toText(x)).filter(Boolean)))
            : []);

    const built = await buildBranchPreviewForLineRequest({
        lineId,
        lineName,
        targetTripKeys,
        previewSource: source,
        throughServiceCategory,
        sourceLineIds,
        highlightColor,
        applyHighlightColor,
        filterSpecial,
        anchorStationIds: normalizedAnchorStationIds,
        alternateLineMembership,
        originStationIds,
        terminalStationIds
    });

    if (!built?.ok) {
        if (built?.reason === 'empty-branches' && typeof actions.clearTripPathPreviewBySource === 'function') {
            actions.clearTripPathPreviewBySource(source);
        }
        return built;
    }

    const lid = built.lineId;
    actions.previewTripPath({
        selectedLineId: lid,
        mainLineId: lid,
        tripKey: `branches:${lid}`,
        previewSource: source,
        originStationIds: built.originStationIds,
        terminalStationIds: built.terminalStationIds,
        endpointOnlyStationPreview: endpointOnlyStationPreview === true,
        endpointLabelCounts: Array.isArray(endpointLabelCounts) ? endpointLabelCounts : [],
        highlightStationIds: Array.isArray(highlightStationIds)
            ? highlightStationIds.map((x) => toText(x)).filter(Boolean)
            : [],
        fitMode: toText(fitMode) || 'commit',
        virtualTrips: built.virtualTrips
    }, {
        fitMode: toText(fitMode) || 'commit',
        clearBefore: true
    });

    return {
        ok: true,
        result: built.result,
        virtualTripCount: built.virtualTripCount
    };
};

export const previewBranchesForLineRequests = async ({
    requests,
    fitMode = 'commit',
    highlightStationIds,
    panelCurrentStationVisualHighlightId = '',
    alternateLineMembership = null,
    isStillActive,
    previewSource = 'route-map-branch',
    endpointOnlyStationPreview = false
} = {}) => {
    const source = toText(previewSource) || 'route-map-branch';
    const actions = window?.TokyoRailSearchMapActions;
    if (!actions || typeof actions.previewTripPath !== 'function') {
        return { ok: false, reason: 'map-actions-unavailable' };
    }

    const list = Array.isArray(requests) ? requests : [];
    if (!list.length) {
        if (typeof actions.clearTripPathPreviewBySource === 'function') {
            actions.clearTripPathPreviewBySource(source);
        }
        return { ok: false, reason: 'requests-empty' };
    }

    const virtualTrips = [];
    const originStationIds = [];
    const terminalStationIds = [];
    const endpointLabelCounts = [];
    const results = [];
    const virtualTripKeys = new Set();
    let primaryLineId = '';
    const stillActive = () => (
        typeof isStillActive === 'function' ? isStillActive() !== false : true
    );

    const batchItems = [];
    for (const request of list) {
        if (!stillActive()) return { ok: false, reason: 'stale' };
        const requestHighlightStationIds = Array.isArray(request?.anchorStationIds)
            ? request.anchorStationIds
            : (Array.isArray(request?.highlightStationIds) ? request.highlightStationIds : highlightStationIds);

        const lid = toText(request?.lineId);
        if (!lid) {
            batchItems.push({
                built: { ok: false, reason: 'line-id-empty' }
            });
            continue;
        }

        const normalizedCategory = toText(request?.throughServiceCategory);
        const normalizedSourceLineIds = Array.isArray(request?.sourceLineIds)
            ? request.sourceLineIds.map((x) => toText(x)).filter(Boolean)
            : [];
        const normalizedAnchorStationIds = Array.isArray(requestHighlightStationIds)
            ? Array.from(new Set(requestHighlightStationIds.map((x) => toText(x)).filter(Boolean)))
            : [];
        const plan = createBranchAnalysisPlan(lid, {
            targetTripKeys: request?.targetTripKeys,
            throughServiceCategory: normalizedCategory,
            sourceLineIds: normalizedSourceLineIds,
            filterSpecial: request?.filterSpecial === true,
            anchorStationIds: normalizedAnchorStationIds,
            alternateLineMembership
        });

        batchItems.push({
            plan,
            lid,
            lineName: request?.lineName,
            highlightColor: request?.highlightColor,
            applyHighlightColor: request?.applyHighlightColor !== false,
            originStationIds: request?.originStationIds,
            terminalStationIds: request?.terminalStationIds,
            endpointLabelCounts: request?.endpointLabelCounts
        });
    }

    const plans = batchItems.map((item) => item.plan).filter(Boolean);
    const analysisResults = await runBranchAnalysisPlansBatch({
        plans,
        isActive: stillActive
    });
    if (!stillActive()) return { ok: false, reason: 'stale', results };

    let analysisResultIndex = 0;
    for (const item of batchItems) {
        const analysisResult = item.plan ? analysisResults[analysisResultIndex++] : null;
        let built = item.built || null;
        if (!built && analysisResult?.reason === 'stale') {
            built = { ok: false, reason: 'stale', result: analysisResult };
        }
        if (!built) {
            built = buildBranchPreviewFromAnalysisResult({
                lid: item.lid,
                lineName: item.lineName,
                result: analysisResult,
                previewSource: source,
                highlightColor: item.highlightColor,
                applyHighlightColor: item.applyHighlightColor,
                originStationIds: item.originStationIds,
                terminalStationIds: item.terminalStationIds
            });
        }
        if (!stillActive()) return { ok: false, reason: 'stale', results };
        results.push(built);
        if (built?.reason === 'stale') return { ok: false, reason: 'stale', results };
        if (!built?.ok) continue;
        if (!primaryLineId) primaryLineId = built.lineId;
        for (const payload of built.virtualTrips || []) {
            appendUnique(virtualTrips, payload, buildBranchPayloadKey(payload), virtualTripKeys);
        }
        originStationIds.push(...(Array.isArray(built.originStationIds) ? built.originStationIds : []));
        terminalStationIds.push(...(Array.isArray(built.terminalStationIds) ? built.terminalStationIds : []));
        endpointLabelCounts.push(...(Array.isArray(item.endpointLabelCounts) ? item.endpointLabelCounts : []));
    }

    if (!virtualTrips.length) {
        if (typeof actions.clearTripPathPreviewBySource === 'function') {
            actions.clearTripPathPreviewBySource(source);
        }
        return {
            ok: false,
            reason: 'empty-branches',
            results
        };
    }

    const selectedLineId = primaryLineId || 'multi';
    if (!stillActive()) return { ok: false, reason: 'stale', results };
    const previewPayload = {
        selectedLineId,
        mainLineId: selectedLineId,
        tripKey: `branches:${source}:${virtualTrips.length}`,
        previewSource: source,
        originStationIds: mergeEndpointIds(originStationIds),
        terminalStationIds: mergeEndpointIds(terminalStationIds),
        endpointOnlyStationPreview: endpointOnlyStationPreview === true,
        endpointLabelCounts,
        highlightStationIds: Array.isArray(highlightStationIds)
            ? highlightStationIds.map((x) => toText(x)).filter(Boolean)
            : [],
        ...(toText(panelCurrentStationVisualHighlightId)
            ? { panelCurrentStationVisualHighlightId: toText(panelCurrentStationVisualHighlightId) }
            : {}),
        fitMode: toText(fitMode) || 'commit',
        virtualTrips
    };
    if (!stillActive()) return { ok: false, reason: 'stale', results };
    const previewResult = actions.previewTripPath(previewPayload, {
        fitMode: toText(fitMode) || 'commit',
        clearBefore: true
    });
    if (!previewResult?.ok) {
        if (previewResult?.reason === 'stale') return { ok: false, reason: previewResult.reason, results };
        return {
            ok: false,
            reason: String(previewResult?.reason || 'preview-failed'),
            results
        };
    }
    const sourceFromResult = toText(previewResult?.source) || source;

    return {
        ok: true,
        payload: previewPayload,
        built: previewResult?.built,
        source: sourceFromResult,
        results,
        virtualTripCount: virtualTrips.length
    };
};
