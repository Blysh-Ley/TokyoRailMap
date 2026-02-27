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

        return { dir, types: typesOut };
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
