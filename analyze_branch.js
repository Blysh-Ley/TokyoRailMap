import { getCachedJson } from './fetch.js';
import { buildVirtualTripPreviewPayload } from './trip-preview.js';

const toText = (v) => String(v ?? '').trim();

const branchAnalysisCacheByLine = new Map();
let allTimetableRecordsPromise = null;
let stationRailwayIndexPromise = null;

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

const inferLineIdFromStationId = (stationId) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

const getStationRailwayIndex = async () => {
    if (stationRailwayIndexPromise) return stationRailwayIndexPromise;

    stationRailwayIndexPromise = (async () => {
        const stations = await getCachedJson('./data/stations.json');
        const map = new Map();
        for (const row of Array.isArray(stations) ? stations : []) {
            const stationId = toText(row?.id);
            if (!stationId) continue;
            const railway = toText(row?.railway) || inferLineIdFromStationId(stationId);
            if (!railway) continue;
            map.set(stationId, railway);
        }
        return map;
    })();

    return stationRailwayIndexPromise;
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

const buildThroughServiceTtLists = (targetTimetables, idMap) => {
    const out = [];
    const seenRoutes = new Set();

    for (const rec of Array.isArray(targetTimetables) ? targetTimetables : []) {
        const rid = getTripId(rec);
        if (!rid || !idMap.has(rid)) continue;

        const idPaths = buildThroughServiceIdPaths(rid, idMap);
        for (const idPath of idPaths) {
            const stationSequences = [];
            for (const oid of idPath) {
                const tt = Array.isArray(idMap.get(oid)?.tt) ? idMap.get(oid).tt : [];
                const seq = tt.map((row) => toText(row?.s)).filter(Boolean);
                if (seq.length) stationSequences.push(seq);
            }

            const merged = mergeStationSequences(stationSequences);
            if (merged.length < 2) continue;

            const key = canonicalKey(merged);
            if (seenRoutes.has(key)) continue;
            seenRoutes.add(key);
            out.push(merged);
        }
    }

    return out;
};

const selectFullRoutes = (ttLists) => {
    const unique = [];
    const seen = new Set();
    for (const seq of Array.isArray(ttLists) ? ttLists : []) {
        const key = canonicalKey(seq);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(seq);
    }

    const fullRoutes = [];
    for (let i = 0; i < unique.length; i += 1) {
        const seq = unique[i];
        let absorbed = false;
        for (let j = 0; j < unique.length; j += 1) {
            if (i === j) continue;
            const other = unique[j];
            if (other.length <= seq.length) continue;
            if (isSubsequenceAnyDirection(seq, other)) {
                absorbed = true;
                break;
            }
        }
        if (!absorbed) fullRoutes.push(seq);
    }

    const byEndpoint = new Map();
    for (const seq of fullRoutes) {
        if (!Array.isArray(seq) || seq.length < 2) continue;
        const key = canonicalEndpointKey(seq);
        const best = byEndpoint.get(key);
        if (!best || seq.length > best.length) {
            byEndpoint.set(key, seq);
            continue;
        }
        if (seq.length === best.length) {
            const a = canonicalKey(seq);
            const b = canonicalKey(best);
            if (a < b) byEndpoint.set(key, seq);
        }
    }

    return Array.from(byEndpoint.values());
};

const buildGraph = (routes) => {
    const detailedPairs = new Set();
    for (const route of Array.isArray(routes) ? routes : []) {
        const list = Array.isArray(route) ? route : [];
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

    for (const stops of Array.isArray(routes) ? routes : []) {
        const list = Array.isArray(stops) ? stops : [];
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
        const list = Array.isArray(route) ? route : [];
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

const loadAllTimetableRecords = async () => {
    if (allTimetableRecordsPromise) return allTimetableRecordsPromise;

    allTimetableRecordsPromise = (async () => {
        const railways = await getCachedJson('./data/railways.json');
        const railwayIds = Array.from(new Set((Array.isArray(railways) ? railways : []).map((r) => toText(r?.id)).filter(Boolean)));

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
        const idMap = new Map();
        for (const list of lineDataById.values()) {
            for (const rec of Array.isArray(list) ? list : []) {
                const id = getTripId(rec);
                if (!id) continue;
                allRecords.push(rec);
                if (!idMap.has(id)) idMap.set(id, rec);
            }
        }

        return {
            allRecords,
            idMap
        };
    })();

    return allTimetableRecordsPromise;
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

const matchesTripFilter = (rec, tripFilterSet) => {
    if (!(tripFilterSet instanceof Set) || !tripFilterSet.size) return true;
    const id = toText(rec?.id);
    const t = toText(rec?.t);
    const idBase = id ? id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '') : '';
    const tBase = t ? t.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '') : '';
    return tripFilterSet.has(id)
        || tripFilterSet.has(t)
        || (idBase && tripFilterSet.has(idBase))
        || (tBase && tripFilterSet.has(tBase));
};

const THROUGH_STATION_TOKENS = Object.freeze({
    SHINJUKU: 'Shinjuku',
    SHIBUYA: 'Shibuya',
    UENO: 'Ueno',
    TOKYO: 'Tokyo'
});

const SHONAN_SHINJUKU_EXCLUDED_CHAIN_PREFIXES = Object.freeze([
    'JR-East.Ito',
    'Izukyu.Izukyu'
]);

const getTripLineIdForThrough = (trip) => {
    const rid = toText(trip?.r);
    if (rid) return rid;
    const id = toText(trip?.id) || toText(trip?.t);
    if (!id) return '';
    const parts = id.split('.').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

const hasExcludedShonanChainLine = (lineIds) => {
    const ids = Array.isArray(lineIds) ? lineIds : [];
    for (const lineId of ids) {
        const lid = toText(lineId);
        if (!lid) continue;
        for (const prefix of SHONAN_SHINJUKU_EXCLUDED_CHAIN_PREFIXES) {
            if (lid === prefix || lid.startsWith(`${prefix}.`)) return true;
        }
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

const detectThroughServiceCategory = (trips) => {
    const flags = {
        hasShinjuku: false,
        hasShibuya: false,
        hasUeno: false,
        hasTokyo: false
    };
    const chainLineIds = [];

    for (const trip of Array.isArray(trips) ? trips : []) {
        const lineId = getTripLineIdForThrough(trip);
        if (lineId) chainLineIds.push(lineId);
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        for (const row of tt) {
            const stationId = toText(row?.s);
            if (!stationId) continue;
            const token = stationId.split('.').pop();
            if (token === THROUGH_STATION_TOKENS.SHINJUKU) flags.hasShinjuku = true;
            if (token === THROUGH_STATION_TOKENS.SHIBUYA) flags.hasShibuya = true;
            if (token === THROUGH_STATION_TOKENS.UENO) flags.hasUeno = true;
            if (token === THROUGH_STATION_TOKENS.TOKYO) flags.hasTokyo = true;
        }
    }

    if (flags.hasShinjuku && flags.hasShibuya && !hasExcludedShonanChainLine(chainLineIds)) return 'ShonanShinjuku';
    if (flags.hasUeno && flags.hasTokyo) return 'UenoTokyo';
    return '';
};

const matchesThroughServiceCategory = (trip, idMap, expectedCategory, cache) => {
    const wanted = toText(expectedCategory);
    if (!wanted) return true;

    const tripId = toText(trip?.id) || toText(trip?.t);
    if (cache instanceof Map && tripId && cache.has(tripId)) {
        return cache.get(tripId) === wanted;
    }

    const connectedTrips = collectConnectedTrips(trip, idMap);
    const category = detectThroughServiceCategory(connectedTrips);
    if (cache instanceof Map && tripId) cache.set(tripId, category);
    return category === wanted;
};

export const analyzeBranchesForLine = async (lineId, options = {}) => {
    const sourceLineIds = Array.isArray(options?.sourceLineIds)
        ? options.sourceLineIds.map((x) => toText(x)).filter(Boolean)
        : [];

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
    const cacheKey = `${lineIdsKey}##${tripFilterKey}##${categoryKey}`;

    if (!branchAnalysisCacheByLine.has(cacheKey)) {
        const p = (async () => {
            const { allRecords, idMap } = await loadAllTimetableRecords();
            const throughCategoryCache = new Map();
            const targetTimetables = allRecords.filter((rec) => {
                const currentLineId = getTripLineId(rec);
                if (!activeLineSet.has(currentLineId)) return false;
                if (!matchesTripFilter(rec, tripFilterSet)) return false;
                return matchesThroughServiceCategory(rec, idMap, throughServiceCategory, throughCategoryCache);
            });

            if (!targetTimetables.length) {
                return {
                    lineId: lid,
                    sourceLineIds: activeLineIds,
                    throughServiceCategory,
                    targetCount: 0,
                    throughServiceCount: 0,
                    fullRouteCount: 0,
                    branchList: []
                };
            }

            const ttLists = buildThroughServiceTtLists(targetTimetables, idMap);
            const fullRoutes = selectFullRoutes(ttLists);
            const graph = buildGraph(fullRoutes);
            const branchList = extractBranchLists(graph, fullRoutes).map((seq) => dedupKeepOrder(seq));

            return {
                lineId: lid,
                sourceLineIds: activeLineIds,
                throughServiceCategory,
                targetCount: targetTimetables.length,
                throughServiceCount: ttLists.length,
                fullRouteCount: fullRoutes.length,
                branchList: branchList.filter((x) => Array.isArray(x) && x.length >= 2)
            };
        })();

        branchAnalysisCacheByLine.set(cacheKey, p);
    }

    return branchAnalysisCacheByLine.get(cacheKey);
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
            stationIds,
            tripKey: `branch-${i + 1}`,
            previewSource: 'route-map-branch',
            fitMode: 'none'
        });
        if (payload) out.push(payload);
    }

    return out;
};

const buildBranchSegmentsByRailway = (stationIds, stationRailwayByStationId, fallbackLineId) => {
    const list = Array.isArray(stationIds)
        ? stationIds.map((x) => toText(x)).filter(Boolean)
        : [];
    if (list.length < 2) return [];

    const lineOfStation = (sid) => {
        const mapped = toText(stationRailwayByStationId?.get?.(sid));
        if (mapped) return mapped;
        const inferred = inferLineIdFromStationId(sid);
        return inferred || toText(fallbackLineId);
    };

    const segments = [];

    let currentLine = lineOfStation(list[0]);
    let currentIds = [list[0]];

    for (let i = 1; i < list.length; i += 1) {
        const sid = list[i];
        const sidLine = lineOfStation(sid);

        if (sidLine && currentLine && sidLine !== currentLine) {
            if (currentIds.length >= 2) {
                segments.push({
                    lineId: currentLine,
                    stationIds: dedupKeepOrder(currentIds)
                });
            }

            const bridgeStart = currentIds[currentIds.length - 1];
            currentLine = sidLine;
            currentIds = [bridgeStart, sid];
            continue;
        }

        if (!currentLine) currentLine = sidLine || toText(fallbackLineId);
        currentIds.push(sid);
    }

    if (currentIds.length >= 2) {
        segments.push({
            lineId: currentLine || toText(fallbackLineId),
            stationIds: dedupKeepOrder(currentIds)
        });
    }

    return segments.filter((seg) => toText(seg?.lineId) && Array.isArray(seg?.stationIds) && seg.stationIds.length >= 2);
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
    highlightColor
} = {}) => {
    const lid = toText(lineId);
    if (!lid) return { ok: false, reason: 'line-id-empty' };

    const actions = window?.TokyoRailSearchMapActions;
    if (!actions || typeof actions.previewTripPath !== 'function') {
        return { ok: false, reason: 'map-actions-unavailable' };
    }

    const source = toText(previewSource) || 'route-map-branch';
    const normalizedCategory = toText(throughServiceCategory);
    const normalizedSourceLineIds = Array.isArray(sourceLineIds)
        ? sourceLineIds.map((x) => toText(x)).filter(Boolean)
        : [];
    const normalizedHighlightColor = toText(highlightColor);
    const result = await analyzeBranchesForLine(lid, {
        targetTripKeys,
        throughServiceCategory: normalizedCategory,
        sourceLineIds: normalizedSourceLineIds
    });
    const stationRailwayByStationId = await getStationRailwayIndex();
    const rawBranchList = Array.isArray(result?.branchList) ? result.branchList : [];
    const virtualTrips = [];

    for (let i = 0; i < rawBranchList.length; i += 1) {
        const stationIds = dedupKeepOrder(rawBranchList[i]);
        if (stationIds.length < 2) continue;
        const segments = buildBranchSegmentsByRailway(stationIds, stationRailwayByStationId, lid);
        if (!segments.length) continue;

        const payload = buildVirtualTripPreviewPayload({
            lineId: lid,
            lineName: toText(lineName) || lid,
            segments,
            stationIds,
            tripKey: `branch-${i + 1}`,
            previewSource: source,
            fitMode: 'none'
        });
        if (payload) {
            if (normalizedHighlightColor) {
                payload.typeColor = normalizedHighlightColor;
                if (Array.isArray(payload.segments)) {
                    payload.segments = payload.segments.map((seg) => ({ ...seg, typeColor: normalizedHighlightColor }));
                }
            }
            virtualTrips.push(payload);
        }
    }

    if (!virtualTrips.length) {
        if (typeof actions.clearTripPathPreviewBySource === 'function') {
            actions.clearTripPathPreviewBySource(source);
        }
        return {
            ok: false,
            reason: 'empty-branches',
            result
        };
    }

    actions.previewTripPath({
        selectedLineId: lid,
        mainLineId: lid,
        tripKey: `branches:${lid}`,
        previewSource: source,
        highlightStationIds: Array.isArray(highlightStationIds)
            ? highlightStationIds.map((x) => toText(x)).filter(Boolean)
            : [],
        fitMode: toText(fitMode) || 'commit',
        virtualTrips
    }, {
        fitMode: toText(fitMode) || 'commit',
        clearBefore: true
    });

    return {
        ok: true,
        result,
        virtualTripCount: virtualTrips.length
    };
};
