import { getLineMetaByIds } from './search.js';

const SERVICE_DAY_BOUNDARY_HOUR = 3;
const INF_TIME = Number.POSITIVE_INFINITY;
const MIN_TRANSFER_MS = 5 * 60 * 1000;

export const normalizeText = (v) => String(v ?? '').trim();

const parseTripServiceDayFromId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    if (m?.[1]) return m[1];
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

export const getServiceDayStartMs = (now = new Date()) => {
    const d = new Date(now.getTime());
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    if (d.getTime() < candidate.getTime()) candidate.setDate(candidate.getDate() - 1);
    return candidate.getTime();
};

export const normalizeHHMM = (value) => {
    const s = normalizeText(value);
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return '';
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const hhmmToOffsetMinutes = (hhmm) => {
    const s = normalizeHHMM(hhmm);
    if (!s) return null;
    const [h, m] = s.split(':').map((x) => Number(x));
    let offset = h * 60 + m - SERVICE_DAY_BOUNDARY_HOUR * 60;
    if (offset < 0) offset += 24 * 60;
    return offset;
};

const getTripBaseKey = (tripLike) => {
    const t = normalizeText(tripLike?.t || '');
    if (t) return t;
    const id = normalizeText(tripLike?.id || tripLike?.tripId || '');
    if (!id) return '';
    return id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
};

const normalizeRefArray = (value) => {
    if (Array.isArray(value)) return value.map((x) => normalizeText(x)).filter(Boolean);
    const s = normalizeText(value);
    return s ? [s] : [];
};

export const toHHMM = (timeMs) => {
    if (!Number.isFinite(timeMs)) return '--:--';
    const d = new Date(timeMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const formatDuration = (durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return '用时--';
    const totalMin = Math.round(durationMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `用时${h}小时${m}分钟`;
};

const plannerState = {
    staticReady: false,
    staticLoadingPromise: null,
    groupByStop: new Map(),
    routeIdsByStop: new Map(),
    typeMetaById: new Map(),
    stationNameById: new Map(),
    stationCoordById: new Map(),
    lineMetaById: new Map(),
    lineTripsCache: new Map(),
    tripByIdByDay: new Map(),
    mergedThroughRootByTripIdByDay: new Map(),
    mergedThroughByRootIdByDay: new Map()
};

const getDayTripMap = (serviceDay) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!plannerState.tripByIdByDay.has(day)) plannerState.tripByIdByDay.set(day, new Map());
    return plannerState.tripByIdByDay.get(day);
};

const getDayMergedThroughRootMap = (serviceDay) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!plannerState.mergedThroughRootByTripIdByDay.has(day)) plannerState.mergedThroughRootByTripIdByDay.set(day, new Map());
    return plannerState.mergedThroughRootByTripIdByDay.get(day);
};

const getTripCanonicalId = (trip) => normalizeText(trip?.rawTripId || trip?.tripId || '');

const getTripFileNameByLineId = (lineId) => {
    const id = normalizeText(lineId);
    return id ? `${id}.json` : '';
};

const buildThroughChainFromTrip = async ({ seedTrip, serviceDay, serviceDayStartMs }) => {
    const chain = [];
    const seen = new Set();
    let current = seedTrip;
    let throughRootTripId = '';

    for (let hop = 0; hop < 128; hop += 1) {
        if (!current) break;
        const currentId = getTripCanonicalId(current);
        if (!currentId || seen.has(currentId)) break;
        seen.add(currentId);
        if (!throughRootTripId) throughRootTripId = currentId;

        chain.push({
            ...current,
            throughRootTripId,
            isThroughContinuation: hop > 0,
            timetableFile: getTripFileNameByLineId(current?.lineId)
        });

        const refs = normalizeRefArray(current?.ntRefs);
        if (!refs.length) break;

        let nextTrip = null;
        for (const refId of refs) {
            // 关键：直通链条动态按需加载，必须 await，确保同一轮次内原子完成。
            const candidate = await getParsedTripByTripId({ tripId: refId, serviceDay });
            if (!candidate) continue;

            const currTimes = getTripStartEndTimes(current, serviceDayStartMs);
            const nextTimes = getTripStartEndTimes(candidate, serviceDayStartMs);
            if (!currTimes || !nextTimes) continue;
            if (!isSamePhysicalStop(currTimes.lastStopId, nextTimes.firstStopId)) continue;
            if (Number.isFinite(currTimes.endArrMs) && Number.isFinite(nextTimes.startDepMs) && nextTimes.startDepMs < currTimes.endArrMs) {
                continue;
            }

            nextTrip = candidate;
            break;
        }

        if (!nextTrip) break;
        current = nextTrip;
    }

    const rootMap = getDayMergedThroughRootMap(serviceDay);
    for (const item of chain) {
        const id = getTripCanonicalId(item);
        if (id && throughRootTripId) rootMap.set(id, throughRootTripId);
    }

    return { throughRootTripId, chainTrips: chain };
};

const extractLineIdFromTripId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/^(.*)\.[^.]+\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    return normalizeText(m?.[1] || '');
};

const isSamePhysicalStop = (aStopId, bStopId) => {
    const a = normalizeText(aStopId);
    const b = normalizeText(bStopId);
    if (!a || !b) return false;
    if (a === b) return true;
    const ga = plannerState.groupByStop.get(a);
    if (ga instanceof Set && ga.has(b)) return true;
    const gb = plannerState.groupByStop.get(b);
    return gb instanceof Set ? gb.has(a) : false;
};

export const isThroughLegPairByMeta = ({ currentLeg, nextLeg }) => {
    if (!currentLeg || !nextLeg) return false;

    const currId = normalizeText(currentLeg?.rawTripId || currentLeg?.tripId || '');
    const nextId = normalizeText(nextLeg?.rawTripId || nextLeg?.tripId || '');
    const currNt = new Set(normalizeRefArray(currentLeg?.ntRefs));
    const currPt = new Set(normalizeRefArray(currentLeg?.ptRefs));
    const nextPt = new Set(normalizeRefArray(nextLeg?.ptRefs));
    const nextNt = new Set(normalizeRefArray(nextLeg?.ntRefs));

    const linkedByRef =
        (currId && nextPt.has(currId)) ||
        (nextId && currNt.has(nextId)) ||
        (currId && nextNt.has(currId)) ||
        (nextId && currPt.has(nextId));

    const currBase = normalizeText(currentLeg?.baseTripKey || '');
    const nextBase = normalizeText(nextLeg?.baseTripKey || '');
    const linkedByBaseTrip = currBase && currBase === nextBase;

    return isSamePhysicalStop(currentLeg?.toStop, nextLeg?.fromStop) && (linkedByRef || linkedByBaseTrip);
};

const toRadians = (deg) => (Number(deg) * Math.PI) / 180;

const distanceMeters = (coordA, coordB) => {
    if (!Array.isArray(coordA) || !Array.isArray(coordB) || coordA.length < 2 || coordB.length < 2) return INF_TIME;
    const lng1 = Number(coordA[0]);
    const lat1 = Number(coordA[1]);
    const lng2 = Number(coordB[0]);
    const lat2 = Number(coordB[1]);
    if (![lng1, lat1, lng2, lat2].every(Number.isFinite)) return INF_TIME;
    const R = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const ensurePlannerStaticData = async () => {
    if (plannerState.staticReady) return;
    if (plannerState.staticLoadingPromise) return plannerState.staticLoadingPromise;

    plannerState.staticLoadingPromise = (async () => {
        const [railwaysResp, groupsResp, trainTypesResp, stationsResp] = await Promise.all([
            fetch('./data/railways.json'),
            fetch('./data/station-groups.json'),
            fetch('./data/train-types.json'),
            fetch('./data/stations.json')
        ]);

        const railways = railwaysResp.ok ? await railwaysResp.json() : [];
        const groups = groupsResp.ok ? await groupsResp.json() : [];
        const trainTypes = trainTypesResp.ok ? await trainTypesResp.json() : [];

        const groupByStop = new Map();
        for (const group of Array.isArray(groups) ? groups : []) {
            if (!Array.isArray(group)) continue;
            const ids = new Set();
            for (const chunk of group) {
                if (!Array.isArray(chunk)) continue;
                for (const sid of chunk) {
                    const id = normalizeText(sid);
                    if (id) ids.add(id);
                }
            }
            if (!ids.size) continue;
            const fixed = new Set(Array.from(ids));
            for (const id of fixed) groupByStop.set(id, fixed);
        }

        const routeIdsByStop = new Map();
        for (const route of Array.isArray(railways) ? railways : []) {
            const routeId = normalizeText(route?.id);
            if (!routeId) continue;
            const stations = Array.isArray(route?.stations) ? route.stations : [];
            for (const sidRaw of stations) {
                const sid = normalizeText(sidRaw);
                if (!sid) continue;
                if (!routeIdsByStop.has(sid)) routeIdsByStop.set(sid, new Set());
                routeIdsByStop.get(sid).add(routeId);
            }
        }

        const typeMetaById = new Map();
        for (const item of Array.isArray(trainTypes) ? trainTypes : []) {
            const id = normalizeText(item?.id);
            if (!id) continue;
            const title = item?.title || {};
            const name =
                normalizeText(title?.['zh-Hans']) ||
                normalizeText(title?.zh) ||
                normalizeText(title?.ja) ||
                normalizeText(title?.en) ||
                id;
            const color = normalizeText(title?.color || '');
            typeMetaById.set(id, { id, name, color: color || null });
        }

        const stationNameById = new Map();
        const stationCoordById = new Map();
        const stationList = stationsResp.ok ? await stationsResp.json() : [];
        for (const item of Array.isArray(stationList) ? stationList : []) {
            const sid = normalizeText(item?.id);
            if (!sid) continue;
            const title = item?.title || {};
            const name =
                normalizeText(title?.['zh-Hans']) ||
                normalizeText(title?.zh) ||
                normalizeText(title?.ja) ||
                normalizeText(title?.en) ||
                sid;
            stationNameById.set(sid, name);

            const coord = Array.isArray(item?.coord) ? item.coord : [];
            if (coord.length >= 2 && Number.isFinite(Number(coord[0])) && Number.isFinite(Number(coord[1]))) {
                stationCoordById.set(sid, [Number(coord[0]), Number(coord[1])]);
            }
        }

        plannerState.groupByStop = groupByStop;
        plannerState.routeIdsByStop = routeIdsByStop;
        plannerState.typeMetaById = typeMetaById;
        plannerState.stationNameById = stationNameById;
        plannerState.stationCoordById = stationCoordById;
        plannerState.staticReady = true;
    })();

    return plannerState.staticLoadingPromise;
};

export const getGroupStops = (stationId) => {
    const id = normalizeText(stationId);
    if (!id) return new Set();
    const group = plannerState.groupByStop.get(id);
    return group instanceof Set && group.size ? new Set(group) : new Set([id]);
};

export const filterNearbyStops = (anchorStopId, stops, maxMeters) => {
    const anchor = normalizeText(anchorStopId);
    if (!anchor || !(stops instanceof Set) || !stops.size) return stops;
    const anchorCoord = plannerState.stationCoordById.get(anchor);
    if (!Array.isArray(anchorCoord) || anchorCoord.length < 2) return stops;

    const out = new Set();
    for (const sid of stops) {
        const coord = plannerState.stationCoordById.get(sid);
        const dist = distanceMeters(anchorCoord, coord);
        if (!Number.isFinite(dist)) continue;
        if (dist <= maxMeters) out.add(sid);
    }
    if (!out.size) out.add(anchor);
    return out;
};

const getTransferPenaltyMs = (fromStopId, toStopId) => {
    const a = normalizeText(fromStopId);
    const b = normalizeText(toStopId);
    if (!a || !b || a === b) return 0;

    const coordA = plannerState.stationCoordById.get(a);
    const coordB = plannerState.stationCoordById.get(b);
    const dist = distanceMeters(coordA, coordB);
    if (!Number.isFinite(dist) || dist <= 1) return 3 * 60 * 1000;

    const extra = Math.ceil(dist / 100) * 2;
    return (3 + extra) * 60 * 1000;
};

export const sameSet = (a, b) => {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
};

export const getStationNameById = (stationId) => {
    const id = normalizeText(stationId);
    if (!id) return '';
    return normalizeText(plannerState.stationNameById.get(id) || id);
};

export const getLineMeta = async (lineId) => {
    const id = normalizeText(lineId);
    if (!id) return { id: '', name: '', color: null };
    if (plannerState.lineMetaById.has(id)) return plannerState.lineMetaById.get(id);
    const list = await getLineMetaByIds([id]);
    const hit = Array.isArray(list) && list.length ? list[0] : null;
    const meta = {
        id,
        name: normalizeText(hit?.name || id),
        color: normalizeText(hit?.color || '') || null
    };
    plannerState.lineMetaById.set(id, meta);
    return meta;
};

const buildLineDescriptorText = (lineMeta) => {
    const id = normalizeText(lineMeta?.id || '');
    const rawName = normalizeText(lineMeta?.name || id);
    if (!id) return rawName;

    const company = normalizeText(id.split('.')[0] || '');
    const logoMap = window?.TokyoRailCompanyLogoMap || null;
    const abb = normalizeText(logoMap?.[company]?.abb || logoMap?.[company]?.zh || company);
    if (!abb) return rawName;

    let lineName = rawName;
    if (lineName.startsWith(abb)) lineName = normalizeText(lineName.slice(abb.length));
    return normalizeText(`${abb}${lineName}`) || rawName;
};

const loadTripsForLineAndDay = async ({ lineId, serviceDay }) => {
    const line = normalizeText(lineId);
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!line) return [];
    const cacheKey = `${line}||${day}`;
    if (plannerState.lineTripsCache.has(cacheKey)) return plannerState.lineTripsCache.get(cacheKey);

    const cache = window?.TokyoRailTimetableCache;
    if (!cache) {
        plannerState.lineTripsCache.set(cacheKey, []);
        return [];
    }

    const existing = cache.get(line);
    if (!existing) await cache.preloadByLineIds([line]);
    const rawData = cache.get(line);
    const list = Array.isArray(rawData) ? rawData : [];

    const parsedTrips = [];
    const dayTripMap = getDayTripMap(day);
    for (const trip of list) {
        const tripId = normalizeText(trip?.id || '');
        const tripServiceDay = parseTripServiceDayFromId(tripId);
        if (tripServiceDay && tripServiceDay !== day) continue;

        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        if (tt.length < 2) continue;

        const stops = [];
        for (const row of tt) {
            const stopId = normalizeText(row?.s);
            if (!stopId) continue;
            const arrOffset = hhmmToOffsetMinutes(row?.a);
            const depOffset = hhmmToOffsetMinutes(row?.d);
            let arrMin = Number.isFinite(arrOffset) ? arrOffset : null;
            let depMin = Number.isFinite(depOffset) ? depOffset : null;
            if (arrMin == null && depMin == null) continue;
            if (arrMin == null) arrMin = depMin;
            if (depMin == null) depMin = arrMin;
            stops.push({ stopId, arrMin, depMin });
        }

        if (stops.length < 2) continue;

        const typeId = normalizeText(trip?.y || '');
        const typeMeta = plannerState.typeMetaById.get(typeId) || null;
        parsedTrips.push({
            tripId: tripId || normalizeText(trip?.t || ''),
            rawTripId: tripId || normalizeText(trip?.id || ''),
            baseTripKey: getTripBaseKey(trip),
            lineId: line,
            timetableFile: getTripFileNameByLineId(line),
            d: normalizeText(trip?.d || ''),
            typeId,
            typeName: normalizeText(typeMeta?.name || typeId || '普通'),
            typeColor: normalizeText(typeMeta?.color || '') || null,
            ptRefs: normalizeRefArray(trip?.pt),
            ntRefs: normalizeRefArray(trip?.nt),
            stops
        });

        const parsed = parsedTrips[parsedTrips.length - 1];
        if (parsed?.tripId) dayTripMap.set(parsed.tripId, parsed);
        if (parsed?.rawTripId) dayTripMap.set(parsed.rawTripId, parsed);
        if (parsed?.baseTripKey && !dayTripMap.has(parsed.baseTripKey)) dayTripMap.set(parsed.baseTripKey, parsed);
    }

    parsedTrips.sort((a, b) => {
        const ta = Number.isFinite(a?.stops?.[0]?.depMin) ? a.stops[0].depMin : INF_TIME;
        const tb = Number.isFinite(b?.stops?.[0]?.depMin) ? b.stops[0].depMin : INF_TIME;
        return ta - tb;
    });

    plannerState.lineTripsCache.set(cacheKey, parsedTrips);
    return parsedTrips;
};

const getParsedTripByTripId = async ({ tripId, serviceDay }) => {
    const key = normalizeText(tripId);
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!key) return null;

    const dayMap = getDayTripMap(day);
    if (dayMap.has(key)) return dayMap.get(key) || null;

    const lineId = extractLineIdFromTripId(key);
    if (lineId) {
        await loadTripsForLineAndDay({ lineId, serviceDay: day });
        if (dayMap.has(key)) return dayMap.get(key) || null;
    }

    const base = getTripBaseKey({ id: key, tripId: key });
    if (base && dayMap.has(base)) return dayMap.get(base) || null;
    return null;
};

const getTripStartEndTimes = (trip, serviceDayStartMs) => {
    const stops = Array.isArray(trip?.stops) ? trip.stops : [];
    if (!stops.length) return null;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const startDepMs = Number.isFinite(first?.depMin) ? serviceDayStartMs + first.depMin * 60000 : null;
    const endArrMs = Number.isFinite(last?.arrMin) ? serviceDayStartMs + last.arrMin * 60000 : null;
    return {
        firstStopId: normalizeText(first?.stopId),
        lastStopId: normalizeText(last?.stopId),
        startDepMs,
        endArrMs
    };
};

const rideTripFromBoardRaptor = ({ trip, lineId, boardIndex, boardStopId, boardDepMs, serviceDayStartMs, roundArr, roundParent, improvedStops }) => {
    let changed = false;
    if (!trip || !Array.isArray(trip.stops) || trip.stops.length < 2) return changed;

    const start = Number.isFinite(boardIndex) ? Number(boardIndex) : -1;
    if (start < 0 || start >= trip.stops.length) return changed;

    for (let i = start + 1; i < trip.stops.length; i += 1) {
        const stop = trip.stops[i];
        const stopId = normalizeText(stop?.stopId);
        if (!stopId || stopId === boardStopId) continue;
        const arrMs = Number.isFinite(stop?.arrMin) ? serviceDayStartMs + stop.arrMin * 60000 : null;
        if (!Number.isFinite(arrMs)) continue;

        const best = roundArr.get(stopId);
        if (!Number.isFinite(best) || arrMs < best) {
            roundArr.set(stopId, arrMs);
            roundParent.set(stopId, {
                kind: 'ride',
                lineId,
                throughLineIds: Array.isArray(trip?.throughLineIds)
                    ? trip.throughLineIds.map((x) => normalizeText(x)).filter(Boolean)
                    : [],
                throughTripIds: Array.isArray(trip?.throughTripIds)
                    ? trip.throughTripIds.map((x) => normalizeText(x)).filter(Boolean)
                    : [],
                tripId: trip.tripId,
                rawTripId: trip.rawTripId,
                tripFile: normalizeText(trip?.timetableFile || `${lineId}.json`),
                baseTripKey: trip.baseTripKey,
                ptRefs: trip.ptRefs,
                ntRefs: trip.ntRefs,
                throughRootTripId: normalizeText(trip?.throughRootTripId || trip?.rawTripId || trip?.tripId || ''),
                isThroughContinuation: trip?.isThroughContinuation === true,
                typeId: trip.typeId,
                typeName: trip.typeName,
                typeColor: trip.typeColor,
                fromStop: boardStopId,
                toStop: stopId,
                boardIndex: start,
                alightIndex: i,
                depMs: boardDepMs,
                arrMs
            });
            improvedStops.add(stopId);
            changed = true;
        }
    }

    return changed;
};

const lineSetFromMarkedStops = (markedStops) => {
    const out = new Set();
    for (const stopId of markedStops) {
        const routes = plannerState.routeIdsByStop.get(stopId);
        if (!(routes instanceof Set)) continue;
        for (const rid of routes) out.add(rid);
    }
    return out;
};

const findBoardingOnChain = ({ chainTrips, prevRoundEarliestArrivals, minBoardSlackMs, serviceDayStartMs }) => {
    let activeBoard = null;
    let activeTripId = '';
    let activeBoardDepMs = INF_TIME;
    let boardStopPrevArrMs = INF_TIME;

    for (let seg = 0; seg < chainTrips.length; seg += 1) {
        const trip = chainTrips[seg];
        const tripId = normalizeText(trip?.rawTripId || trip?.tripId || '');
        const stops = Array.isArray(trip?.stops) ? trip.stops : [];
        for (let i = 0; i < stops.length; i += 1) {
            const stop = stops[i];
            const stopId = normalizeText(stop?.stopId);
            if (!stopId) continue;
            const depMs = Number.isFinite(stop?.depMin) ? serviceDayStartMs + stop.depMin * 60000 : null;
            if (!Number.isFinite(depMs)) continue;
            const prevArrMs = prevRoundEarliestArrivals.get(stopId);
            if (!Number.isFinite(prevArrMs)) continue;
            if (depMs < prevArrMs + minBoardSlackMs) continue;

            if (!activeBoard || depMs < activeBoardDepMs) {
                activeBoard = { segmentIndex: seg, boardIndex: i, boardStopId: stopId, boardDepMs: depMs };
                activeTripId = tripId;
                activeBoardDepMs = depMs;
                boardStopPrevArrMs = prevArrMs;
                continue;
            }

            if (activeBoard && tripId && tripId === activeTripId && prevArrMs <= boardStopPrevArrMs) {
                activeBoard = { segmentIndex: seg, boardIndex: i, boardStopId: stopId, boardDepMs: depMs };
                boardStopPrevArrMs = prevArrMs;
            }
        }
    }

    return activeBoard;
};

const relaxChainFromBoardRaptor = ({ chainTrips, throughRootTripId, startSegmentIndex, startBoardIndex, startBoardStopId, startBoardDepMs, serviceDayStartMs, roundArr, roundParent, improvedStops }) => {
    
    // 核心修复 1：锁定乘客最初的物理上车点和时间，贯穿整个直通链
    const originalBoardStopId = normalizeText(startBoardStopId || '');
    const originalBoardDepMs = Number.isFinite(startBoardDepMs) ? Number(startBoardDepMs) : null;
    const throughLineIds = [];
    const throughTripIds = [];
    for (let seg = startSegmentIndex; seg < chainTrips.length; seg += 1) {
        const tripId = normalizeText(chainTrips?.[seg]?.rawTripId || chainTrips?.[seg]?.tripId || '');
        if (tripId) throughTripIds.push(tripId);
        const lineId = normalizeText(chainTrips?.[seg]?.lineId || '');
        if (!lineId) continue;
        if (!throughLineIds.length || throughLineIds[throughLineIds.length - 1] !== lineId) {
            throughLineIds.push(lineId);
        }
    }

    if (!originalBoardStopId || !Number.isFinite(originalBoardDepMs)) return;

    for (let seg = startSegmentIndex; seg < chainTrips.length; seg += 1) {
        const trip = chainTrips[seg];
        if (!trip) continue;

        const isThroughContinuation = seg > startSegmentIndex;
        
        // 核心修复 2：决定当前这段 Trip 的数组遍历起点
        // 如果是第一段，从乘客实际上车点对应的 index 开始；如果是直通后续段，直接从数组第 0 个站（边界站）开始更新
        const tripLoopStartIndex = isThroughContinuation ? 0 : (Number.isFinite(startBoardIndex) ? Number(startBoardIndex) : 0);

        rideTripFromBoardRaptor({
            trip: {
                ...trip,
                throughRootTripId,
                isThroughContinuation,
                throughLineIds,
                throughTripIds,
                timetableFile: normalizeText(trip?.timetableFile || getTripFileNameByLineId(trip?.lineId))
            },
            lineId: normalizeText(trip?.lineId || ''),
            
            // 传给底层的循环起始索引
            tripStartIndex: tripLoopStartIndex, 
            boardIndex: tripLoopStartIndex,     // 兼容保留
            
            // 永远传入最初的上车点，欺骗底层逻辑这是一次完整的单次乘车
            boardStopId: originalBoardStopId, 
            boardDepMs: originalBoardDepMs,   
            
            serviceDayStartMs,
            roundArr,
            roundParent,
            improvedStops
        });
    }
};

const scanRoundRaptor = async ({ prevArr, markedStops, serviceDay, serviceDayStartMs, roundIndex }) => {
    const roundArr = new Map(prevArr);
    const roundParent = new Map();
    const improvedStops = new Set();

    const minBoardSlackMs = roundIndex > 1 ? MIN_TRANSFER_MS : 0;
    const routeIds = lineSetFromMarkedStops(markedStops);
    if (!routeIds.size) return { roundArr, roundParent, improvedStops };

    const routeArr = Array.from(routeIds);
    const routeTripsPairs = await Promise.all(
        routeArr.map(async (lineId) => ({ lineId, trips: await loadTripsForLineAndDay({ lineId, serviceDay }) }))
    );

    for (const { lineId, trips } of routeTripsPairs) {
        if (!Array.isArray(trips) || !trips.length) continue;

        for (const trip of trips) {
            const merged = await buildThroughChainFromTrip({
                seedTrip: trip,
                serviceDay,
                serviceDayStartMs
            });
            if (!merged || !Array.isArray(merged.chainTrips) || !merged.chainTrips.length) continue;

            const board = findBoardingOnChain({
                chainTrips: merged.chainTrips,
                prevRoundEarliestArrivals: prevArr,
                minBoardSlackMs,
                serviceDayStartMs
            });
            if (!board) continue;

            // 关键约束 1 + 2：
            // 一旦上车，整条 nt 直通链必须在同一 round 扫描到底；
            // 扫描过程中绝不因已有更优到达时间而中断，仅做逐站松弛更新。
            relaxChainFromBoardRaptor({
                chainTrips: merged.chainTrips,
                throughRootTripId: normalizeText(merged?.throughRootTripId || ''),
                startSegmentIndex: board.segmentIndex,
                startBoardIndex: board.boardIndex,
                startBoardStopId: board.boardStopId,
                startBoardDepMs: board.boardDepMs,
                serviceDayStartMs,
                roundArr,
                roundParent,
                improvedStops
            });
        }
    }

    return { roundArr, roundParent, improvedStops };
};

const applyRealTransfersForNextRound = ({ roundArr, roundParent, improvedStops }) => {
    const transferFromStops = Array.from(improvedStops);
    for (const fromStop of transferFromStops) {
        const fromTime = roundArr.get(fromStop);
        const group = plannerState.groupByStop.get(fromStop);
        if (!Number.isFinite(fromTime) || !(group instanceof Set)) continue;

        for (const toStop of group) {
            const penalty = Math.max(MIN_TRANSFER_MS, getTransferPenaltyMs(fromStop, toStop));
            const cand = fromTime + penalty;
            const old = roundArr.get(toStop);
            if (Number.isFinite(old) && old <= cand) continue;

            roundArr.set(toStop, cand);
            roundParent.set(toStop, {
                kind: 'transfer',
                fromStop,
                toStop,
                walkMs: penalty
            });
            improvedStops.add(toStop);
        }
    }
};

const runRaptorSearch = async ({ sourceStops, destinationStops, departureMs, serviceDay, maxRounds = 7 }) => {
    const arrivals = [new Map()];
    const parents = [new Map()];
    const serviceDayStartMs = getServiceDayStartMs(new Date(departureMs));

    const initMarked = new Set();
    for (const stopId of sourceStops) {
        arrivals[0].set(stopId, departureMs);
        initMarked.add(stopId);
    }

    let markedStops = initMarked;
    for (let round = 1; round <= maxRounds; round += 1) {
        const prevArr = arrivals[round - 1] || new Map();
        const { roundArr, roundParent, improvedStops } = await scanRoundRaptor({
            prevArr,
            markedStops,
            serviceDay,
            serviceDayStartMs,
            roundIndex: round
        });

        // 关键约束 4：仅在本 round 所有列车（含直通链）扫描完成后，才做站内换乘扩散。
        applyRealTransfersForNextRound({ roundArr, roundParent, improvedStops });

        arrivals[round] = roundArr;
        parents[round] = roundParent;
        markedStops = improvedStops;
        if (!markedStops.size) break;
    }

    const bestByRound = [];
    for (let round = 1; round < arrivals.length; round += 1) {
        const arr = arrivals[round];
        let bestStop = '';
        let bestTime = INF_TIME;
        for (const destStop of destinationStops) {
            const t = arr.get(destStop);
            if (Number.isFinite(t) && t < bestTime) {
                bestTime = t;
                bestStop = destStop;
            }
        }
        if (Number.isFinite(bestTime)) bestByRound.push({ round, stopId: bestStop, arrivalMs: bestTime });
    }

    return { arrivals, parents, bestByRound };
};

const reconstructJourney = ({ runResult, targetRound, targetStop, departureMs }) => {
    const { parents } = runResult || {};
    const legs = [];
    let currentRound = targetRound;
    let currentStop = targetStop;
    let safety = 0;

    while (currentRound > 0 && safety < 2048) {
        safety += 1;
        const parentMap = parents?.[currentRound];
        if (!(parentMap instanceof Map)) {
            currentRound -= 1;
            continue;
        }
        const p = parentMap.get(currentStop);
        if (!p) {
            currentRound -= 1;
            continue;
        }
        if (p.kind === 'transfer') {
            currentStop = p.fromStop;
            continue;
        }

        const nextStopInBacktrace = p.fromStop;
        const prevRideInSameRound = parentMap.get(nextStopInBacktrace);
        const keepSameRound =
            prevRideInSameRound &&
            prevRideInSameRound.kind === 'ride' &&
            isThroughLegPairByMeta({
                currentLeg: prevRideInSameRound,
                nextLeg: p
            });

        legs.push({
            lineId: p.lineId,
            throughLineIds: Array.isArray(p?.throughLineIds)
                ? p.throughLineIds.map((x) => normalizeText(x)).filter(Boolean)
                : [],
            throughTripIds: Array.isArray(p?.throughTripIds)
                ? p.throughTripIds.map((x) => normalizeText(x)).filter(Boolean)
                : [],
            tripId: p.tripId,
            rawTripId: p.rawTripId,
            tripFile: normalizeText(p.tripFile || ''),
            baseTripKey: p.baseTripKey,
            ptRefs: normalizeRefArray(p.ptRefs),
            ntRefs: normalizeRefArray(p.ntRefs),
            throughRootTripId: normalizeText(p.throughRootTripId || ''),
            isThroughContinuation: p.isThroughContinuation === true,
            typeId: p.typeId,
            typeName: p.typeName,
            typeColor: p.typeColor,
            fromStop: p.fromStop,
            toStop: p.toStop,
            boardIndex: Number.isFinite(p.boardIndex) ? p.boardIndex : null,
            alightIndex: Number.isFinite(p.alightIndex) ? p.alightIndex : null,
            depMs: p.depMs,
            arrMs: p.arrMs
        });
        currentStop = p.fromStop;
        if (!keepSameRound) currentRound -= 1;
    }

    legs.reverse();
    if (!legs.length) return null;

    const sections = [];
    {
        let current = [];
        for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i];
            current.push(leg);
            const next = legs[i + 1] || null;
            const keep = next && isThroughLegPairByMeta({ currentLeg: leg, nextLeg: next });
            if (keep) continue;

            const first = current[0] || null;
            const last = current[current.length - 1] || null;
            const tripIds = [];
            const lineIds = [];
            const throughTripIds = [];
            for (const x of current) {
                const tid = normalizeText(x?.rawTripId || x?.tripId || '');
                if (tid && !tripIds.includes(tid)) tripIds.push(tid);
                const lid = normalizeText(x?.lineId || '');
                if (lid && !lineIds.includes(lid)) lineIds.push(lid);
                const tl = Array.isArray(x?.throughLineIds) ? x.throughLineIds : [];
                for (const id of tl) {
                    const v = normalizeText(id);
                    if (v && !lineIds.includes(v)) lineIds.push(v);
                }
                const tt = Array.isArray(x?.throughTripIds) ? x.throughTripIds : [];
                for (const id of tt) {
                    const v = normalizeText(id);
                    if (v && !throughTripIds.includes(v)) throughTripIds.push(v);
                }
            }
            if (!throughTripIds.length) {
                for (const id of tripIds) {
                    if (id && !throughTripIds.includes(id)) throughTripIds.push(id);
                }
            }

            sections.push({
                fromStop: normalizeText(first?.fromStop || ''),
                toStop: normalizeText(last?.toStop || ''),
                depMs: Number.isFinite(first?.depMs) ? Number(first.depMs) : null,
                arrMs: Number.isFinite(last?.arrMs) ? Number(last.arrMs) : null,
                tripIds,
                throughTripIds,
                lineIds,
                legs: current.slice()
            });
            current = [];
        }
    }

    const firstDepMs = Number.isFinite(legs[0]?.depMs) ? legs[0].depMs : departureMs;
    const arrivalMs = Number.isFinite(legs[legs.length - 1]?.arrMs) ? legs[legs.length - 1].arrMs : INF_TIME;
    const durationMs = arrivalMs - firstDepMs;
    const transfers = Math.max(0, sections.length - 1);

    return { legs, sections, firstDepMs, arrivalMs, durationMs, transfers };
};

const dedupePlans = (plans) => {
    const seen = new Set();
    const out = [];
    for (const p of plans) {
        const sig = [
            p.legs.map((x) => `${x.lineId}:${x.typeId}`).join('->'),
            String(Math.round((p.firstDepMs || 0) / 60000)),
            String(Math.round((p.arrivalMs || 0) / 60000))
        ].join('||');
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(p);
    }
    return out;
};

export const pickPlanBuckets = (plans) => {
    if (!plans.length) return [];
    const shortest = plans.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0];
    const fewestTransfers = plans.slice().sort((a, b) => a.transfers - b.transfers || a.durationMs - b.durationMs || a.arrivalMs - b.arrivalMs)[0];
    const earliestDeparture = plans.slice().sort((a, b) => a.firstDepMs - b.firstDepMs || a.arrivalMs - b.arrivalMs)[0];

    const picked = [];
    const addUnique = (plan, label) => {
        if (!plan) return;
        if (picked.some((x) => x.plan === plan)) return;
        picked.push({ label, plan });
    };
    addUnique(shortest, '最短用时');
    addUnique(fewestTransfers, '最少换乘');
    addUnique(earliestDeparture, '最早出发');

    const backup = plans
        .slice()
        .sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs)
        .filter((p) => !picked.some((x) => x.plan === p))
        .slice(0, 3)
        .map((plan, idx) => ({ label: `备用方案${idx + 1}`, plan }));

    const directSimple = shortest && shortest.transfers === 0 && plans.length <= 2;
    if (directSimple) {
        const directPicked = [];
        addUnique(shortest, '最短用时');
        addUnique(earliestDeparture, '最早出发');
        for (const x of picked) {
            if (x.label === '最短用时' || x.label === '最早出发') {
                if (!directPicked.some((r) => r.plan === x.plan)) directPicked.push(x);
            }
        }
        return directPicked;
    }

    return [...picked, ...backup];
};

const findTripInParsed = async ({ lineId, serviceDay, tripId }) => {
    const line = normalizeText(lineId);
    const day = normalizeText(serviceDay) || 'Weekday';
    const key = normalizeText(tripId);
    if (!line || !key) return null;

    const trips = await loadTripsForLineAndDay({ lineId: line, serviceDay: day });
    const exact = trips.find((x) =>
        normalizeText(x?.tripId) === key ||
        normalizeText(x?.rawTripId) === key ||
        normalizeText(x?.baseTripKey) === key
    );
    if (exact) return exact;

    const pref = trips.find((x) =>
        normalizeText(x?.tripId).startsWith(`${key}.`) ||
        normalizeText(x?.rawTripId).startsWith(`${key}.`)
    );
    if (pref) return pref;

    return trips.find((x) => {
        const pt = normalizeRefArray(x?.ptRefs);
        const nt = normalizeRefArray(x?.ntRefs);
        return pt.includes(key) || nt.includes(key);
    }) || null;
};

const resolveTripForLeg = async ({ leg, serviceDay }) => {
    const lineId = normalizeText(leg?.lineId || '');
    if (!lineId) return null;

    const candidates = [
        normalizeText(leg?.tripId || ''),
        normalizeText(leg?.rawTripId || ''),
        normalizeText(leg?.baseTripKey || ''),
        ...normalizeRefArray(leg?.ptRefs),
        ...normalizeRefArray(leg?.ntRefs)
    ].filter(Boolean);

    for (const key of candidates) {
        const trip = await findTripInParsed({ lineId, serviceDay, tripId: key });
        if (trip) return trip;
    }

    return null;
};

const resolveLegSliceIndexes = (trip, leg) => {
    const stops = Array.isArray(trip?.stops) ? trip.stops : [];
    if (!stops.length) return { fromIdx: -1, toIdx: -1 };

    const fromStop = normalizeText(leg?.fromStop);
    const toStop = normalizeText(leg?.toStop);

    let fromIdx = stops.findIndex((s) => isSamePhysicalStop(s?.stopId, fromStop));
    let toIdx = stops.findIndex((s) => isSamePhysicalStop(s?.stopId, toStop));

    if (fromIdx < 0 && Number.isFinite(leg?.boardIndex)) {
        const idx = Number(leg.boardIndex);
        if (idx >= 0 && idx < stops.length) fromIdx = idx;
    }
    if (toIdx < 0 && Number.isFinite(leg?.alightIndex)) {
        const idx = Number(leg.alightIndex);
        if (idx >= 0 && idx < stops.length) toIdx = idx;
    }

    if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return { fromIdx: -1, toIdx: -1 };
    return { fromIdx, toIdx };
};

const toLegStopRows = ({ trip, leg }) => {
    const stops = Array.isArray(trip?.stops) ? trip.stops : [];
    const { fromIdx, toIdx } = resolveLegSliceIndexes(trip, leg);
    if (fromIdx < 0 || toIdx < 0) return [];

    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(leg?.depMs) || Date.now()));
    const out = [];
    for (let i = fromIdx; i <= toIdx; i += 1) {
        const s = stops[i];
        const stationId = normalizeText(s?.stopId);
        const arrMs = Number.isFinite(s?.arrMin) ? serviceDayStartMs + Number(s.arrMin) * 60000 : null;
        const depMs = Number.isFinite(s?.depMin) ? serviceDayStartMs + Number(s.depMin) * 60000 : null;
        out.push({
            stationId,
            stationName: getStationNameById(stationId),
            arrText: Number.isFinite(arrMs) ? toHHMM(arrMs) : '',
            depText: Number.isFinite(depMs) ? toHHMM(depMs) : ''
        });
    }
    return out;
};

const buildRowsForTripSlice = ({ trip, fromIdx, toIdx, serviceDayStartMs }) => {
    const stops = Array.isArray(trip?.stops) ? trip.stops : [];
    if (!stops.length) return [];
    const a = Math.max(0, Number.isFinite(fromIdx) ? Number(fromIdx) : 0);
    const b = Math.min(stops.length - 1, Number.isFinite(toIdx) ? Number(toIdx) : (stops.length - 1));
    if (b < a) return [];

    const rows = [];
    for (let i = a; i <= b; i += 1) {
        const s = stops[i];
        const stationId = normalizeText(s?.stopId);
        const arrMs = Number.isFinite(s?.arrMin) ? serviceDayStartMs + Number(s.arrMin) * 60000 : null;
        const depMs = Number.isFinite(s?.depMin) ? serviceDayStartMs + Number(s.depMin) * 60000 : null;
        rows.push({
            stationId,
            stationName: getStationNameById(stationId),
            arrText: Number.isFinite(arrMs) ? toHHMM(arrMs) : '',
            depText: Number.isFinite(depMs) ? toHHMM(depMs) : ''
        });
    }
    return rows;
};

const buildSectionThroughSegments = async ({ section, serviceDay }) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    const fromStopId = normalizeText(section?.fromStop || '');
    const toStopId = normalizeText(section?.toStop || '');
    const ids = Array.isArray(section?.throughTripIds)
        ? section.throughTripIds.map((x) => normalizeText(x)).filter(Boolean)
        : [];
    if (!fromStopId || !toStopId || !ids.length) return [];

    const trips = [];
    for (const tripId of ids) {
        const trip = await getParsedTripByTripId({ tripId, serviceDay: day });
        if (!trip || !Array.isArray(trip?.stops) || !trip.stops.length) continue;
        trips.push(trip);
    }
    if (!trips.length) return [];

    let startTripIdx = -1;
    let startStopIdx = -1;
    for (let ti = 0; ti < trips.length; ti += 1) {
        const stops = Array.isArray(trips[ti]?.stops) ? trips[ti].stops : [];
        const idx = stops.findIndex((s) => isSamePhysicalStop(s?.stopId, fromStopId));
        if (idx >= 0) {
            startTripIdx = ti;
            startStopIdx = idx;
            break;
        }
    }
    if (startTripIdx < 0 || startStopIdx < 0) return [];

    let endTripIdx = -1;
    let endStopIdx = -1;
    for (let ti = startTripIdx; ti < trips.length; ti += 1) {
        const stops = Array.isArray(trips[ti]?.stops) ? trips[ti].stops : [];
        const begin = ti === startTripIdx ? startStopIdx : 0;
        for (let si = begin; si < stops.length; si += 1) {
            if (isSamePhysicalStop(stops[si]?.stopId, toStopId)) {
                endTripIdx = ti;
                endStopIdx = si;
                break;
            }
        }
        if (endTripIdx >= 0) break;
    }
    if (endTripIdx < 0 || endStopIdx < 0) return [];

    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(section?.depMs) || Date.now()));
    const out = [];
    for (let ti = startTripIdx; ti <= endTripIdx; ti += 1) {
        const trip = trips[ti];
        const stops = Array.isArray(trip?.stops) ? trip.stops : [];
        if (!stops.length) continue;

        const fromIdx = ti === startTripIdx ? startStopIdx : 0;
        const toIdx = ti === endTripIdx ? endStopIdx : (stops.length - 1);
        const rows = buildRowsForTripSlice({ trip, fromIdx, toIdx, serviceDayStartMs });
        if (!rows.length) continue;

        const lineId = normalizeText(trip?.lineId || '');
        const prev = out[out.length - 1] || null;
        if (prev && prev.lineId === lineId) {
            const mergedRows = Array.isArray(prev.rows) ? prev.rows.slice() : [];
            for (const row of rows) {
                const last = mergedRows[mergedRows.length - 1] || null;
                if (last && isSamePhysicalStop(last.stationId, row.stationId)) continue;
                mergedRows.push(row);
            }
            prev.rows = mergedRows;
            if (!prev.d) prev.d = normalizeText(trip?.d) || null;
            continue;
        }

        out.push({
            lineId,
            d: normalizeText(trip?.d) || null,
            typeName: normalizeText(trip?.typeName || section?.legs?.[0]?.typeName || '普通'),
            typeColor: normalizeText(trip?.typeColor || section?.legs?.[0]?.typeColor || '') || null,
            rows
        });
    }

    return out.filter((seg) => Array.isArray(seg?.rows) && seg.rows.length >= 2);
};

export const buildSectionLineRunsForDisplay = async ({ section, serviceDay }) => {
    const segs = await buildSectionThroughSegments({ section, serviceDay });
    if (segs.length) {
        return segs.map((seg) => ({
            lineId: normalizeText(seg?.lineId || ''),
            typeName: normalizeText(seg?.typeName || '普通'),
            typeColor: normalizeText(seg?.typeColor || '') || null
        })).filter((x) => x.lineId);
    }

    const legs = Array.isArray(section?.legs) ? section.legs : [];
    const out = [];
    for (const leg of legs) {
        const lineId = normalizeText(leg?.lineId || '');
        if (!lineId) continue;
        const run = {
            lineId,
            typeName: normalizeText(leg?.typeName || '普通'),
            typeColor: normalizeText(leg?.typeColor || '') || null
        };
        const prev = out[out.length - 1] || null;
        if (prev && prev.lineId === run.lineId && normalizeText(prev.typeName) === run.typeName) continue;
        out.push(run);
    }
    return out;
};

const buildThroughDisplaySegments = async ({ leg, serviceDay }) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    const ids = Array.isArray(leg?.throughTripIds)
        ? leg.throughTripIds.map((x) => normalizeText(x)).filter(Boolean)
        : [];
    if (ids.length < 2) return [];

    const trips = [];
    for (const tripId of ids) {
        const trip = await getParsedTripByTripId({ tripId, serviceDay: day });
        if (!trip || !Array.isArray(trip?.stops) || !trip.stops.length) continue;
        trips.push(trip);
    }
    if (trips.length < 2) return [];

    const segments = [];
    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(leg?.depMs) || Date.now()));

    const firstTripStops = Array.isArray(trips[0]?.stops) ? trips[0].stops : [];
    if (!firstTripStops.length) return [];

    let firstFromIdx = firstTripStops.findIndex((s) => isSamePhysicalStop(s?.stopId, leg?.fromStop));
    if (firstFromIdx < 0 && Number.isFinite(leg?.boardIndex)) {
        const idx = Number(leg.boardIndex);
        if (idx >= 0 && idx < firstTripStops.length) firstFromIdx = idx;
    }
    if (!Number.isFinite(firstFromIdx) || firstFromIdx < 0) firstFromIdx = 0;

    const targetToStopId = normalizeText(leg?.toStop || '');
    let endTripIndex = -1;
    let endStopIndex = -1;

    for (let tripIndex = 0; tripIndex < trips.length; tripIndex += 1) {
        const stops = Array.isArray(trips[tripIndex]?.stops) ? trips[tripIndex].stops : [];
        if (!stops.length) continue;

        const startIdx = tripIndex === 0 ? firstFromIdx : 0;
        for (let i = startIdx; i < stops.length; i += 1) {
            if (isSamePhysicalStop(stops[i]?.stopId, targetToStopId)) {
                endTripIndex = tripIndex;
                endStopIndex = i;
                break;
            }
        }
        if (endTripIndex >= 0) break;
    }

    if (endTripIndex <= 0 || endStopIndex < 0) return [];

    for (let tripIndex = 0; tripIndex <= endTripIndex; tripIndex += 1) {
        const trip = trips[tripIndex];
        const stops = Array.isArray(trip?.stops) ? trip.stops : [];
        if (!stops.length) continue;

        const fromIdx = tripIndex === 0 ? firstFromIdx : 0;
        const toIdx = tripIndex === endTripIndex ? endStopIndex : (stops.length - 1);

        const rows = buildRowsForTripSlice({ trip, fromIdx, toIdx, serviceDayStartMs });
        if (!rows.length) continue;

        if (segments.length) {
            const prevRows = segments[segments.length - 1].rows || [];
            const prevLast = prevRows[prevRows.length - 1] || null;
            const currFirst = rows[0] || null;
            if (prevLast && currFirst && isSamePhysicalStop(prevLast.stationId, currFirst.stationId)) {
                rows.shift();
            }
        }

        if (!rows.length) continue;
        segments.push({
            lineId: normalizeText(trip?.lineId || leg?.lineId || ''),
            d: normalizeText(trip?.d) || null,
            typeName: normalizeText(trip?.typeName || leg?.typeName || '普通'),
            typeColor: normalizeText(trip?.typeColor || leg?.typeColor || '') || null,
            rows
        });
    }

    return segments;
};

const isThroughLegPair = ({ currentLeg, nextLeg, currentTrip, nextTrip }) => {
    if (!currentLeg || !nextLeg || !currentTrip || !nextTrip) return false;

    const currId = normalizeText(currentTrip?.rawTripId || currentTrip?.tripId || currentLeg?.tripId || '');
    const nextId = normalizeText(nextTrip?.rawTripId || nextTrip?.tripId || nextLeg?.tripId || '');
    const currNt = new Set(normalizeRefArray(currentTrip?.ntRefs));
    const currPt = new Set(normalizeRefArray(currentTrip?.ptRefs));
    const nextPt = new Set(normalizeRefArray(nextTrip?.ptRefs));
    const nextNt = new Set(normalizeRefArray(nextTrip?.ntRefs));

    const linkedByRef =
        (currId && nextPt.has(currId)) ||
        (nextId && currNt.has(nextId)) ||
        (currId && nextNt.has(currId)) ||
        (nextId && currPt.has(nextId));

    const linkedByBaseTrip =
        normalizeText(currentTrip?.baseTripKey || '') &&
        normalizeText(currentTrip?.baseTripKey || '') === normalizeText(nextTrip?.baseTripKey || '');

    const sameStopPhysical = isSamePhysicalStop(currentLeg?.toStop, nextLeg?.fromStop);
    return sameStopPhysical && (linkedByRef || linkedByBaseTrip);
};

export const expandLegsForDisplay = async ({ legs, serviceDay, originStationId }) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    const originId = normalizeText(originStationId);
    const out = Array.isArray(legs) ? legs.slice() : [];
    if (!out.length || !originId) return out;

    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(out[0]?.depMs) || Date.now()));

    const buildSyntheticLegFromTrip = (trip, fromIdx, toIdx) => {
        const stops = Array.isArray(trip?.stops) ? trip.stops : [];
        const from = stops[fromIdx];
        const to = stops[toIdx];
        const depMs = Number.isFinite(from?.depMin) ? serviceDayStartMs + from.depMin * 60000 : null;
        const arrMs = Number.isFinite(to?.arrMin) ? serviceDayStartMs + to.arrMin * 60000 : null;
        return {
            lineId: normalizeText(trip?.lineId),
            tripId: normalizeText(trip?.tripId),
            rawTripId: normalizeText(trip?.rawTripId),
            baseTripKey: normalizeText(trip?.baseTripKey),
            ptRefs: normalizeRefArray(trip?.ptRefs),
            ntRefs: normalizeRefArray(trip?.ntRefs),
            typeId: normalizeText(trip?.typeId),
            typeName: normalizeText(trip?.typeName),
            typeColor: normalizeText(trip?.typeColor) || null,
            fromStop: normalizeText(from?.stopId),
            toStop: normalizeText(to?.stopId),
            boardIndex: fromIdx,
            alightIndex: toIdx,
            depMs,
            arrMs
        };
    };

    for (let hop = 0; hop < 3; hop += 1) {
        if (!out.length) break;
        const first = out[0];
        if (isSamePhysicalStop(first?.fromStop, originId)) break;

        const firstTrip = await resolveTripForLeg({ leg: first, serviceDay: day });
        const ptRefs = [...normalizeRefArray(first?.ptRefs), ...normalizeRefArray(firstTrip?.ptRefs)].filter(Boolean);
        if (!ptRefs.length) break;

        let prepended = false;
        for (const refId of ptRefs) {
            const prevTrip = await getParsedTripByTripId({ tripId: refId, serviceDay: day });
            if (!prevTrip || !Array.isArray(prevTrip.stops) || prevTrip.stops.length < 2) continue;

            const boundaryStopId = normalizeText(first?.fromStop);
            const boundaryIdx = prevTrip.stops.findIndex((s) => isSamePhysicalStop(s?.stopId, boundaryStopId));
            if (boundaryIdx < 0) continue;

            const fromIdx = prevTrip.stops.findIndex((s) => isSamePhysicalStop(s?.stopId, originId));
            if (fromIdx < 0 || boundaryIdx <= fromIdx) continue;

            out.unshift(buildSyntheticLegFromTrip(prevTrip, fromIdx, boundaryIdx));
            prepended = true;
            break;
        }

        if (!prepended) break;
    }

    return out;
};

export const buildPlanDetailBlocks = async ({ plan, legsOverride, sectionsOverride, serviceDay, originStationId }) => {
    const blocks = [];
    const rawLegs = Array.isArray(legsOverride) ? legsOverride : (Array.isArray(plan?.legs) ? plan.legs : []);
    const sectionSource = Array.isArray(sectionsOverride)
        ? sectionsOverride
        : (Array.isArray(plan?.sections) ? plan.sections : []);
    const legs = Array.isArray(legsOverride)
        ? rawLegs
        : await expandLegsForDisplay({ legs: rawLegs, serviceDay, originStationId });

    const sectionRowsFromLegs = async (section) => {
        const out = [];
        const list = Array.isArray(section?.legs) ? section.legs : [];
        for (const leg of list) {
            const trip = await resolveTripForLeg({ leg, serviceDay });
            let rows = [];
            if (trip) {
                rows = toLegStopRows({ trip, leg });
            } else {
                const fromId = normalizeText(leg?.fromStop);
                const toId = normalizeText(leg?.toStop);
                const depText = Number.isFinite(Number(leg?.depMs)) ? toHHMM(Number(leg.depMs)) : '';
                const arrText = Number.isFinite(Number(leg?.arrMs)) ? toHHMM(Number(leg.arrMs)) : '';
                if (fromId && toId) {
                    rows = [
                        { stationId: fromId, stationName: getStationNameById(fromId), arrText: '', depText },
                        { stationId: toId, stationName: getStationNameById(toId), arrText, depText: '' }
                    ];
                }
            }

            for (const row of rows) {
                const prev = out[out.length - 1] || null;
                if (prev && isSamePhysicalStop(prev.stationId, row.stationId)) continue;
                out.push(row);
            }
        }
        return out;
    };

    if (sectionSource.length) {
        for (let i = 0; i < sectionSource.length; i += 1) {
            const section = sectionSource[i] || {};
            const throughSegs = await buildSectionThroughSegments({ section, serviceDay });
            if (throughSegs.length) {
                for (const seg of throughSegs) {
                    const lineMeta = await getLineMeta(seg?.lineId);
                    const rows = Array.isArray(seg?.rows) ? seg.rows.slice() : [];
                    if (!rows.length) continue;
                    if (blocks.length) {
                        const prev = blocks[blocks.length - 1];
                        if (prev?.kind === 'ride' && Array.isArray(prev.rows) && prev.rows.length) {
                            const prevLastId = normalizeText(prev.rows[prev.rows.length - 1]?.stationId || '');
                            const currFirstId = normalizeText(rows[0]?.stationId || '');
                            if (prevLastId && currFirstId && isSamePhysicalStop(prevLastId, currFirstId)) rows.shift();
                        }
                    }
                    if (!rows.length) continue;
                    blocks.push({
                        kind: 'ride',
                        lineName: normalizeText(lineMeta?.name || seg?.lineId),
                        lineDisplayName: buildLineDescriptorText(lineMeta),
                        lineColor: lineMeta?.color || null,
                        typeName: normalizeText(seg?.typeName || '普通'),
                        typeColor: normalizeText(seg?.typeColor || '') || null,
                        rows
                    });
                }
            } else {
                const rows = await sectionRowsFromLegs(section);
                if (!rows.length) continue;

                const lineIds = Array.isArray(section?.lineIds) ? section.lineIds.map((x) => normalizeText(x)).filter(Boolean) : [];
                const firstLineId = normalizeText(lineIds[0] || section?.legs?.[0]?.lineId || '');
                const firstMeta = await getLineMeta(firstLineId);
                let lineDisplayName = buildLineDescriptorText(firstMeta);
                if (lineIds.length > 1) {
                    const metas = await Promise.all(lineIds.map((lineId) => getLineMeta(lineId)));
                    const names = metas.map((meta, idx) => normalizeText(meta?.name || lineIds[idx] || '')).filter(Boolean);
                    if (names.length) lineDisplayName = names.join('·');
                }

                blocks.push({
                    kind: 'ride',
                    lineName: normalizeText(firstMeta?.name || firstLineId),
                    lineDisplayName,
                    lineColor: firstMeta?.color || null,
                    typeName: normalizeText(section?.legs?.[0]?.typeName || '普通'),
                    typeColor: normalizeText(section?.legs?.[0]?.typeColor || '') || null,
                    rows
                });
            }

            if (i < sectionSource.length - 1) blocks.push({ kind: 'transfer' });
        }
        return blocks;
    }

    const resolved = [];
    for (let i = 0; i < legs.length; i += 1) {
        const leg = legs[i];
        const trip = await resolveTripForLeg({ leg, serviceDay });
        resolved.push({ leg, trip });
    }

    const trimLeadingDup = (rows) => {
        if (!(Array.isArray(rows) && rows.length)) return rows;
        if (!blocks.length) return rows;
        const prev = blocks[blocks.length - 1];
        if (!(prev?.kind === 'ride' && Array.isArray(prev.rows) && prev.rows.length)) return rows;
        const prevLastId = normalizeText(prev.rows[prev.rows.length - 1]?.stationId || '');
        const currFirstId = normalizeText(rows[0]?.stationId || '');
        const sameStop = prevLastId && currFirstId && (
            prevLastId === currFirstId ||
            (plannerState.groupByStop.get(prevLastId) instanceof Set && plannerState.groupByStop.get(prevLastId).has(currFirstId))
        );
        if (sameStop) rows.shift();
        return rows;
    };

    for (let i = 0; i < resolved.length; i += 1) {
        const { leg, trip } = resolved[i];
        const throughSegments = await buildThroughDisplaySegments({ leg, serviceDay });
        if (throughSegments.length) {
            for (const seg of throughSegments) {
                const lineMeta = await getLineMeta(seg?.lineId);
                const rows = trimLeadingDup(Array.isArray(seg?.rows) ? seg.rows.slice() : []);
                if (!rows.length) continue;
                blocks.push({
                    kind: 'ride',
                    lineName: normalizeText(lineMeta?.name || seg?.lineId),
                    lineDisplayName: buildLineDescriptorText(lineMeta),
                    lineColor: lineMeta?.color || null,
                    typeName: normalizeText(seg?.typeName || '普通'),
                    typeColor: normalizeText(seg?.typeColor || '') || null,
                    rows
                });
            }
        } else {
            const lineMeta = await getLineMeta(leg?.lineId);
            let rows = [];

            if (trip) {
                rows = toLegStopRows({ trip, leg });
            } else {
                const fromId = normalizeText(leg?.fromStop);
                const toId = normalizeText(leg?.toStop);
                const depText = Number.isFinite(Number(leg?.depMs)) ? toHHMM(Number(leg.depMs)) : '';
                const arrText = Number.isFinite(Number(leg?.arrMs)) ? toHHMM(Number(leg.arrMs)) : '';
                if (fromId && toId) {
                    rows = [
                        { stationId: fromId, stationName: getStationNameById(fromId), arrText: '', depText },
                        { stationId: toId, stationName: getStationNameById(toId), arrText, depText: '' }
                    ];
                }
            }

            rows = trimLeadingDup(rows);
            if (rows.length) {
                blocks.push({
                    kind: 'ride',
                    lineName: normalizeText(lineMeta?.name || leg?.lineId),
                    lineDisplayName: buildLineDescriptorText(lineMeta),
                    lineColor: lineMeta?.color || null,
                    typeName: normalizeText(leg?.typeName || trip?.typeName || '普通'),
                    typeColor: normalizeText(leg?.typeColor || trip?.typeColor || '') || null,
                    rows
                });
            }
        }

        const next = resolved[i + 1] || null;
        if (!next) continue;

        const through = (trip && next.trip)
            ? isThroughLegPair({ currentLeg: leg, nextLeg: next.leg, currentTrip: trip, nextTrip: next.trip })
            : isThroughLegPairByMeta({ currentLeg: leg, nextLeg: next.leg });

        if (!through) blocks.push({ kind: 'transfer' });
    }

    return blocks;
};

export const buildTripPreviewPayloadFromDisplayPlan = async ({ row, displayPlan }) => {
    const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
    const sections = Array.isArray(displayPlan?.sections)
        ? displayPlan.sections
        : (Array.isArray(row?.plan?.sections) ? row.plan.sections : []);
    if (!legs.length) return null;

    const segments = [];
    if (sections.length) {
        for (const section of sections) {
            const throughSegs = await buildSectionThroughSegments({ section, serviceDay: row?.serviceDay });
            if (throughSegs.length) {
                for (const seg of throughSegs) {
                    const stationIds = Array.isArray(seg?.rows)
                        ? seg.rows.map((r) => normalizeText(r?.stationId)).filter(Boolean)
                        : [];
                    if (stationIds.length < 2) continue;
                    const lineId = normalizeText(seg?.lineId || '');
                    if (!lineId) continue;
                    segments.push({
                        kind: 'main',
                        lineId,
                        stationIds,
                        d: normalizeText(seg?.d) || null,
                        typeColor: normalizeText(seg?.typeColor || section?.legs?.[0]?.typeColor || '') || null
                    });
                }
                continue;
            }

            const secLegs = Array.isArray(section?.legs) ? section.legs : [];
            if (!secLegs.length) continue;

            const stationIds = [];
            let sectionDir = null;
            for (const leg of secLegs) {
                const trip = await resolveTripForLeg({ leg, serviceDay: row?.serviceDay });
                if (!sectionDir && trip) sectionDir = normalizeText(trip?.d) || null;
                const rows = trip
                    ? toLegStopRows({ trip, leg })
                    : [
                        { stationId: normalizeText(leg?.fromStop) },
                        { stationId: normalizeText(leg?.toStop) }
                    ];
                for (const r of rows) {
                    const sid = normalizeText(r?.stationId);
                    if (!sid) continue;
                    if (stationIds.length && isSamePhysicalStop(stationIds[stationIds.length - 1], sid)) continue;
                    stationIds.push(sid);
                }
            }

            const compactIds = stationIds.filter(Boolean);
            if (compactIds.length < 2) continue;

            const lineIds = Array.isArray(section?.lineIds)
                ? section.lineIds.map((x) => normalizeText(x)).filter(Boolean)
                : [];
            const segmentLineId = normalizeText(lineIds[0] || secLegs[0]?.lineId || '');
            if (!segmentLineId) continue;

            segments.push({
                kind: 'main',
                lineId: segmentLineId,
                stationIds: compactIds,
                d: sectionDir,
                typeColor: normalizeText(section?.legs?.[0]?.typeColor || '') || null
            });
        }
    }

    if (!segments.length) {
    for (const leg of legs) {
        const lineId = normalizeText(leg?.lineId);
        if (!lineId) continue;

        const throughSegments = await buildThroughDisplaySegments({ leg, serviceDay: row?.serviceDay });
        if (throughSegments.length) {
            for (const seg of throughSegments) {
                const stationIds = Array.isArray(seg?.rows)
                    ? seg.rows.map((x) => normalizeText(x?.stationId)).filter(Boolean)
                    : [];
                const compactIds = [];
                for (const sid of stationIds) {
                    if (!sid) continue;
                    if (compactIds.length && compactIds[compactIds.length - 1] === sid) continue;
                    compactIds.push(sid);
                }
                if (compactIds.length < 2) continue;
                segments.push({
                    kind: 'main',
                    lineId: normalizeText(seg?.lineId || lineId),
                    stationIds: compactIds,
                    d: normalizeText(seg?.d) || null,
                    typeColor: normalizeText(seg?.typeColor || leg?.typeColor || '') || null
                });
            }
            continue;
        }

        const trip = await resolveTripForLeg({ leg, serviceDay: row?.serviceDay });
        let stationIds = [];
        if (trip) {
            const rows = toLegStopRows({ trip, leg });
            stationIds = rows.map((x) => normalizeText(x?.stationId)).filter(Boolean);
        } else {
            stationIds = [normalizeText(leg?.fromStop), normalizeText(leg?.toStop)].filter(Boolean);
        }

        const compactIds = [];
        for (const sid of stationIds) {
            if (!sid) continue;
            if (compactIds.length && compactIds[compactIds.length - 1] === sid) continue;
            compactIds.push(sid);
        }
        if (compactIds.length < 2) continue;

        segments.push({
            kind: 'main',
            lineId,
            stationIds: compactIds,
            d: normalizeText(trip?.d) || null,
            typeColor: normalizeText(leg?.typeColor || trip?.typeColor || '') || null
        });
    }
    }

    if (!segments.length) return null;

    const mergedSegments = [];
    for (const seg of segments) {
        const lineId = normalizeText(seg?.lineId || '');
        const ids = Array.isArray(seg?.stationIds) ? seg.stationIds.map((x) => normalizeText(x)).filter(Boolean) : [];
        const segTypeColor = normalizeText(seg?.typeColor || '') || null;
        const segDir = normalizeText(seg?.d) || null;
        if (!lineId || ids.length < 2) continue;
        const prev = mergedSegments[mergedSegments.length - 1] || null;
        if (prev && normalizeText(prev.lineId) === lineId) {
            const a = prev.stationIds[prev.stationIds.length - 1] || '';
            const b = ids[0] || '';
            if (a && b && isSamePhysicalStop(a, b)) {
                prev.stationIds.push(...ids.slice(1));
                if (!prev.typeColor && segTypeColor) prev.typeColor = segTypeColor;
                if (!prev.d && segDir) prev.d = segDir;
                else if (prev.d && segDir && normalizeText(prev.d) !== segDir) prev.d = null;
                continue;
            }
        }
        mergedSegments.push({ kind: 'main', lineId, stationIds: ids.slice(), d: segDir, typeColor: segTypeColor });
    }

    if (!mergedSegments.length) return null;

    const firstSeg = mergedSegments[0];
    const lastSeg = mergedSegments[mergedSegments.length - 1];
    const firstLeg = legs[0] || null;

    return {
        tripKey: normalizeText(firstLeg?.tripKey || `${toHHMM(displayPlan?.firstDepMs)}-${toHHMM(displayPlan?.arrivalMs)}`),
        selectedLineId: normalizeText(firstSeg?.lineId),
        mainLineId: normalizeText(firstSeg?.lineId),
        originStationId: normalizeText(row?.originStationId || firstSeg?.stationIds?.[0]),
        mainTerminalStationId: normalizeText(firstSeg?.stationIds?.[firstSeg.stationIds.length - 1]),
        terminalStationId: normalizeText(lastSeg?.stationIds?.[lastSeg.stationIds.length - 1]),
        typeName: normalizeText(firstLeg?.typeName || '普通'),
        typeColor: normalizeText(firstSeg?.typeColor || firstLeg?.typeColor || '') || null,
        hasNt: false,
        fitMode: 'preview',
        segments: mergedSegments
    };
};

export const collectJourneyCandidatesRaptor = async ({ sourceStops, destinationStops, serviceDay, baseDepartureMs }) => {
    await ensurePlannerStaticData();

    const offsetsMin = [0, 5, 10, 15, 20, 30, 45, 60, 75, 90, 105, 120];

    const runWithMaxRounds = async (maxRounds) => {
        const candidates = [];
        for (const addMin of offsetsMin) {
            const depMs = baseDepartureMs + addMin * 60000;
            const runResult = await runRaptorSearch({
                sourceStops,
                destinationStops,
                departureMs: depMs,
                serviceDay,
                maxRounds
            });

            for (const best of runResult.bestByRound || []) {
                const plan = reconstructJourney({
                    runResult,
                    targetRound: best.round,
                    targetStop: best.stopId,
                    departureMs: depMs
                });
                if (plan && Array.isArray(plan.legs) && plan.legs.length) {
                    const firstFrom = normalizeText(plan.legs[0]?.fromStop || '');
                    const okStart = firstFrom && (sourceStops.has(firstFrom) || Array.from(sourceStops).some((s) => isSamePhysicalStop(s, firstFrom)));
                    if (okStart) {
                        plan.baseDepartureMs = baseDepartureMs;
                        if (Number.isFinite(plan.arrivalMs) && Number.isFinite(baseDepartureMs)) {
                            plan.durationMs = plan.arrivalMs - baseDepartureMs;
                        }
                        candidates.push(plan);
                    }
                }
            }
            if (candidates.length >= 50) break;
        }
        return candidates;
    };

    let candidates = await runWithMaxRounds(7);
    if (!candidates.length) candidates = await runWithMaxRounds(10);

    return dedupePlans(candidates).sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs);
};

const inferServiceDayFromDate = (dateLike) => {
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike || Date.now());
    const day = d.getDay();
    return (day === 0 || day === 6) ? 'SaturdayHoliday' : 'Weekday';
};

export async function findPath(startStopId, endStopId, startTime) {
    const originId = normalizeText(startStopId);
    const destinationId = normalizeText(endStopId);
    const departureMs = Number.isFinite(Number(startTime)) ? Number(startTime) : Date.now();

    if (!originId || !destinationId || originId === destinationId) return null;

    await ensurePlannerStaticData();

    let sourceStops = getGroupStops(originId);
    sourceStops.add(originId);
    sourceStops = filterNearbyStops(originId, sourceStops, 800);

    const destinationStops = getGroupStops(destinationId);
    destinationStops.add(destinationId);

    if (!sourceStops.size || !destinationStops.size || sameSet(sourceStops, destinationStops)) return null;

    const panelDay = normalizeText(document.querySelector('.panel-day-seg button.is-active[data-day]')?.getAttribute?.('data-day') || '');
    const serviceDay = panelDay === 'SaturdayHoliday'
        ? 'SaturdayHoliday'
        : inferServiceDayFromDate(new Date(departureMs));

    const plans = await collectJourneyCandidatesRaptor({
        sourceStops,
        destinationStops,
        serviceDay,
        baseDepartureMs: departureMs
    });

    if (!Array.isArray(plans) || !plans.length) return null;
    return plans[0] || null;
}

export const collectJourneyCandidatesTBTR = collectJourneyCandidatesRaptor;
