/**
 * panel-train-type.js
 *
 * Data utilities for building “train type stop pattern” UI.
 *
 * Notes:
 * - This module intentionally contains NO UI code.
 * - UI is implemented in panel-train-type-ui.js.
 */

const toText = (v) => String(v ?? '').trim();

const pickTitleZhHans = (titleObj) => {
    const t = titleObj || {};
    return (
        toText(t['zh-Hans']) ||
        toText(t.zh) ||
        toText(t['zh']) ||
        toText(t['zh-CN']) ||
        toText(t['zh-cn']) ||
        toText(t['zh-Hant']) ||
        toText(t.ja) ||
        toText(t.en) ||
        ''
    );
};

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[') && s.endsWith(']')) {
        try {
            const parsed = JSON.parse(s);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return [s];
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

const getRefLineId = (refId) => {
    const s = toText(refId);
    if (!s) return '';
    const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

const getTripBaseKey = (trip) => {
    const t = toText(trip?.t);
    if (t) return t;
    const id = toText(trip?.id);
    if (!id) return '';
    return id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
};

const getTripServiceDay = (trip) => {
    const id = toText(trip?.id);
    if (!id) return '';
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

const buildStopStationIds = (trip) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    const out = [];
    for (const row of tt) {
        const sid = toText(row?.s);
        if (sid) out.push(sid);
    }
    return out;
};

const yieldToMain = async () => new Promise((r) => setTimeout(r, 0));

let stationsIndexPromise = null;
const getStationsIndex = async () => {
    if (stationsIndexPromise) return stationsIndexPromise;
    stationsIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/stations.json');
            if (!resp.ok) return { idToNameZh: new Map() };
            const list = await resp.json();
            const idToNameZh = new Map();
            for (const s of Array.isArray(list) ? list : []) {
                const id = toText(s?.id);
                if (!id) continue;
                const name = pickTitleZhHans(s?.title) || id;
                if (name) idToNameZh.set(id, name);
            }
            return { idToNameZh };
        } catch {
            return { idToNameZh: new Map() };
        }
    })();
    return stationsIndexPromise;
};

let trainTypesIndexPromise = null;
const getTrainTypesIndex = async () => {
    if (trainTypesIndexPromise) return trainTypesIndexPromise;
    trainTypesIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                map.set(id, pickTitleZhHans(t?.title) || id);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypesIndexPromise;
};

let trainTypeColorIndexPromise = null;
const getTrainTypeColorIndex = async () => {
    if (trainTypeColorIndexPromise) return trainTypeColorIndexPromise;
    trainTypeColorIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                const color = toText(t?.title?.color);
                if (!color) continue;
                map.set(id, color);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypeColorIndexPromise;
};

let railwaysIndexPromise = null;
const getRailwaysIndex = async () => {
    if (railwaysIndexPromise) return railwaysIndexPromise;
    railwaysIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/railways.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const r of Array.isArray(list) ? list : []) {
                const id = toText(r?.id);
                if (!id) continue;
                map.set(id, {
                    id,
                    name: pickTitleZhHans(r?.title) || id,
                    color: toText(r?.color) || '',
                    company: toText(r?.company) || '',
                    stationIds: (Array.isArray(r?.stations) ? r.stations : []).map((x) => toText(x)).filter(Boolean)
                });
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return railwaysIndexPromise;
};

const loadTimetableForLineId = async (lineId) => {
    const id = toText(lineId);
    if (!id) return null;
    try {
        const cache = window?.TokyoRailTimetableCache;
        if (!cache) return null;
        const existing = cache.get(id);
        if (existing) return existing;
        await cache.preloadByLineIds([id]);
        return cache.get(id);
    } catch {
        return null;
    }
};

const createTripResolver = () => {
    const refTripCache = new Map(); // refId -> trip|null

    const loadTripByRefId = async (refId) => {
        const key = toText(refId);
        if (!key) return null;
        if (refTripCache.has(key)) return refTripCache.get(key);

        const refLineId = getRefLineId(key);
        if (!refLineId) {
            refTripCache.set(key, null);
            return null;
        }

        const data = await loadTimetableForLineId(refLineId);
        const list = Array.isArray(data) ? data : [];
        let hit = list.find((t) => toText(t?.id) === key) || null;
        if (!hit) {
            const parts = key.split('.').map((x) => x.trim()).filter(Boolean);
            const maybeNoDay = parts.length >= 2 ? parts.slice(0, -1).join('.') : key;
            hit =
                list.find((t) => toText(t?.t) === maybeNoDay) ||
                list.find((t) => toText(t?.id) === maybeNoDay) ||
                list.find((t) => {
                    const id = toText(t?.id);
                    return id ? id.startsWith(`${maybeNoDay}.`) : false;
                }) ||
                null;
        }

        refTripCache.set(key, hit);
        return hit;
    };

    const collectRefChainTrips = async (startTrip, key) => {
        const out = [];
        const seenRefs = new Set();
        const seenTrips = new Set();
        let cursor = startTrip;

        for (let i = 0; i < 24; i += 1) {
            const refs = normalizeArrayLike(cursor?.[key]);
            const refId = toText(refs?.[0]);
            if (!refId) break;
            if (seenRefs.has(refId)) break;
            seenRefs.add(refId);

            const refTrip = await loadTripByRefId(refId);
            if (!refTrip) break;

            const sid = toText(refTrip?.id) || toText(refTrip?.t);
            if (sid && seenTrips.has(sid)) break;
            out.push(refTrip);
            if (sid) seenTrips.add(sid);

            cursor = refTrip;
        }

        return out;
    };

    return { loadTripByRefId, collectRefChainTrips };
};

const computeLineTrainTypePatterns = async (selectedLineId, options = {}) => {
    const lineId = toText(selectedLineId);
    if (!lineId) return null;

    const serviceDay = toText(options?.serviceDay);

    const [stationsIndex, trainTypesIndex, trainTypeColorIndex, railwaysIndex, timetableData] = await Promise.all([
        getStationsIndex(),
        getTrainTypesIndex(),
        getTrainTypeColorIndex(),
        getRailwaysIndex(),
        loadTimetableForLineId(lineId)
    ]);

    const list = Array.isArray(timetableData) ? timetableData : [];
    const lineMeta = railwaysIndex.get(lineId) || { id: lineId, name: lineId, color: '', company: '', stationIds: [] };
    const lineStationIds = Array.isArray(lineMeta?.stationIds) ? lineMeta.stationIds : [];

    const stationName = (sid) => stationsIndex?.idToNameZh?.get?.(sid) || sid;
    const typeName = (tid) => toText(trainTypesIndex?.get?.(tid) || tid);
    const typeColor = (tid) => toText(trainTypeColorIndex?.get?.(tid) || '');

    const byDirType = new Map(); // dir -> Map<typeId, Map<patternKey, entry>>

    const makePatternKey = (stopsSet) => {
        if (lineStationIds.length) {
            const indices = [];
            for (let i = 0; i < lineStationIds.length; i += 1) {
                if (stopsSet.has(lineStationIds[i])) indices.push(i);
            }
            return indices.join(',');
        }
        return Array.from(stopsSet).sort().join(',');
    };

    const upsertPattern = (dir, typeId, stopsSet, sampleTripId, serviceDay) => {
        const d = toText(dir) || 'Unknown';
        const y = toText(typeId) || 'Unknown';
        if (!byDirType.has(d)) byDirType.set(d, new Map());
        const byType = byDirType.get(d);
        if (!byType.has(y)) byType.set(y, new Map());
        const byPattern = byType.get(y);

        const key = makePatternKey(stopsSet);
        const existing = byPattern.get(key);
        if (existing) {
            existing.tripCount += 1;
            if (sampleTripId && existing.sampleTripIds.length < 6) existing.sampleTripIds.push(sampleTripId);
            if (serviceDay) existing.serviceDays.add(serviceDay);
            return;
        }

        const stopStationIdsOnLine = lineStationIds.length
            ? lineStationIds.filter((sid) => stopsSet.has(sid))
            : Array.from(stopsSet);
        const passStationIdsOnLine = lineStationIds.length
            ? lineStationIds.filter((sid) => !stopsSet.has(sid))
            : [];
        const stopMask = lineStationIds.length
            ? lineStationIds.map((sid) => stopsSet.has(sid))
            : [];
        const stopIndices = lineStationIds.length
            ? stopStationIdsOnLine.map((sid) => lineStationIds.indexOf(sid)).filter((i) => i >= 0)
            : [];

        byPattern.set(key, {
            patternKey: key,
            tripCount: 1,
            sampleTripIds: sampleTripId ? [sampleTripId] : [],
            serviceDays: new Set(serviceDay ? [serviceDay] : []),
            lineStationIds: lineStationIds.slice(),
            stopMask,
            stopStationIds: stopStationIdsOnLine,
            stopStationNames: stopStationIdsOnLine.map(stationName),
            stopIndices,
            passStationIds: passStationIdsOnLine,
            passStationNames: passStationIdsOnLine.map(stationName)
        });
    };

    // base patterns (selected line only)
    for (let i = 0; i < list.length; i += 1) {
        const trip = list[i];
        const day = getTripServiceDay(trip);
        if (serviceDay && day && day !== serviceDay) continue;
        const dir = toText(trip?.d) || 'Unknown';
        const y = toText(trip?.y) || 'Unknown';
        const tripId = toText(trip?.id) || toText(trip?.t);

        const stopIds = buildStopStationIds(trip);
        if (!stopIds.length) continue;
        const stopsSet = new Set(stopIds);
        upsertPattern(dir, y, stopsSet, tripId, day);

        if (i > 0 && i % 1200 === 0) await yieldToMain();
    }

    const stationIndexById = new Map(lineStationIds.map((sid, idx) => [sid, idx]));
    const { loadTripByRefId } = createTripResolver();
    const throughByDir = new Map(); // dir -> Map<afterIndex, Map<typeId, Map<entryKey, entry>>>

    const dirStepCounts = new Map(); // dir -> { pos, neg }

    const inferTripStep = (indices) => {
        const a = Number(indices?.[0]);
        const b = Number(indices?.[1]);
        if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return b > a ? 1 : -1;
        const first = Number(indices?.[0]);
        const last = Number(indices?.[indices.length - 1]);
        if (Number.isFinite(first) && Number.isFinite(last) && first !== last) return last > first ? 1 : -1;
        return 1;
    };

    const pushThroughEntry = (dirRaw, afterStationIndex, typeIdRaw, entryKey, entry) => {
        const dir = toText(dirRaw) || 'Unknown';
        const typeId = toText(typeIdRaw) || 'Unknown';
        const idx = Number(afterStationIndex);
        // allow [-1, N-1]
        if (!Number.isFinite(idx) || idx < -1 || idx > Math.max(-1, lineStationIds.length - 1)) return;
        if (!throughByDir.has(dir)) throughByDir.set(dir, new Map());
        const byGap = throughByDir.get(dir);
        if (!byGap.has(idx)) byGap.set(idx, new Map());
        const byType = byGap.get(idx);
        if (!byType.has(typeId)) byType.set(typeId, new Map());
        const byEntry = byType.get(typeId);
        if (!byEntry.has(entryKey)) {
            byEntry.set(entryKey, { ...entry, _hits: 1 });
            return;
        }
        const existing = byEntry.get(entryKey);
        existing._hits = Number(existing?._hits || 0) + 1;
    };

    const shouldPreferGapIndex = (dirRaw, kindRaw, nextGapIndex, prevGapIndex, nextHits = 0, prevHits = 0) => {
        const dir = toText(dirRaw) || 'Unknown';
        const kind = toText(kindRaw);
        const step = (dirStepCounts.get(dir)?.pos || 0) >= (dirStepCounts.get(dir)?.neg || 0) ? 1 : -1;

        if (kind === 'pt') {
            if (nextGapIndex !== prevGapIndex) return step > 0 ? nextGapIndex < prevGapIndex : nextGapIndex > prevGapIndex;
            if (nextHits !== prevHits) return nextHits > prevHits;
            return false;
        }
        if (kind === 'nt') {
            if (nextGapIndex !== prevGapIndex) return step > 0 ? nextGapIndex > prevGapIndex : nextGapIndex < prevGapIndex;
            if (nextHits !== prevHits) return nextHits > prevHits;
            return false;
        }
        if (nextHits !== prevHits) return nextHits > prevHits;
        return nextGapIndex > prevGapIndex;
    };

    const resolveThroughEntryFromRefTrip = (refTrip, kind) => {
        const refLineId = getTripLineId(refTrip);
        if (!refLineId) return null;
        if (refLineId === lineId) return null;
        const refLineMeta = railwaysIndex.get(refLineId) || {};
        const refTypeId = toText(refTrip?.y) || 'Unknown';
        const refTypeName = typeName(refTypeId) || refTypeId;
        const refRawTypeColor = typeColor(refTypeId);
        const refTypeColor = isLocalLikeTypeName(refTypeName) ? '#888' : (refRawTypeColor || '#888');
        return {
            kind: toText(kind) || 'nt',
            refLineId,
            refLineName: toText(refLineMeta?.name) || refLineId,
            refLineColor: toText(refLineMeta?.color) || '#888',
            refCompany: toText(refLineMeta?.company) || '',
            refTypeId,
            refTypeName,
            refTypeColor
        };
    };

    for (let i = 0; i < list.length; i += 1) {
        const trip = list[i];
        const day = getTripServiceDay(trip);
        if (serviceDay && day && day !== serviceDay) continue;

        const dir = toText(trip?.d) || 'Unknown';
        const typeId = toText(trip?.y) || 'Unknown';

        const stopIdsOnLine = buildStopStationIds(trip).filter((sid) => stationIndexById.has(sid));
        if (stopIdsOnLine.length < 2) continue;
        const stopIndices = stopIdsOnLine.map((sid) => stationIndexById.get(sid)).filter((x) => Number.isFinite(x));
        if (stopIndices.length < 2) continue;

        const step = inferTripStep(stopIndices);
        if (!dirStepCounts.has(dir)) dirStepCounts.set(dir, { pos: 0, neg: 0 });
        if (step > 0) dirStepCounts.get(dir).pos += 1;
        else dirStepCounts.get(dir).neg += 1;

        const firstIndex = stopIndices[0];
        const secondIndex = stopIndices[1];
        const prevIndex = stopIndices[stopIndices.length - 2];
        const lastIndex = stopIndices[stopIndices.length - 1];
        // Gap indices are "afterStationIndex" in [station0..stationN-1],
        // plus -1 (before first station) and N-1 (after last station).
        // For a trip traveling in the station list order (step>0):
        // - pt is behind the first on-line stop => firstIndex - 1
        // - nt is ahead of the last on-line stop => lastIndex
        // For reverse travel (step<0):
        // - pt is behind the first on-line stop (towards higher indices) => firstIndex
        // - nt is ahead of the last on-line stop (towards lower indices) => lastIndex - 1
        const ptGapIndex = step > 0 ? (firstIndex - 1) : firstIndex;
        const ntGapIndex = step > 0 ? lastIndex : (lastIndex - 1);

        const ptRefs = normalizeArrayLike(trip?.pt).map((x) => toText(x)).filter(Boolean);
        for (const refId of ptRefs) {
            const refTrip = await loadTripByRefId(refId);
            if (!refTrip) continue;
            const entry = resolveThroughEntryFromRefTrip(refTrip, 'pt');
            if (!entry) continue;
            const key = `${entry.kind}||${entry.refLineId}`;
            pushThroughEntry(dir, ptGapIndex, typeId, key, entry);
        }

        const ntRefs = normalizeArrayLike(trip?.nt).map((x) => toText(x)).filter(Boolean);
        for (const refId of ntRefs) {
            const refTrip = await loadTripByRefId(refId);
            if (!refTrip) continue;
            const entry = resolveThroughEntryFromRefTrip(refTrip, 'nt');
            if (!entry) continue;
            const key = `${entry.kind}||${entry.refLineId}`;
            pushThroughEntry(dir, ntGapIndex, typeId, key, entry);
        }

        if (i > 0 && i % 1200 === 0) await yieldToMain();
    }

    const throughTransitions = Array.from(throughByDir.entries()).map(([dir, byGap]) => {
        const bestByTypeAndLine = new Map(); // typeId -> Map<entryKey, { gapIndex, entry, hits }>

        for (const [gapIndex, byType] of byGap.entries()) {
            for (const [typeId, byEntry] of byType.entries()) {
                if (!bestByTypeAndLine.has(typeId)) bestByTypeAndLine.set(typeId, new Map());
                const bestByKey = bestByTypeAndLine.get(typeId);

                for (const [entryKey, entry] of byEntry.entries()) {
                    const hits = Number(entry?._hits || 0);
                    if (!bestByKey.has(entryKey)) {
                        bestByKey.set(entryKey, { gapIndex, entry, hits });
                        continue;
                    }

                    const prev = bestByKey.get(entryKey);
                    const preferNew = shouldPreferGapIndex(
                        dir,
                        entry?.kind,
                        Number(gapIndex),
                        Number(prev?.gapIndex),
                        hits,
                        Number(prev?.hits || 0)
                    );
                    if (preferNew) {
                        bestByKey.set(entryKey, { gapIndex, entry, hits });
                    }
                }
            }
        }

        const pickedByType = new Map(); // typeId -> Map<refLineId, { entryKey, gapIndex, entry, hits }>
        for (const [typeId, bestByKey] of bestByTypeAndLine.entries()) {
            // Further collapse by refLineId: if both pt+nt exist for the same line,
            // prefer nt ("go to") to avoid duplicate branches for one junction.
            const bestByRefLine = new Map(); // refLineId -> { entryKey, gapIndex, entry, hits }
            for (const [entryKey, picked] of bestByKey.entries()) {
                const refLineId = toText(picked?.entry?.refLineId) || '';
                if (!refLineId) continue;

                if (!bestByRefLine.has(refLineId)) {
                    bestByRefLine.set(refLineId, { entryKey, ...picked });
                    continue;
                }

                const prev = bestByRefLine.get(refLineId);
                const prevKind = toText(prev?.entry?.kind);
                const nextKind = toText(picked?.entry?.kind);

                if (prevKind !== nextKind) {
                    // nt beats pt
                    if (nextKind === 'nt') bestByRefLine.set(refLineId, { entryKey, ...picked });
                    continue;
                }

                const preferNew = shouldPreferGapIndex(
                    dir,
                    picked?.entry?.kind,
                    Number(picked?.gapIndex),
                    Number(prev?.gapIndex),
                    Number(picked?.hits || 0),
                    Number(prev?.hits || 0)
                );
                if (preferNew) bestByRefLine.set(refLineId, { entryKey, ...picked });
            }

            pickedByType.set(typeId, bestByRefLine);
        }

        // Global collapse: one refLineId should use one junction gap per direction
        // (avoid multiple branch rows for the same target line).
        const bestGapByRefLine = new Map(); // refLineId -> { gapIndex, kind, hits }
        for (const bestByRefLine of pickedByType.values()) {
            for (const [refLineId, picked] of bestByRefLine.entries()) {
                const nextGapIndex = Number(picked?.gapIndex);
                if (!Number.isFinite(nextGapIndex)) continue;
                const nextHits = Number(picked?.hits || 0);
                const nextKind = toText(picked?.entry?.kind);
                if (!bestGapByRefLine.has(refLineId)) {
                    bestGapByRefLine.set(refLineId, {
                        gapIndex: nextGapIndex,
                        kind: nextKind,
                        hits: nextHits
                    });
                    continue;
                }

                const prev = bestGapByRefLine.get(refLineId);
                const prevKind = toText(prev?.kind);
                if (prevKind !== nextKind) {
                    if (nextKind === 'nt') {
                        bestGapByRefLine.set(refLineId, {
                            gapIndex: nextGapIndex,
                            kind: nextKind,
                            hits: nextHits
                        });
                    }
                    continue;
                }

                const preferNew = shouldPreferGapIndex(
                    dir,
                    nextKind,
                    nextGapIndex,
                    Number(prev?.gapIndex),
                    nextHits,
                    Number(prev?.hits || 0)
                );
                if (preferNew) {
                    bestGapByRefLine.set(refLineId, {
                        gapIndex: nextGapIndex,
                        kind: toText(picked?.entry?.kind),
                        hits: nextHits
                    });
                }
            }
        }

        const collapsedByGap = new Map(); // afterStationIndex -> Map<typeId, Map<entryKey, entry>>
        for (const [typeId, bestByRefLine] of pickedByType.entries()) {
            for (const [refLineId, picked] of bestByRefLine.entries()) {
                const forcedGap = Number(bestGapByRefLine.get(refLineId)?.gapIndex);
                const gapIndex = Number.isFinite(forcedGap)
                    ? forcedGap
                    : Number(picked?.gapIndex);
                if (!Number.isFinite(gapIndex)) continue;

                if (!collapsedByGap.has(gapIndex)) collapsedByGap.set(gapIndex, new Map());
                const byType = collapsedByGap.get(gapIndex);
                if (!byType.has(typeId)) byType.set(typeId, new Map());
                const byEntry = byType.get(typeId);

                const cleanEntry = { ...(picked?.entry || {}) };
                delete cleanEntry._hits;
                const entryKey = `${toText(cleanEntry?.kind) || 'nt'}||${refLineId}`;
                byEntry.set(entryKey, cleanEntry);
            }
        }

        const rows = Array.from(collapsedByGap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([afterStationIndex, byType]) => {
                const byTypeRows = Array.from(byType.entries()).map(([typeId, byEntry]) => ({
                    typeId,
                    targets: Array.from(byEntry.values())
                }));
                return { afterStationIndex, byType: byTypeRows };
            });

        return { dir, rows };
    });

    const basePatterns = [];
    for (const [dir, byType] of byDirType.entries()) {
        const trainTypes = [];
        for (const [typeId, byPattern] of byType.entries()) {
            const patterns = Array.from(byPattern.values()).map((p) => ({
                ...p,
                serviceDays: Array.from(p.serviceDays || []),
            }));
            patterns.sort((a, b) => (b.tripCount || 0) - (a.tripCount || 0));
            trainTypes.push({
                typeId,
                typeName: typeName(typeId),
                patterns
            });
        }
        trainTypes.sort((a, b) => a.typeName.localeCompare(b.typeName, 'zh-Hans'));
        basePatterns.push({ dir, trainTypes });
    }
    basePatterns.sort((a, b) => a.dir.localeCompare(b.dir));

    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        selectedLine: {
            lineId,
            lineName: toText(lineMeta?.name) || lineId,
            lineColor: toText(lineMeta?.color) || '',
            company: toText(lineMeta?.company) || ''
        },
        lineStations: {
            stationIds: lineStationIds.slice(),
            stationNames: lineStationIds.map(stationName)
        },
        basePatterns,
        throughTransitions,
        trainTypeMeta: {
            // Expose raw mapping for UI (color may be overridden for Local)
            typeNameById: Object.fromEntries(Array.from(trainTypesIndex.entries())),
            typeColorById: Object.fromEntries(Array.from(trainTypeColorIndex.entries()))
        }
    };

    return payload;
};

const isLocalLikeTypeName = (name) => {
    const n = toText(name);
    if (!n) return false;
    return n.includes('普通') || n.includes('各停') || n.toLowerCase() === 'local' || n.includes('各駅停車');
};

/**
 * Computes UI-friendly “one pattern per type per direction” data.
 * - Only the selected line (no pt/nt)
 * - Aggregates all same-type patterns per direction (union stops)
 */
export async function computeLineStopDiagramData(lineId, {
    serviceDay,
    minTripsPerDay = 0
} = {}) {
    const raw = await computeLineTrainTypePatterns(lineId, { serviceDay });
    if (!raw) return null;

    const minTrips = Number(minTripsPerDay);
    const threshold = Number.isFinite(minTrips) ? minTrips : 0;

    const typeColorById = raw?.trainTypeMeta?.typeColorById || {};
    const throughRowsByDir = new Map();
    for (const block of Array.isArray(raw?.throughTransitions) ? raw.throughTransitions : []) {
        const dir = toText(block?.dir) || 'Unknown';
        const rows = Array.isArray(block?.rows) ? block.rows : [];
        throughRowsByDir.set(dir, rows);
    }

    const directions = (Array.isArray(raw?.basePatterns) ? raw.basePatterns : []).map((dirBlock) => {
        const dir = toText(dirBlock?.dir) || 'Unknown';
        const typesOut = [];

        for (const t of Array.isArray(dirBlock?.trainTypes) ? dirBlock.trainTypes : []) {
            const typeId = toText(t?.typeId) || 'Unknown';
            const typeName = toText(t?.typeName) || typeId;
            const patterns = Array.isArray(t?.patterns) ? t.patterns : [];
            const totalTrips = patterns.reduce((sum, p) => sum + (Number(p?.tripCount) || 0), 0);
            if (threshold > 0 && totalTrips < threshold) continue;

            const lineStationIds = Array.isArray(raw?.lineStations?.stationIds) ? raw.lineStations.stationIds : [];
            const maskLen = lineStationIds.length || Math.max(0, ...patterns.map((p) => (Array.isArray(p?.stopMask) ? p.stopMask.length : 0)));
            if (!maskLen) continue;

            const unionMask = new Array(maskLen).fill(false);
            for (const p of patterns) {
                const mask = Array.isArray(p?.stopMask) ? p.stopMask : [];
                for (let i = 0; i < maskLen; i += 1) {
                    if (mask[i]) unionMask[i] = true;
                }
            }

            const stopStationIds = [];
            const stopStationNames = [];
            for (let i = 0; i < maskLen; i += 1) {
                if (!unionMask[i]) continue;
                const sid = toText(lineStationIds[i]);
                if (!sid) continue;
                stopStationIds.push(sid);
                stopStationNames.push(toText(raw?.lineStations?.stationNames?.[i]) || sid);
            }

            const rawColor = toText(typeColorById[typeId] || '');
            const color = isLocalLikeTypeName(typeName) ? '#888' : (rawColor || '#888');

            typesOut.push({
                typeId,
                typeName,
                color,
                totalTrips,
                pattern: {
                    tripCount: totalTrips,
                    stopMask: unionMask,
                    stopStationIds,
                    stopStationNames
                }
            });
        }

        // Apply the same threshold to throughRows so low-frequency types don't
        // create through rows/labels after they are filtered out.
        const allowedTypeIds = new Set(typesOut.map((t) => toText(t?.typeId) || 'Unknown'));
        const rawThroughRows = Array.isArray(throughRowsByDir.get(dir)) ? throughRowsByDir.get(dir) : [];
        const filteredThroughRows = rawThroughRows
            .map((row) => {
                const afterStationIndex = Number(row?.afterStationIndex);
                const byType = (Array.isArray(row?.byType) ? row.byType : [])
                    .filter((bt) => allowedTypeIds.has(toText(bt?.typeId) || 'Unknown'))
                    .map((bt) => ({
                        typeId: toText(bt?.typeId) || 'Unknown',
                        targets: Array.isArray(bt?.targets) ? bt.targets : []
                    }));
                return { afterStationIndex, byType };
            })
            .filter((row) => Array.isArray(row?.byType) && row.byType.length > 0);

        return {
            dir,
            types: typesOut,
            throughRows: filteredThroughRows
        };
    });

    return {
        schemaVersion: raw.schemaVersion,
        generatedAt: raw.generatedAt,
        serviceDay: toText(serviceDay) || null,
        selectedLine: raw.selectedLine,
        lineStations: raw.lineStations,
        directions
    };
}
