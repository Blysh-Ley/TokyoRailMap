import { searchRailEntities, getLineMetaByIds } from './search.js';

function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null) continue;
        if (k === 'text') node.textContent = String(v);
        else node.setAttribute(k, String(v));
    }
    return node;
}

const normalizeText = (v) => String(v ?? '').trim();
const SERVICE_DAY_BOUNDARY_HOUR = 3;
const INF_TIME = Number.POSITIVE_INFINITY;

const parseTripServiceDayFromId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    if (m?.[1]) return m[1];
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

const getServiceDayStartMs = (now = new Date()) => {
    const d = new Date(now.getTime());
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    if (d.getTime() < candidate.getTime()) {
        candidate.setDate(candidate.getDate() - 1);
    }
    return candidate.getTime();
};

const normalizeHHMM = (value) => {
    const s = normalizeText(value);
    const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!m) return '';
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const hhmmToOffsetMinutes = (hhmm) => {
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

const toHHMM = (timeMs) => {
    if (!Number.isFinite(timeMs)) return '--:--';
    const d = new Date(timeMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDuration = (durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return '用时--';
    const totalMin = Math.round(durationMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `用时${h}小时${m}分钟`;
};

const getStationNameById = (stationId) => {
    const id = normalizeText(stationId);
    if (!id) return '';
    return normalizeText(plannerState.stationNameById.get(id) || id);
};

const sameSet = (a, b) => {
    if (!(a instanceof Set) || !(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const x of a) {
        if (!b.has(x)) return false;
    }
    return true;
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
    lineTripsCache: new Map(), // key: `${lineId}||${serviceDay}` -> parsed trips
    tripByIdByDay: new Map() // key: serviceDay -> Map(tripId/rawTripId/baseTripKey, parsedTrip)
};

const getDayTripMap = (serviceDay) => {
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!plannerState.tripByIdByDay.has(day)) {
        plannerState.tripByIdByDay.set(day, new Map());
    }
    return plannerState.tripByIdByDay.get(day);
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

const isThroughLegPairByMeta = ({ currentLeg, nextLeg }) => {
    if (!currentLeg || !nextLeg) return false;

    const currId = normalizeText(currentLeg?.rawTripId || currentLeg?.tripId || '');
    const nextId = normalizeText(nextLeg?.rawTripId || nextLeg?.tripId || '');
    const currNt = new Set(normalizeRefArray(currentLeg?.ntRefs));
    const nextPt = new Set(normalizeRefArray(nextLeg?.ptRefs));

    const linkedByRef =
        (currId && nextPt.has(currId)) ||
        (nextId && currNt.has(nextId));

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

const ensurePlannerStaticData = async () => {
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

const getGroupStops = (stationId) => {
    const id = normalizeText(stationId);
    if (!id) return new Set();
    const group = plannerState.groupByStop.get(id);
    return group instanceof Set && group.size ? new Set(group) : new Set([id]);
};

const filterNearbyStops = (anchorStopId, stops, maxMeters) => {
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
    if (!Number.isFinite(dist)) return 3 * 60 * 1000;
    if (dist <= 1) return 3 * 60 * 1000;

    const extra = Math.ceil(dist / 100) * 2;
    return (3 + extra) * 60 * 1000;
};

const getLineMeta = async (lineId) => {
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
    if (lineName.startsWith(abb)) {
        lineName = normalizeText(lineName.slice(abb.length));
    }
    return normalizeText(`${abb}${lineName}`) || rawName;
};

const loadTripsForLineAndDay = async ({ lineId, serviceDay }) => {
    const line = normalizeText(lineId);
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!line) return [];
    const cacheKey = `${line}||${day}`;
    if (plannerState.lineTripsCache.has(cacheKey)) {
        return plannerState.lineTripsCache.get(cacheKey);
    }

    const cache = window?.TokyoRailTimetableCache;
    if (!cache) {
        plannerState.lineTripsCache.set(cacheKey, []);
        return [];
    }

    const existing = cache.get(line);
    if (!existing) {
        await cache.preloadByLineIds([line]);
    }
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

const relaxTripRide = ({
    trip,
    lineId,
    boardIndex,
    boardStopId,
    boardDepMs,
    serviceDayStartMs,
    roundArr,
    roundParent,
    improvedStops
}) => {
    let changed = false;
    if (!trip || !Array.isArray(trip.stops) || trip.stops.length < 2) return changed;

    const start = Number.isFinite(boardIndex) ? Number(boardIndex) : -1;
    if (start < 0 || start >= trip.stops.length) return changed;

    for (let i = start + 1; i < trip.stops.length; i += 1) {
        const stop = trip.stops[i];
        const stopId = normalizeText(stop?.stopId);
        if (!stopId) continue;
        const arrMs = Number.isFinite(stop?.arrMin) ? serviceDayStartMs + stop.arrMin * 60000 : null;
        if (!Number.isFinite(arrMs)) continue;
        if (stopId === boardStopId) continue;

        const best = roundArr.get(stopId);
        if (!Number.isFinite(best) || arrMs < best) {
            roundArr.set(stopId, arrMs);
            roundParent.set(stopId, {
                kind: 'ride',
                lineId,
                tripId: trip.tripId,
                rawTripId: trip.rawTripId,
                baseTripKey: trip.baseTripKey,
                ptRefs: trip.ptRefs,
                ntRefs: trip.ntRefs,
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

const relaxThroughChain = async ({
    seedTrip,
    seedLineId,
    seedBoardIndex,
    seedBoardStopId,
    seedBoardDepMs,
    serviceDay,
    serviceDayStartMs,
    roundArr,
    roundParent,
    improvedStops
}) => {
    const stack = [{
        trip: seedTrip,
        lineId: seedLineId,
        boardIndex: seedBoardIndex,
        boardStopId: seedBoardStopId,
        boardDepMs: seedBoardDepMs
    }];
    const visited = new Set();

    while (stack.length) {
        const task = stack.pop();
        const trip = task?.trip;
        if (!trip) continue;

        const visitKey = `${normalizeText(trip.rawTripId || trip.tripId)}@${normalizeText(task.boardStopId)}@${task.boardIndex}`;
        if (visited.has(visitKey)) continue;
        visited.add(visitKey);

        relaxTripRide({
            trip,
            lineId: task.lineId,
            boardIndex: task.boardIndex,
            boardStopId: task.boardStopId,
            boardDepMs: task.boardDepMs,
            serviceDayStartMs,
            roundArr,
            roundParent,
            improvedStops
        });

        const currTimes = getTripStartEndTimes(trip, serviceDayStartMs);
        if (!currTimes) continue;

        const refs = normalizeRefArray(trip.ntRefs);
        for (const refId of refs) {
            const nextTrip = await getParsedTripByTripId({ tripId: refId, serviceDay });
            if (!nextTrip) continue;
            const nextTimes = getTripStartEndTimes(nextTrip, serviceDayStartMs);
            if (!nextTimes) continue;
            if (!isSamePhysicalStop(currTimes.lastStopId, nextTimes.firstStopId)) continue;
            if (Number.isFinite(currTimes.endArrMs) && Number.isFinite(nextTimes.startDepMs) && nextTimes.startDepMs < currTimes.endArrMs) {
                continue;
            }

            stack.push({
                trip: nextTrip,
                lineId: normalizeText(nextTrip.lineId),
                boardIndex: 0,
                boardStopId: nextTimes.firstStopId,
                boardDepMs: nextTimes.startDepMs
            });
        }
    }
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

const runRaptorOnce = async ({ sourceStops, destinationStops, departureMs, serviceDay, maxRounds = 4 }) => {
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
        const roundArr = new Map(prevArr);
        const roundParent = new Map();

        // Minimum time required to change trains (even if stopId is the same).
        // Round 1 is the initial boarding, later rounds represent real transfers.
        const minBoardSlackMs = round > 1 ? 3 * 60 * 1000 : 0;

        const routeIds = lineSetFromMarkedStops(markedStops);
        if (!routeIds.size) {
            arrivals[round] = roundArr;
            parents[round] = roundParent;
            markedStops = new Set();
            continue;
        }

        const routeArr = Array.from(routeIds);
        const routeTripsPairs = await Promise.all(
            routeArr.map(async (lineId) => ({ lineId, trips: await loadTripsForLineAndDay({ lineId, serviceDay }) }))
        );

        const improvedStops = new Set();

        for (const { lineId, trips } of routeTripsPairs) {
            if (!Array.isArray(trips) || !trips.length) continue;

            for (const trip of trips) {
                let boarded = null; // { stopId, depMs, index }

                for (let i = 0; i < trip.stops.length; i += 1) {
                    const stop = trip.stops[i];
                    const stopId = stop.stopId;
                    const depMs = Number.isFinite(stop.depMin) ? serviceDayStartMs + stop.depMin * 60000 : null;
                    const arrMs = Number.isFinite(stop.arrMin) ? serviceDayStartMs + stop.arrMin * 60000 : null;

                    const prevBest = prevArr.get(stopId);
                    if (!boarded && Number.isFinite(prevBest) && Number.isFinite(depMs) && depMs >= prevBest + minBoardSlackMs) {
                        boarded = { stopId, depMs, index: i };
                    }

                    if (!boarded || !Number.isFinite(arrMs)) continue;
                    if (i <= 0) continue;
                    if (stopId === boarded.stopId) continue;

                    const best = roundArr.get(stopId);
                    if (!Number.isFinite(best) || arrMs < best) {
                        roundArr.set(stopId, arrMs);
                        roundParent.set(stopId, {
                            kind: 'ride',
                            lineId,
                            tripId: trip.tripId,
                            rawTripId: trip.rawTripId,
                            baseTripKey: trip.baseTripKey,
                            ptRefs: trip.ptRefs,
                            ntRefs: trip.ntRefs,
                            typeId: trip.typeId,
                            typeName: trip.typeName,
                            typeColor: trip.typeColor,
                            fromStop: boarded.stopId,
                            toStop: stopId,
                            boardIndex: boarded.index,
                            alightIndex: i,
                            depMs: boarded.depMs,
                            arrMs
                        });
                        improvedStops.add(stopId);
                    }
                }

                if (boarded) {
                    await relaxThroughChain({
                        seedTrip: trip,
                        seedLineId: lineId,
                        seedBoardIndex: boarded.index,
                        seedBoardStopId: boarded.stopId,
                        seedBoardDepMs: boarded.depMs,
                        serviceDay,
                        serviceDayStartMs,
                        roundArr,
                        roundParent,
                        improvedStops
                    });
                }
            }
        }

        const transferFromStops = Array.from(improvedStops);
        for (const fromStop of transferFromStops) {
            const fromTime = roundArr.get(fromStop);
            const group = plannerState.groupByStop.get(fromStop);
            if (!Number.isFinite(fromTime) || !(group instanceof Set)) continue;

            for (const toStop of group) {
                const penalty = getTransferPenaltyMs(fromStop, toStop);
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
        if (Number.isFinite(bestTime)) {
            bestByRound.push({ round, stopId: bestStop, arrivalMs: bestTime });
        }
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
                currentLeg: {
                    lineId: prevRideInSameRound.lineId,
                    tripId: prevRideInSameRound.tripId,
                    rawTripId: prevRideInSameRound.rawTripId,
                    baseTripKey: prevRideInSameRound.baseTripKey,
                    ptRefs: prevRideInSameRound.ptRefs,
                    ntRefs: prevRideInSameRound.ntRefs,
                    fromStop: prevRideInSameRound.fromStop,
                    toStop: prevRideInSameRound.toStop
                },
                nextLeg: {
                    lineId: p.lineId,
                    tripId: p.tripId,
                    rawTripId: p.rawTripId,
                    baseTripKey: p.baseTripKey,
                    ptRefs: p.ptRefs,
                    ntRefs: p.ntRefs,
                    fromStop: p.fromStop,
                    toStop: p.toStop
                }
            });

        legs.push({
            lineId: p.lineId,
            tripId: p.tripId,
            rawTripId: p.rawTripId,
            baseTripKey: p.baseTripKey,
            ptRefs: normalizeRefArray(p.ptRefs),
            ntRefs: normalizeRefArray(p.ntRefs),
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
        if (!keepSameRound) {
            currentRound -= 1;
        }
    }

    legs.reverse();
    if (!legs.length) return null;

    const firstDepMs = Number.isFinite(legs[0]?.depMs) ? legs[0].depMs : departureMs;
    const arrivalMs = Number.isFinite(legs[legs.length - 1]?.arrMs) ? legs[legs.length - 1].arrMs : INF_TIME;
    const durationMs = arrivalMs - firstDepMs;
    let transfers = 0;
    for (let i = 0; i < legs.length - 1; i += 1) {
        if (!isThroughLegPairByMeta({ currentLeg: legs[i], nextLeg: legs[i + 1] })) {
            transfers += 1;
        }
    }

    return {
        legs,
        firstDepMs,
        arrivalMs,
        durationMs,
        transfers
    };
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

const pickPlanBuckets = (plans) => {
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

    let fromIdx = Number.isFinite(leg?.boardIndex) ? Number(leg.boardIndex) : -1;
    let toIdx = Number.isFinite(leg?.alightIndex) ? Number(leg.alightIndex) : -1;

    if (fromIdx < 0) {
        const fromStop = normalizeText(leg?.fromStop);
        fromIdx = stops.findIndex((s) => isSamePhysicalStop(s?.stopId, fromStop));
    }
    if (toIdx < 0) {
        const toStop = normalizeText(leg?.toStop);
        toIdx = stops.findIndex((s) => isSamePhysicalStop(s?.stopId, toStop));
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


const isThroughLegPair = ({ currentLeg, nextLeg, currentTrip, nextTrip }) => {
    if (!currentLeg || !nextLeg || !currentTrip || !nextTrip) return false;

    const currId = normalizeText(currentTrip?.rawTripId || currentTrip?.tripId || currentLeg?.tripId || '');
    const nextId = normalizeText(nextTrip?.rawTripId || nextTrip?.tripId || nextLeg?.tripId || '');
    const currNt = new Set(normalizeRefArray(currentTrip?.ntRefs));
    const nextPt = new Set(normalizeRefArray(nextTrip?.ptRefs));

    const linkedByRef =
        (currId && nextPt.has(currId)) ||
        (nextId && currNt.has(nextId));

    const linkedByBaseTrip =
        normalizeText(currentTrip?.baseTripKey || '') &&
        normalizeText(currentTrip?.baseTripKey || '') === normalizeText(nextTrip?.baseTripKey || '');

    const sameStopPhysical = isSamePhysicalStop(currentLeg?.toStop, nextLeg?.fromStop);

    return sameStopPhysical && (linkedByRef || linkedByBaseTrip);
};

const expandLegsForDisplay = async ({ legs, serviceDay, originStationId }) => {
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
        const ptRefs = [
            ...normalizeRefArray(first?.ptRefs),
            ...normalizeRefArray(firstTrip?.ptRefs)
        ].filter(Boolean);
        if (!ptRefs.length) break;

        let prepended = false;
        for (const refId of ptRefs) {
            const prevTrip = await getParsedTripByTripId({ tripId: refId, serviceDay: day });
            if (!prevTrip || !Array.isArray(prevTrip.stops) || prevTrip.stops.length < 2) continue;

            const boundaryStopId = normalizeText(first?.fromStop);
            const boundaryIdx = prevTrip.stops.findIndex((s) => isSamePhysicalStop(s?.stopId, boundaryStopId));
            if (boundaryIdx < 0) continue;

            const fromIdx = prevTrip.stops.findIndex((s) => isSamePhysicalStop(s?.stopId, originId));
            if (fromIdx < 0) continue;
            if (boundaryIdx <= fromIdx) continue;

            out.unshift(buildSyntheticLegFromTrip(prevTrip, fromIdx, boundaryIdx));
            prepended = true;
            break;
        }

        if (!prepended) break;
    }

    return out;
};

const buildPlanDetailBlocks = async ({ plan, legsOverride, serviceDay, originStationId }) => {
    const blocks = [];
    const rawLegs = Array.isArray(legsOverride) ? legsOverride : (Array.isArray(plan?.legs) ? plan.legs : []);
    const legs = Array.isArray(legsOverride)
        ? rawLegs
        : await expandLegsForDisplay({ legs: rawLegs, serviceDay, originStationId });
    const resolved = [];

    for (let i = 0; i < legs.length; i += 1) {
        const leg = legs[i];
        const trip = await resolveTripForLeg({ leg, serviceDay });
        resolved.push({ leg, trip });
    }

    for (let i = 0; i < resolved.length; i += 1) {
        const { leg, trip } = resolved[i];
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

        if (blocks.length && rows.length) {
            const prev = blocks[blocks.length - 1];
            if (prev?.kind === 'ride' && Array.isArray(prev.rows) && prev.rows.length) {
                const prevLastId = normalizeText(prev.rows[prev.rows.length - 1]?.stationId || '');
                const currFirstId = normalizeText(rows[0]?.stationId || '');
                const sameStop = prevLastId && currFirstId && (
                    prevLastId === currFirstId ||
                    (plannerState.groupByStop.get(prevLastId) instanceof Set && plannerState.groupByStop.get(prevLastId).has(currFirstId))
                );
                if (sameStop) rows.shift();
            }
        }

        blocks.push({
            kind: 'ride',
            lineName: normalizeText(lineMeta?.name || leg?.lineId),
            lineDisplayName: buildLineDescriptorText(lineMeta),
            lineColor: lineMeta?.color || null,
            typeName: normalizeText(leg?.typeName || trip?.typeName || '普通'),
            typeColor: normalizeText(leg?.typeColor || trip?.typeColor || '') || null,
            rows
        });

        const next = resolved[i + 1] || null;
        if (!next) continue;

        const through = (trip && next.trip)
            ? isThroughLegPair({
                currentLeg: leg,
                nextLeg: next.leg,
                currentTrip: trip,
                nextTrip: next.trip
            })
            : isThroughLegPairByMeta({ currentLeg: leg, nextLeg: next.leg });
        if (!through) {
            blocks.push({ kind: 'transfer' });
        }
    }
    return blocks;
};

function buildStationIcon(isTransfer) {
    const wrap = el('span', 'search-result-icon');
    const dot = el('span', 'search-result-icon--station');
    const border = isTransfer ? 4 : 0.5;
    const size = isTransfer ? 18 : 12;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderWidth = `${border}px`;
    wrap.appendChild(dot);
    return wrap;
}

export function mountTravelSearchUI() {
    if (document.querySelector('.journey-ui')) {
        return window.TokyoRailJourneyUI;
    }

    const root = el('div', 'journey-ui is-collapsed');

    const fab = el('button', 'journey-fab', { type: 'button', 'aria-label': '行程搜索' });
    const fabIcon = el('img', 'journey-fab-icon', { alt: '' });
    {
        const candidates = ['./icons/travel.svg', '/icons/travel.svg', './icons/search.svg', '/icons/search.svg'];
        let idx = 0;
        fabIcon.src = candidates[idx];
        fabIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) fabIcon.src = candidates[idx];
        });
    }
    fab.appendChild(fabIcon);

    const bar = el('div', 'journey-bar');
    const originWrap = el('div', 'journey-input-wrap');
    const originInput = el('input', 'journey-input journey-input-origin', {
        type: 'search',
        placeholder: '起点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const originMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择起点站' });
    const originMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    {
        const candidates = ['./icons/map-select.svg', '/icons/map-select.svg'];
        let idx = 0;
        originMapPickIcon.src = candidates[idx];
        originMapPickIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) originMapPickIcon.src = candidates[idx];
        });
    }
    originMapPickBtn.appendChild(originMapPickIcon);
    originWrap.appendChild(originInput);
    originWrap.appendChild(originMapPickBtn);

    const divider = el('button', 'journey-divider', {
        type: 'button',
        'aria-label': '切换起点和终点'
    });
    const dividerIcon = el('img', 'journey-divider-icon', { alt: '' });
    {
        const candidates = ['./icons/change-dirc.svg', '/icons/change-dirc.svg'];
        let idx = 0;
        dividerIcon.src = candidates[idx];
        dividerIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) dividerIcon.src = candidates[idx];
        });
    }
    divider.appendChild(dividerIcon);

    const destinationWrap = el('div', 'journey-input-wrap');
    const destinationInput = el('input', 'journey-input journey-input-destination', {
        type: 'search',
        placeholder: '终点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const destinationMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择终点站' });
    const destinationMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    {
        const candidates = ['./icons/map-select.svg', '/icons/map-select.svg'];
        let idx = 0;
        destinationMapPickIcon.src = candidates[idx];
        destinationMapPickIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) destinationMapPickIcon.src = candidates[idx];
        });
    }
    destinationMapPickBtn.appendChild(destinationMapPickIcon);
    destinationWrap.appendChild(destinationInput);
    destinationWrap.appendChild(destinationMapPickBtn);

    const closeBtn = el('button', 'journey-close-btn', {
        type: 'button',
        'aria-label': '关闭行程搜索并清空'
    });
    const closeIcon = el('img', 'journey-close-icon', { alt: '' });
    {
        const candidates = ['./icons/x.svg', '/icons/x.svg'];
        let idx = 0;
        closeIcon.src = candidates[idx];
        closeIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) closeIcon.src = candidates[idx];
        });
    }
    closeBtn.appendChild(closeIcon);

    bar.appendChild(originWrap);
    bar.appendChild(divider);
    bar.appendChild(destinationWrap);
    bar.appendChild(closeBtn);

    const results = el('div', 'journey-results is-hidden');
    const list = el('ul', 'search-results-list');
    results.appendChild(list);

    const planResults = el('div', 'journey-plan-results is-hidden');
    const planList = el('ul', 'journey-plan-list');
    planResults.appendChild(planList);

    const tripPopover = el('div', 'journey-trip-popover is-hidden');
    const tripPopoverHeader = el('div', 'journey-trip-header');
    const tripPopoverTitle = el('div', 'journey-trip-title');
    const tripCaptureBtn = el('button', 'journey-trip-capture-btn', { type: 'button', 'aria-label': '截图' });
    const tripCaptureIcon = el('img', 'journey-trip-capture-icon', { alt: '' });
    {
        const candidates = ['./icons/camera.svg', '/icons/camera.svg'];
        let idx = 0;
        tripCaptureIcon.src = candidates[idx];
        tripCaptureIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) tripCaptureIcon.src = candidates[idx];
        });
    }
    tripCaptureBtn.appendChild(tripCaptureIcon);
    tripPopoverHeader.appendChild(tripPopoverTitle);
    tripPopoverHeader.appendChild(tripCaptureBtn);
    const tripPopoverBody = el('div', 'journey-trip-body');
    tripPopover.appendChild(tripPopoverHeader);
    tripPopover.appendChild(tripPopoverBody);
    document.body.appendChild(tripPopover);

    root.appendChild(fab);
    root.appendChild(bar);
    root.appendChild(results);
    root.appendChild(planResults);
    document.body.appendChild(root);

    let activeField = 'origin';
    let selectedOriginId = '';
    let selectedDestinationId = '';
    let composingOrigin = false;
    let composingDestination = false;
    let mapPickTarget = null; // 'origin' | 'destination' | null
    let lastPlanComputeKey = '';
    let planComputeToken = 0;
    let popoverHideTimer = null;
    let pinnedTripPopoverKey = '';
    let planPreviewHideTimer = null;
    let activePlanPreviewKey = '';
    let pinnedPlanPreviewKey = '';
    let planPreviewRequestToken = 0;

    try {
        window.__TokyoRailJourneyMapPickActive = false;
        window.__TokyoRailSuppressStationSelectionUntil = 0;
    } catch {
        // ignore
    }

    const suppressStationSelectionOnce = (ms = 700) => {
        try {
            const now = Date.now();
            const until = now + Math.max(0, Number(ms) || 0);
            const prev = Number(window.__TokyoRailSuppressStationSelectionUntil) || 0;
            window.__TokyoRailSuppressStationSelectionUntil = Math.max(prev, until);
        } catch {
            // ignore
        }
    };

    const getMapInstance = () => {
        try {
            return window.__TokyoRailMap || null;
        } catch {
            return null;
        }
    };

    const setMapPickTarget = (target) => {
        mapPickTarget = target === 'origin' || target === 'destination' ? target : null;
        originMapPickBtn.classList.toggle('is-active', mapPickTarget === 'origin');
        destinationMapPickBtn.classList.toggle('is-active', mapPickTarget === 'destination');
        try {
            window.__TokyoRailJourneyMapPickActive = !!mapPickTarget;
        } catch {
            // ignore
        }
    };

    const resolveStationByName = async (name) => {
        const q = normalizeText(name);
        if (!q) return null;
        const hits = await searchRailEntities(q, { limit: 20, allowedTypes: new Set(['station']) });
        const list = Array.isArray(hits) ? hits : [];
        const exact = list.find((x) => normalizeText(x?.text) === q);
        return exact || list[0] || null;
    };

    const applyPickedStation = async ({ target, stationId, stationName }) => {
        suppressStationSelectionOnce(900);
        const key = target === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;

        let resolvedId = normalizeText(stationId);
        let resolvedName = normalizeText(stationName);

        if (!resolvedId && resolvedName) {
            const hit = await resolveStationByName(resolvedName);
            if (hit) {
                resolvedId = normalizeText(hit.id);
                if (!resolvedName) resolvedName = normalizeText(hit.text);
            }
        }

        if (!resolvedName && resolvedId) {
            const byId = await searchRailEntities(resolvedId, { limit: 10, allowedTypes: new Set(['station']) });
            const list = Array.isArray(byId) ? byId : [];
            const hit = list.find((x) => normalizeText(x?.id) === resolvedId) || list[0] || null;
            if (hit) resolvedName = normalizeText(hit.text);
        }

        if (!resolvedName && !resolvedId) return;

        input.value = resolvedName || input.value;
        input.dataset.stationId = resolvedId || '';
        if (key === 'origin') selectedOriginId = resolvedId || '';
        else selectedDestinationId = resolvedId || '';

        setMapPickTarget(null);
        results.classList.add('is-hidden');
        maybeComputePlans();
    };

    // 供外部 UI（如 panel header 下拉）直接写入起终点。
    // 注意：规划时优先使用 selectedOriginId/selectedDestinationId，因此必须同步更新它们。
    const applyExternalStationSelection = (field, stationId, stationName, options = {}) => {
        const key = field === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;

        const resolvedId = normalizeText(stationId);
        const resolvedName = normalizeText(stationName);
        if (!resolvedId && !resolvedName) return false;

        if (options?.expand !== false) {
            try { root.classList.remove('is-collapsed'); } catch {}
        }

        input.value = resolvedName || input.value;
        input.dataset.stationId = resolvedId || '';
        if (key === 'origin') selectedOriginId = resolvedId || '';
        else selectedDestinationId = resolvedId || '';

        // 外部写入也应退出 map pick 状态
        try { setMapPickTarget(null); } catch {}
        results.classList.add('is-hidden');

        if (options?.recompute !== false) {
            lastPlanComputeKey = '';
            maybeComputePlans();
        }
        return true;
    };

    const handleMapStationPick = async (eventLike) => {
        if (!mapPickTarget) return;

        const map = getMapInstance();
        if (!map) return;

        const point = eventLike?.point;
        const fromFeatures = (() => {
            const list = Array.isArray(eventLike?.features) ? eventLike.features : [];
            if (list.length) return list;
            if (!point) return [];
            try {
                return map.queryRenderedFeatures(point, { layers: ['stations-layer'] }) || [];
            } catch {
                return [];
            }
        })();

        const feature = fromFeatures[0];
        const props = feature?.properties || {};
        const stationId = normalizeText(props?.id || feature?.id || '');
        const stationName = normalizeText(props?.name_zh || props?.name || props?.name_ja || '');
        if (!stationId && !stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId,
            stationName
        });
    };

    const onDocumentClickCapture = async (evt) => {
        if (!mapPickTarget) return;
        const target = evt?.target;
        if (!(target instanceof Element)) return;
        const labelEl = target.closest('.station-label');
        if (!labelEl) return;

        const stationName = normalizeText(labelEl.textContent || '');
        if (!stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId: '',
            stationName
        });
    };

    let mapPickHookBound = false;
    const ensureMapPickHook = () => {
        if (mapPickHookBound) return;
        const map = getMapInstance();
        if (!map || typeof map.on !== 'function') return;
        map.on('click', (e) => {
            handleMapStationPick(e);
        });
        mapPickHookBound = true;
    };

    const mapPickBindTimer = window.setInterval(() => {
        ensureMapPickHook();
        if (mapPickHookBound) window.clearInterval(mapPickBindTimer);
    }, 400);

    const getActiveInput = () => (activeField === 'destination' ? destinationInput : originInput);

    const clearPlanList = () => {
        try {
            const actions = window?.TokyoRailSearchMapActions;
            actions?.clearTripPathPreview?.();
        } catch {
            // ignore
        }
        activePlanPreviewKey = '';
        pinnedPlanPreviewKey = '';
        planPreviewRequestToken += 1;
        if (planPreviewHideTimer) {
            window.clearTimeout(planPreviewHideTimer);
            planPreviewHideTimer = null;
        }
        while (planList.firstChild) planList.removeChild(planList.firstChild);
        hideTripPopover();
    };

    const clearTripPopoverBody = () => {
        while (tripPopoverBody.firstChild) tripPopoverBody.removeChild(tripPopoverBody.firstChild);
    };

    const hideTripPopover = () => {
        tripPopover.classList.add('is-hidden');
        clearTripPopoverBody();
        pinnedTripPopoverKey = '';
    };

    const scheduleHideTripPopover = () => {
        if (pinnedTripPopoverKey) return;
        if (popoverHideTimer) window.clearTimeout(popoverHideTimer);
        popoverHideTimer = window.setTimeout(() => {
            hideTripPopover();
        }, 120);
    };

    const cancelHideTripPopover = () => {
        if (!popoverHideTimer) return;
        window.clearTimeout(popoverHideTimer);
        popoverHideTimer = null;
    };

    const cancelHidePlanPreview = () => {
        if (!planPreviewHideTimer) return;
        window.clearTimeout(planPreviewHideTimer);
        planPreviewHideTimer = null;
    };

    const clearJourneyPlanPreview = ({ force = false } = {}) => {
        if (!force && pinnedPlanPreviewKey) return;
        cancelHidePlanPreview();
        if (!activePlanPreviewKey && !force) return;
        try {
            window?.TokyoRailSearchMapActions?.clearTripPathPreview?.();
        } catch {
            // ignore
        }
        activePlanPreviewKey = '';
    };

    const scheduleClearJourneyPlanPreview = (delayMs = 120) => {
        cancelHidePlanPreview();
        planPreviewHideTimer = window.setTimeout(() => {
            planPreviewHideTimer = null;
            clearJourneyPlanPreview({ force: false });
        }, Math.max(0, Number(delayMs) || 0));
    };

    const buildTripPreviewPayloadFromDisplayPlan = async ({ row, displayPlan }) => {
        const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
        if (!legs.length) return null;

        const segments = [];
        for (const leg of legs) {
            const lineId = normalizeText(leg?.lineId);
            if (!lineId) continue;

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
                stationIds: compactIds
            });
        }

        if (!segments.length) return null;

        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const firstLeg = legs[0] || null;

        return {
            tripKey: normalizeText(firstLeg?.tripKey || `${toHHMM(displayPlan?.firstDepMs)}-${toHHMM(displayPlan?.arrivalMs)}`),
            selectedLineId: normalizeText(firstSeg?.lineId),
            mainLineId: normalizeText(firstSeg?.lineId),
            originStationId: normalizeText(row?.originStationId || firstSeg?.stationIds?.[0]),
            mainTerminalStationId: normalizeText(firstSeg?.stationIds?.[firstSeg.stationIds.length - 1]),
            terminalStationId: normalizeText(lastSeg?.stationIds?.[lastSeg.stationIds.length - 1]),
            typeName: normalizeText(firstLeg?.typeName || '普通'),
            hasNt: false,
            fitMode: 'none',
            segments
        };
    };

    const applyJourneyPlanPreview = async ({ row, previewKey, pin = false } = {}) => {
        const actions = window?.TokyoRailSearchMapActions;
        if (!actions || typeof actions.previewTripPath !== 'function') return;

        const token = ++planPreviewRequestToken;
        const displayPlan = await getDisplayPlanForRow(row);
        const payload = await buildTripPreviewPayloadFromDisplayPlan({ row, displayPlan });
        if (token !== planPreviewRequestToken) return;
        if (!payload) return;

        try {
            actions.previewTripPath(payload, { clearBefore: true, fitMode: 'none' });
        } catch {
            return;
        }

        activePlanPreviewKey = normalizeText(previewKey);
        if (pin) pinnedPlanPreviewKey = activePlanPreviewKey;
    };

    const getDisplayPlanForRow = async (row) => {
        if (!row || !row.plan) return null;
        if (row.__displayPlan) return row.__displayPlan;

        const expandedLegs = await expandLegsForDisplay({
            legs: row?.plan?.legs || [],
            serviceDay: row?.serviceDay,
            originStationId: row?.originStationId
        });

        const firstLeg = expandedLegs[0] || null;
        const lastLeg = expandedLegs[expandedLegs.length - 1] || null;

        const firstDepMs = Number.isFinite(Number(firstLeg?.depMs))
            ? Number(firstLeg.depMs)
            : (Number.isFinite(Number(row.plan.firstDepMs)) ? Number(row.plan.firstDepMs) : null);
        const arrivalMs = Number.isFinite(Number(lastLeg?.arrMs))
            ? Number(lastLeg.arrMs)
            : (Number.isFinite(Number(row.plan.arrivalMs)) ? Number(row.plan.arrivalMs) : null);

        const baseDepartureMs = Number.isFinite(Number(row?.baseDepartureMs))
            ? Number(row.baseDepartureMs)
            : (Number.isFinite(Number(row?.plan?.baseDepartureMs)) ? Number(row.plan.baseDepartureMs) : null);

        const durationMs = (Number.isFinite(baseDepartureMs) && Number.isFinite(arrivalMs))
            ? (arrivalMs - baseDepartureMs)
            : ((Number.isFinite(firstDepMs) && Number.isFinite(arrivalMs)) ? (arrivalMs - firstDepMs) : row.plan.durationMs);

        let transfers = 0;
        for (let i = 0; i < expandedLegs.length - 1; i += 1) {
            if (!isThroughLegPairByMeta({ currentLeg: expandedLegs[i], nextLeg: expandedLegs[i + 1] })) transfers += 1;
        }

        row.__displayPlan = {
            ...row.plan,
            legs: expandedLegs,
            firstDepMs: Number.isFinite(firstDepMs) ? firstDepMs : row.plan.firstDepMs,
            arrivalMs: Number.isFinite(arrivalMs) ? arrivalMs : row.plan.arrivalMs,
            durationMs,
            transfers
        };
        return row.__displayPlan;
    };

    const renderTripDetailBody = async ({ row }) => {
        clearTripPopoverBody();
        const displayPlan = await getDisplayPlanForRow(row);
        const blocks = await buildPlanDetailBlocks({
            plan: row.plan,
            legsOverride: displayPlan?.legs,
            serviceDay: row.serviceDay,
            originStationId: row.originStationId
        });
        if (!blocks.length) {
            tripPopoverBody.appendChild(el('div', 'journey-trip-empty', { text: '无详细停站信息' }));
            return;
        }

        for (const block of blocks) {
            if (block.kind === 'transfer') {
                const transferRow = el('div', 'journey-trip-transfer-row');
                transferRow.appendChild(el('span', 'journey-trip-transfer-label', { text: '换乘' }));
                tripPopoverBody.appendChild(transferRow);
                continue;
            }

            const note = el('div', 'journey-trip-note-row');
            const noteDot = el('span', 'journey-trip-note-dot');
            if (block.lineColor) noteDot.style.background = String(block.lineColor);
            const noteLine = el('span', 'journey-trip-note-line', { text: block.lineDisplayName || block.lineName });
            if (block.lineColor) noteLine.style.color = String(block.lineColor);
            const noteType = el('span', 'journey-trip-note-type', { text: block.typeName });
            if (block.typeColor) noteType.style.color = String(block.typeColor);
            note.appendChild(noteDot);
            note.appendChild(noteLine);
            note.appendChild(noteType);
            tripPopoverBody.appendChild(note);

            for (let i = 0; i < block.rows.length; i += 1) {
                const s = block.rows[i];
                const rowEl = el('div', 'journey-trip-row');
                rowEl.appendChild(el('div', 'journey-trip-station', { text: s.stationName || s.stationId }));

                const arrCell = el('div', 'journey-trip-time journey-trip-arrive');
                if (i > 0 && s.arrText) {
                    const arr = el('span', 'journey-trip-time-arrive', { text: s.arrText });
                    arrCell.appendChild(arr);
                }
                rowEl.appendChild(arrCell);

                const depCell = el('div', 'journey-trip-time journey-trip-depart');
                if (i < block.rows.length - 1 && s.depText) {
                    const dep = el('span', 'journey-trip-time-depart', { text: s.depText });
                    depCell.appendChild(dep);
                }
                rowEl.appendChild(depCell);
                tripPopoverBody.appendChild(rowEl);
            }
        }
    };

    const positionTripPopover = (anchorEl) => {
        const rect = anchorEl.getBoundingClientRect();
        const maxW = 360;
        tripPopover.style.width = `${maxW}px`;
        tripPopover.style.maxWidth = `${maxW}px`;
        tripPopover.classList.remove('is-hidden');

        const popRect = tripPopover.getBoundingClientRect();
        const gap = 10;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;

        let left = rect.right + gap;
        if (left + popRect.width > vw - 8) {
            left = Math.max(8, rect.left - gap - popRect.width);
        }

        let top = rect.top;
        if (top + popRect.height > vh - 8) {
            top = Math.max(8, vh - popRect.height - 8);
        }
        top = Math.max(8, top);

        tripPopover.style.left = `${Math.round(left)}px`;
        tripPopover.style.top = `${Math.round(top)}px`;
    };

    const showTripPopover = async ({ anchorEl, row }) => {
        cancelHideTripPopover();
        const displayPlan = await getDisplayPlanForRow(row);
        const planLegs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : (Array.isArray(row?.plan?.legs) ? row.plan.legs : []);
        const fallbackOriginId = normalizeText(planLegs[0]?.fromStop || '');
        const fallbackDestinationId = normalizeText(planLegs[planLegs.length - 1]?.toStop || '');
        const originStationId = normalizeText(row?.originStationId || fallbackOriginId);
        const destinationStationId = normalizeText(row?.destinationStationId || fallbackDestinationId);
        const originZh = getStationNameById(originStationId) || normalizeText(row?.originName || originStationId);
        const destinationZh = getStationNameById(destinationStationId) || normalizeText(row?.destinationName || destinationStationId);
        tripPopoverTitle.textContent = `${originZh} → ${destinationZh}`;
        await renderTripDetailBody({ row });
        positionTripPopover(anchorEl);
    };

    const showPlanMessage = (message) => {
        clearPlanList();
        const li = document.createElement('li');
        li.className = 'journey-plan-item';
        const empty = el('div', 'journey-plan-empty', { text: message });
        li.appendChild(empty);
        planList.appendChild(li);
        planResults.classList.remove('is-hidden');
    };

    const hidePlanResultsIfEmptyInputs = () => {
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        clearPlanList();
        planResults.classList.add('is-hidden');
    };

    const appendJourneyPath = async (container, legs) => {
        for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i];
            const lineMeta = await getLineMeta(leg.lineId);

            const lineSpan = el('span', 'journey-plan-line', { text: lineMeta?.name || leg.lineId || '线路' });
            if (lineMeta?.color) lineSpan.style.color = String(lineMeta.color);
            container.appendChild(lineSpan);

            const typeSpan = el('span', 'journey-plan-type', { text: `${normalizeText(leg.typeName) || '普通'}` });
            if (leg?.typeColor) typeSpan.style.color = String(leg.typeColor);
            container.appendChild(typeSpan);

            if (i < legs.length - 1) {
                const through = isThroughLegPairByMeta({ currentLeg: leg, nextLeg: legs[i + 1] });
                const wrap = el('span', 'journey-plan-arrow');
                const icon = el('img', 'journey-plan-arrow-icon', { alt: '' });
                {
                    const candidates = through
                        ? ['./icons/arrows.svg', '/icons/arrows.svg']
                        : ['./icons/arrow-right.svg', '/icons/arrow-right.svg'];
                    let idx = 0;
                    icon.src = candidates[idx];
                    icon.addEventListener('error', () => {
                        idx += 1;
                        if (idx < candidates.length) icon.src = candidates[idx];
                    });
                }
                wrap.appendChild(icon);
                container.appendChild(wrap);
            }
        }
    };

    const renderPlanResults = async (rows) => {
        clearPlanList();
        if (!rows.length) {
            showPlanMessage('无可用路线');
            return;
        }

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const displayPlan = await getDisplayPlanForRow(row);
            const li = document.createElement('li');
            li.className = 'journey-plan-item';

            const tag = el('div', 'journey-plan-tag', { text: row.label });
            li.appendChild(tag);

            const head = el('div', 'journey-plan-head');
            head.appendChild(el('span', 'journey-plan-duration', { text: formatDuration(displayPlan?.durationMs) }));
            head.appendChild(el('span', 'journey-plan-arrive', { text: `${toHHMM(displayPlan?.arrivalMs)}到达` }));
            li.appendChild(head);

            const path = el('div', 'journey-plan-path');
            await appendJourneyPath(path, displayPlan?.legs || []);
            li.appendChild(path);

            if (i < rows.length - 1) {
                li.appendChild(el('div', 'journey-plan-sep'));
            }

            li.addEventListener('mouseenter', () => {
                cancelHidePlanPreview();
                const previewKey = `row-${i}`;
                if (!pinnedTripPopoverKey || pinnedTripPopoverKey === previewKey) {
                    showTripPopover({ anchorEl: li, row });
                }
                if (pinnedPlanPreviewKey && pinnedPlanPreviewKey !== previewKey) return;
                applyJourneyPlanPreview({ row, previewKey, pin: false });
            });
            li.addEventListener('mouseleave', () => {
                const previewKey = `row-${i}`;
                if (pinnedTripPopoverKey !== previewKey) {
                    scheduleHideTripPopover();
                }
                if (!pinnedPlanPreviewKey) {
                    scheduleClearJourneyPlanPreview(120);
                }
            });

            li.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                cancelHidePlanPreview();
                const previewKey = `row-${i}`;

                if (pinnedTripPopoverKey === previewKey) {
                    pinnedTripPopoverKey = '';
                    scheduleHideTripPopover();
                } else {
                    pinnedTripPopoverKey = previewKey;
                    showTripPopover({ anchorEl: li, row });
                }

                if (pinnedPlanPreviewKey === previewKey) {
                    pinnedPlanPreviewKey = '';
                    clearJourneyPlanPreview({ force: true });
                    return;
                }

                pinnedPlanPreviewKey = previewKey;
                applyJourneyPlanPreview({ row, previewKey, pin: true });
            });

            planList.appendChild(li);
        }

        planResults.classList.remove('is-hidden');
    };

    const readServiceDayFromPanel = () => {
        const active = document.querySelector('.panel-day-seg button.is-active[data-day]');
        const day = normalizeText(active?.getAttribute?.('data-day') || '');
        return day === 'SaturdayHoliday' ? 'SaturdayHoliday' : 'Weekday';
    };

    const readDepartureBase = () => {
        const now = new Date();
        const serviceDayStartMs = getServiceDayStartMs(now);
        const input = document.querySelector('.settings-time-input');
        const hhmm = normalizeHHMM(input?.value || '') || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const offset = hhmmToOffsetMinutes(hhmm);
        const depMs = Number.isFinite(offset) ? serviceDayStartMs + offset * 60000 : now.getTime();
        return { serviceDayStartMs, departureMs: depMs };
    };

    const collectJourneyCandidates = async ({ sourceStops, destinationStops, serviceDay, baseDepartureMs }) => {
        const offsetsMin = [0, 5, 10, 15, 20, 30, 45, 60, 75, 90, 105, 120];

        const runWithMaxRounds = async (maxRounds) => {
            const candidates = [];
            for (const addMin of offsetsMin) {
                const depMs = baseDepartureMs + addMin * 60000;
                const runResult = await runRaptorOnce({
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
                if (candidates.length >= 14) break;
            }
            return candidates;
        };

        let candidates = await runWithMaxRounds(4);
        if (!candidates.length) {
            candidates = await runWithMaxRounds(7);
        }

        return dedupePlans(candidates).sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs);
    };

    const maybeComputePlans = async () => {
        const originId = normalizeText(selectedOriginId || originInput.dataset.stationId || '');
        const destinationId = normalizeText(selectedDestinationId || destinationInput.dataset.stationId || '');

        if (!originId || !destinationId) {
            hidePlanResultsIfEmptyInputs();
            return;
        }
        if (originId === destinationId) {
            showPlanMessage('起点与终点相同');
            return;
        }

        const serviceDay = readServiceDayFromPanel();
        const originName = getStationNameById(originId) || normalizeText(originInput.value) || originId;
        const destinationName = getStationNameById(destinationId) || normalizeText(destinationInput.value) || destinationId;
        const { departureMs } = readDepartureBase();
        const key = `${originId}||${destinationId}||${serviceDay}||${Math.floor(departureMs / 60000)}`;
        if (key === lastPlanComputeKey) return;
        lastPlanComputeKey = key;

        const token = ++planComputeToken;
        showPlanMessage('正在计算路线...');

        await ensurePlannerStaticData();

        let sourceStops = getGroupStops(originId);
        sourceStops.add(originId);
        sourceStops = filterNearbyStops(originId, sourceStops, 800);
        const destinationStops = getGroupStops(destinationId);
        if (!sourceStops.size || !destinationStops.size || sameSet(sourceStops, destinationStops)) {
            showPlanMessage('未找到有效起终点');
            return;
        }

        const plans = await collectJourneyCandidates({
            sourceStops,
            destinationStops,
            serviceDay,
            baseDepartureMs: departureMs
        });

        if (token !== planComputeToken) return;
        if (!plans.length) {
            showPlanMessage('无可用路线');
            return;
        }

        const picked = pickPlanBuckets(plans).map((x) => ({
            ...x,
            serviceDay,
            baseDepartureMs: departureMs,
            originStationId: originId,
            destinationStationId: destinationId,
            originName,
            destinationName
        }));
        await renderPlanResults(picked);
    };

    const clearList = () => {
        while (list.firstChild) list.removeChild(list.firstChild);
    };

    const expand = () => {
        if (!root.classList.contains('is-collapsed')) return;
        root.classList.remove('is-collapsed');
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
    };

    const collapse = () => {
        root.classList.add('is-collapsed');
        results.classList.add('is-hidden');
        hideTripPopover();
        clearJourneyPlanPreview({ force: true });
        pinnedPlanPreviewKey = '';
        if (!mapPickTarget) hidePlanResultsIfEmptyInputs();
    };

    const clearJourneyInputsAndCollapse = () => {
        originInput.value = '';
        destinationInput.value = '';
        originInput.dataset.stationId = '';
        destinationInput.dataset.stationId = '';
        selectedOriginId = '';
        selectedDestinationId = '';
        lastPlanComputeKey = '';
        setMapPickTarget(null);
        hideTripPopover();
        clearPlanList();
        planResults.classList.add('is-hidden');
        results.classList.add('is-hidden');
        collapse();
    };

    const collapseIfBothEmpty = () => {
        if (mapPickTarget) return;
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        collapse();
    };

    const renderEmpty = (text) => {
        clearList();
        const li = document.createElement('li');
        li.appendChild(el('div', 'search-empty', { text }));
        list.appendChild(li);
        results.classList.remove('is-hidden');
    };

    const renderStationResults = async (items) => {
        clearList();
        if (!items.length) {
            renderEmpty('暂无站点结果');
            return;
        }

        for (const item of items) {
            const li = document.createElement('li');
            const row = el('div', 'search-result-item');
            const icon = buildStationIcon(item?.isTransfer === true);
            const text = el('div', 'search-result-text');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = String(item?.text ?? '');
            text.appendChild(nameSpan);

            const lineMetas = await getLineMetaByIds(item?.lineIds);
            if (Array.isArray(lineMetas) && lineMetas.length) {
                const wrap = document.createElement('span');
                wrap.style.fontSize = '11px';
                wrap.appendChild(document.createTextNode('  '));

                lineMetas.forEach((meta, idx) => {
                    if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                    const seg = document.createElement('span');
                    seg.textContent = String(meta?.name || '');
                    if (meta?.color) seg.style.color = String(meta.color);
                    wrap.appendChild(seg);
                });

                text.appendChild(wrap);
            }

            row.appendChild(icon);
            row.appendChild(text);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();

                const input = getActiveInput();
                input.value = String(item?.text ?? '');
                input.dataset.stationId = String(item?.id ?? '');

                if (activeField === 'origin') selectedOriginId = String(item?.id ?? '');
                else selectedDestinationId = String(item?.id ?? '');

                results.classList.add('is-hidden');
                maybeComputePlans();
            });

            li.appendChild(row);
            list.appendChild(li);
        }

        results.classList.remove('is-hidden');
    };

    const refresh = async () => {
        const input = getActiveInput();
        const q = normalizeText(input.value);
        if (!q) {
            clearList();
            results.classList.add('is-hidden');
            return;
        }

        const stationItems = await searchRailEntities(q, { limit: 30, allowedTypes: new Set(['station']) });
        await renderStationResults(Array.isArray(stationItems) ? stationItems : []);
    };

    const bindInput = (input, key) => {
        const isOrigin = key === 'origin';

        input.addEventListener('focus', () => {
            activeField = key;
            expand();
            refresh();
        });

        input.addEventListener('compositionstart', () => {
            if (isOrigin) composingOrigin = true;
            else composingDestination = true;
        });

        input.addEventListener('compositionend', () => {
            if (isOrigin) composingOrigin = false;
            else composingDestination = false;
            refresh();
        });

        input.addEventListener('input', () => {
            const composing = isOrigin ? composingOrigin : composingDestination;
            if (composing) return;

            if (isOrigin) selectedOriginId = '';
            else selectedDestinationId = '';

            lastPlanComputeKey = '';

            refresh();
        });

        input.addEventListener('search', () => {
            refresh();
        });
    };

    bindInput(originInput, 'origin');
    bindInput(destinationInput, 'destination');

    root.addEventListener('mouseenter', () => {
        expand();
    });

    root.addEventListener('mouseleave', () => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        collapseIfBothEmpty();
    });

    fab.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    fab.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    bar.addEventListener('pointerdown', () => {
        expand();
    });

    const mapEl = document.getElementById('map');
    const shouldIgnoreTarget = (target) => {
        if (!target || !(target instanceof Element)) return false;
        if (root.contains(target)) return true;
        if (target.closest('.search-ui')) return true;
        if (target.closest('.RW-wrapper')) return true;
        if (target.closest('.maplibregl-popup')) return true;
        if (target.closest('.maplibregl-ctrl')) return true;
        return false;
    };

    const onMapPress = (evt) => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        const target = evt?.target;
        if (shouldIgnoreTarget(target)) return;
        if (!mapEl || !target || !(target instanceof Node) || !mapEl.contains(target)) return;
        results.classList.add('is-hidden');
        collapseIfBothEmpty();
    };

    const armMapPick = (target) => {
        activeField = target === 'destination' ? 'destination' : 'origin';
        expand();
        setMapPickTarget(activeField);
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
        ensureMapPickHook();
    };

    const swapOriginDestination = () => {
        const prevOriginText = normalizeText(originInput.value);
        const prevOriginId = normalizeText(selectedOriginId || originInput.dataset.stationId || '');
        const prevDestinationText = normalizeText(destinationInput.value);
        const prevDestinationId = normalizeText(selectedDestinationId || destinationInput.dataset.stationId || '');

        originInput.value = prevDestinationText;
        destinationInput.value = prevOriginText;

        originInput.dataset.stationId = prevDestinationId;
        destinationInput.dataset.stationId = prevOriginId;

        selectedOriginId = prevDestinationId;
        selectedDestinationId = prevOriginId;

        activeField = 'origin';
        setMapPickTarget(null);
        lastPlanComputeKey = '';

        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) {
            expand();
        }

        maybeComputePlans();
    };

    originMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    destinationMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    originMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('origin');
    });

    destinationMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('destination');
    });

    closeBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });
    closeBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        clearJourneyInputsAndCollapse();
    });

    divider.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    divider.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        swapOriginDestination();
    });

    originInput.addEventListener('keydown', (evt) => {
        if (evt?.key === 'Enter') {
            evt.preventDefault?.();
            maybeComputePlans();
        }
    });
    destinationInput.addEventListener('keydown', (evt) => {
        if (evt?.key === 'Enter') {
            evt.preventDefault?.();
            maybeComputePlans();
        }
    });

    const timeInput = document.querySelector('.settings-time-input');
    if (timeInput) {
        timeInput.addEventListener('input', () => {
            lastPlanComputeKey = '';
            maybeComputePlans();
        });
    }

    const dayButtons = document.querySelectorAll('.panel-day-seg button[data-day]');
    dayButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            lastPlanComputeKey = '';
            maybeComputePlans();
        });
    });

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
        document.addEventListener('pointerdown', onMapPress, true);
    } else {
        document.addEventListener('mousedown', onMapPress, true);
        document.addEventListener('touchstart', onMapPress, { capture: true, passive: true });
    }
    document.addEventListener('click', onDocumentClickCapture, true);

    tripPopover.addEventListener('mouseenter', () => {
        cancelHideTripPopover();
        cancelHidePlanPreview();
    });
    tripPopover.addEventListener('mouseleave', () => {
        if (!pinnedTripPopoverKey) {
            scheduleHideTripPopover();
        }
        if (!pinnedPlanPreviewKey) {
            scheduleClearJourneyPlanPreview(120);
        }
    });
    tripCaptureBtn.addEventListener('click', async (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        try {
            const h2c = window?.html2canvas;
            if (typeof h2c !== 'function') return;
            const canvas = await h2c(tripPopover, { backgroundColor: null, scale: 2 });
            const url = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `journey-detail-${Date.now()}.png`;
            a.click();
        } catch {
            // ignore
        }
    });

    const ui = {
        root,
        fab,
        originInput,
        destinationInput,
        setOriginStation: (stationId, stationName, options) => applyExternalStationSelection('origin', stationId, stationName, options),
        setDestinationStation: (stationId, stationName, options) => applyExternalStationSelection('destination', stationId, stationName, options),
        recompute: () => {
            lastPlanComputeKey = '';
            return maybeComputePlans();
        },
        getSelection() {
            return {
                originStationId: selectedOriginId,
                destinationStationId: selectedDestinationId,
                originText: normalizeText(originInput.value),
                destinationText: normalizeText(destinationInput.value)
            };
        }
    };

    window.TokyoRailJourneyUI = ui;
    return ui;
}

mountTravelSearchUI();
