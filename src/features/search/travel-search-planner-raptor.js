import { getLineMetaByIds } from './search.js';
import { getCachedJson } from '../../lib/fetch.js';

const SERVICE_DAY_BOUNDARY_HOUR = 3;
const INF_TIME = Number.POSITIVE_INFINITY;

import { getReachableStopsWithinMinutes as getReachableStopsWithinMinutesDijkstra } from './travel-search-planner-dijkstra.js';

export const getReachableStopsWithinMinutes = async (options) => {
    return getReachableStopsWithinMinutesDijkstra(options);
};

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
    if (h <= 0) return `${m}分钟`;
    return `${h}小时${m}分钟`;
};

export const plannerState = {
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

export const getDayTripMap = (serviceDay) => {
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
    const rootId = getTripCanonicalId(seedTrip);
    if (!rootId) return { throughRootTripId: '', chainTrips: [], chainTripsList: [] };

    const throughRootTripId = rootId;
    const MAX_HOPS = 128;
    const MAX_PATHS = 128;
    const allPaths = [];

    const dfs = async (current, path, seenInPath) => {
        if (!current || allPaths.length >= MAX_PATHS) return;
        const currentId = getTripCanonicalId(current);
        if (!currentId || seenInPath.has(currentId)) return;
        if (path.length >= MAX_HOPS) return;

        const nextPath = path.concat([
            {
                ...current,
                throughRootTripId,
                isThroughContinuation: path.length > 0,
                timetableFile: getTripFileNameByLineId(current?.lineId)
            }
        ]);
        const nextSeen = new Set(seenInPath);
        nextSeen.add(currentId);

        const refs = normalizeRefArray(current?.ntRefs);
        if (!refs.length) {
            allPaths.push(nextPath);
            return;
        }

        const currTimes = getTripStartEndTimes(current, serviceDayStartMs);
        let extended = false;

        for (const refId of refs) {
            // 直通链条动态按需加载，必须 await，确保同一轮次内原子完成。
            const candidate = await getParsedTripByTripId({ tripId: refId, serviceDay });
            if (!candidate) continue;

            const nextTimes = getTripStartEndTimes(candidate, serviceDayStartMs);
            if (!currTimes || !nextTimes) continue;
            if (Number.isFinite(currTimes.endArrMs) && Number.isFinite(nextTimes.startDepMs) && nextTimes.startDepMs < currTimes.endArrMs) {
                continue;
            }

            extended = true;
            await dfs(candidate, nextPath, nextSeen);
            if (allPaths.length >= MAX_PATHS) break;
        }

        if (!extended) allPaths.push(nextPath);
    };

    await dfs(seedTrip, [], new Set());

    // 去重：不同 nt 引用可能在后续重新汇聚为同一条路径。
    const uniqMap = new Map();
    for (const path of allPaths) {
        const sig = path.map((x) => getTripCanonicalId(x)).filter(Boolean).join('->');
        if (!sig || uniqMap.has(sig)) continue;
        uniqMap.set(sig, path);
    }
    const chainTripsList = Array.from(uniqMap.values());
    const chainTrips = chainTripsList[0] || [];

    const rootMap = getDayMergedThroughRootMap(serviceDay);
    for (const path of chainTripsList) {
        for (const item of path) {
            const id = getTripCanonicalId(item);
            if (id && throughRootTripId) rootMap.set(id, throughRootTripId);
        }
    }

    return { throughRootTripId, chainTrips, chainTripsList };
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

    return (linkedByRef || linkedByBaseTrip);
};

const toRadians = (deg) => (Number(deg) * Math.PI) / 180;

export const distanceMeters = (coordA, coordB) => {
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

export const shouldBlockJourneyPlanning = ({ originStationId, destinationStationId, originLngLat = null, destinationLngLat = null, maxDistanceMeters = 500 } = {}) => {
    const originId = normalizeText(originStationId);
    const destinationId = normalizeText(destinationStationId);
    if (!originId || !destinationId) return false;
    if (originId === destinationId || isSamePhysicalStop(originId, destinationId)) return true;

    const originCoords = Array.isArray(originLngLat) ? originLngLat : null;
    const destinationCoords = Array.isArray(destinationLngLat) ? destinationLngLat : null;
    if (!originCoords || !destinationCoords) return false;

    const dist = distanceMeters(originCoords, destinationCoords);
    return Number.isFinite(dist) && dist <= Number(maxDistanceMeters);
};

export const ensurePlannerStaticData = async () => {
    if (plannerState.staticReady) return;
    if (plannerState.staticLoadingPromise) return plannerState.staticLoadingPromise;

    plannerState.staticLoadingPromise = (async () => {
        const [railways, groups, trainTypes, stationList] = await Promise.all([
            getCachedJson('./data/railways.json'),
            getCachedJson('./data/station-groups.json'),
            getCachedJson('./data/train-types.json'),
            getCachedJson('./data/stations.json')
        ]);

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
            const surchargeRaw = title?.surcharge;
            const surcharge = surchargeRaw === true ? true : (surchargeRaw === false ? false : null);
            typeMetaById.set(id, { id, name, color: color || null, surcharge });
       }

        const stationNameById = new Map();
        const stationCoordById = new Map();
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

export const getNearbyStationsForJourneyPick = async ({ lngLat, maxMeters = 2000 } = {}) => {
    await ensurePlannerStaticData();

    const lng = Number(lngLat?.lng ?? lngLat?.[0]);
    const lat = Number(lngLat?.lat ?? lngLat?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];

    // 第一步：按照线路公司前缀去重
    const groupedByPrefix = new Map();
    for (const [stationId, coord] of plannerState.stationCoordById.entries()) {
        const dist = distanceMeters([lng, lat], coord);
        if (!Number.isFinite(dist) || dist > maxMeters) continue;

        const parts = String(stationId || '').split('.').map((x) => String(x || '').trim()).filter(Boolean);
        const prefix = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : (parts[0] || stationId);
        if (!prefix) continue;

        // 评估步行距离与分钟数（乘以 1.5 的经验系数，再按 3.5 km/h 计算）
        const effectiveMeters = dist * 1.5;
        const walkMinutes = Math.max(0, Math.round(effectiveMeters / (3500 / 60)));
        const next = { stationId, distanceMeters: dist, walkMinutes };
        const prev = groupedByPrefix.get(prefix);
        if (!prev || next.distanceMeters < prev.distanceMeters || (next.distanceMeters === prev.distanceMeters && next.stationId < prev.stationId)) {
            groupedByPrefix.set(prefix, next);
        }
    }

    // 第二步：按照换乘站组进行额外去重
    const groupedByTransferGroup = new Map();
    for (const candidate of groupedByPrefix.values()) {
        const transferGroup = plannerState.groupByStop?.get(candidate.stationId);
        let groupKey;
        
        if (transferGroup instanceof Set && transferGroup.size > 0) {
            // 创建换乘站组的唯一标识（所有站点ID的排序字符串）
            groupKey = Array.from(transferGroup).sort().join('|');
        } else {
            // 如果不在任何换乘站组中，使用stationId作为唯一标识
            groupKey = `single:${candidate.stationId}`;
        }

        const existing = groupedByTransferGroup.get(groupKey);
        if (!existing || candidate.distanceMeters < existing.distanceMeters || (candidate.distanceMeters === existing.distanceMeters && candidate.stationId < existing.stationId)) {
            groupedByTransferGroup.set(groupKey, candidate);
        }
    }

    return Array.from(groupedByTransferGroup.values()).sort((a, b) => a.distanceMeters - b.distanceMeters || a.stationId.localeCompare(b.stationId));
};

const parseStopId = (id) => {
    const parts = id.split('.');
    if (parts.length >= 3) {
        return { company: parts[0], line: parts[1], station: parts[2] };
    }
    return null;
};

export const getTransferPenaltyMs = (fromStopId, toStopId) => {

    const DEMON_STATION_GATE_PENALTY = {
    "Tokyo": 8.0,    
    "Shinjuku": 6.0, 
    "Shibuya": 6.0,    
    "Ikebukuro": 5.0, 
    "Yokohama": 5.0    
    };

    const a = normalizeText(fromStopId);
    const b = normalizeText(toStopId);

    if (!a || !b || a === b) return 0;

    const coordA = plannerState.stationCoordById?.get(a);
    const coordB = plannerState.stationCoordById?.get(b);

    if (!coordA || !coordB) return 3 * 60 * 1000;

    const dist = distanceMeters(coordA, coordB);
    if (!Number.isFinite(dist)) return 3 * 60 * 1000;

    const infoA = parseStopId(a);
    const infoB = parseStopId(b);
    const isSameCompany = infoA && infoB && infoA.company === infoB.company;

    if (!infoA || !infoB) {
        return (2.0 + (dist / 100) * 1.5) * 60 * 1000;
    }

    const demonPenaltyA = DEMON_STATION_GATE_PENALTY[infoA.station];
    const demonPenaltyB = DEMON_STATION_GATE_PENALTY[infoB.station];

    const demonGatePenalty = Math.max(demonPenaltyA || 0, demonPenaltyB || 0);
    const isDemonStation = demonGatePenalty > 0;

    let transferMinutes = 0;
    //同台
    if (isSameCompany) {
        if (dist <= 8) {
            transferMinutes = 2.0; 
        } else if (dist <= 35) {
            transferMinutes = 2.0 + (dist / 100) * 1.0; 
        } else if (dist <= 150) {
            transferMinutes = 2.0 + (dist / 100) * 1.2;
        } else {
            transferMinutes = 3.0 + (dist / 100) * 1.5; 
        }
    } else {
        const gatePenalty = isDemonStation ? demonGatePenalty : 3.0;
        
        if (dist <= 25) {
            transferMinutes = gatePenalty + 2.0; 
        } else {
            transferMinutes = gatePenalty + 2.0 + (dist / 100) * 1.8;
        }
    }
    //console.log(`Transfer from ${a} to ${b}: distance=${dist.toFixed(1)}m, isSameCompany=${isSameCompany}, isDemonStation=${isDemonStation}, transferMinutes=${transferMinutes.toFixed(2)}`);
    return transferMinutes * 60 * 1000;
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

const hasTripNmMarker = (tripLike) => {
    const nm = tripLike?.nm;
    if (nm == null) return false;
    if (typeof nm === 'string') return normalizeText(nm) !== '';
    if (Array.isArray(nm)) return nm.length > 0;
    if (typeof nm === 'object') return Object.keys(nm).length > 0;
    return Boolean(nm);
};

const isTypeIdSurcharge = (typeId) => {
    const id = normalizeText(typeId);
    if (!id) return false;

    const meta = plannerState.typeMetaById.get(id) || null;
    const explicit = meta?.surcharge;
    if (explicit === true) return true;

    const lower = id.toLowerCase();
    if (lower.includes('liner')) return true;
    if (lower.includes('limited') && explicit !== false) return true;

    return false;
};

const planContainsSurcharge = (plan) => {
    const legs = Array.isArray(plan?.legs) ? plan.legs : [];
    for (const leg of legs) {
        if (leg?.hasNm) return true;
        if (isTypeIdSurcharge(leg?.typeId)) return true;
    }
    return false;
};

export const loadTripsForLineAndDay = async ({ lineId, serviceDay, excludeSurchargeTypes = false }) => {
    const line = normalizeText(lineId);
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!line) return [];
    const cacheKey = `${line}||${day}||${excludeSurchargeTypes ? 'nosurcharge' : 'all'}`;
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
        const hasNm = hasTripNmMarker(trip);
        if (excludeSurchargeTypes && (hasNm || isTypeIdSurcharge(typeId))) continue;
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
            hasNm,
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

export const getParsedTripByTripId = async ({ tripId, serviceDay }) => {
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

const rideTripFromBoardRaptor = ({ trip, lineId, tripStartIndex, boardIndex, boardStopId, boardDepMs, serviceDayStartMs, roundArr, roundParent, improvedStops, markedStops, prevArr, minBoardSlackMs }) => {
    let changed = false;
    let currentBoardStopId = boardStopId;
    let currentBoardDepMs = boardDepMs;
    let currentBoardIndex = boardIndex;

    if (!trip || !Array.isArray(trip.stops) || trip.stops.length < 2) {
        return { changed, currentBoardStopId, currentBoardDepMs, currentBoardIndex };
    }

    const start = Number.isFinite(tripStartIndex) ? Number(tripStartIndex) : 0;

    for (let i = start; i < trip.stops.length; i += 1) {
        const stop = trip.stops[i];
        const stopId = normalizeText(stop?.stopId);
        if (!stopId) continue;

        const arrMs = Number.isFinite(stop?.arrMin) ? serviceDayStartMs + stop.arrMin * 60000 : null;
        const depMs = Number.isFinite(stop?.depMin) ? serviceDayStartMs + stop.depMin * 60000 : null;

        // 🌟 优雅核心 1：动态上车点升级！(Hop on later for a shorter ride)
        // 列车开到了这一站，如果乘客也能在这个站合法上车，我们就丢弃之前的旧起点！
        // （对于大江户线，如果扫到了第二圈的都厅前，上车点会在这里瞬间升级成 14:25，防绕圈生效！）
        if (markedStops.has(stopId) && Number.isFinite(depMs)) {
            const prevArrMs = prevArr.get(stopId);
            if (Number.isFinite(prevArrMs) && depMs >= prevArrMs + minBoardSlackMs) {
                currentBoardStopId = stopId;
                currentBoardDepMs = depMs;
                currentBoardIndex = i;
            }
        }

        // 🌟 优雅核心 2：如果是当前的上车点本身，就不用松弛了，继续往下开
        if (!currentBoardStopId || stopId === currentBoardStopId || !Number.isFinite(arrMs)) continue;

        const best = roundArr.get(stopId);
        const prevParent = roundParent.get(stopId);

        // 决胜裁判保留（应对在完全不同的两趟车中做选择的情况）
        const isShorterRideTieBreak = (arrMs === best) && prevParent && (currentBoardDepMs > prevParent.depMs);

        if (!Number.isFinite(best) || arrMs < best || isShorterRideTieBreak) {
            roundArr.set(stopId, arrMs);
            roundParent.set(stopId, {
                kind: 'ride',
                lineId,
                throughLineIds: Array.isArray(trip?.throughLineIds) ? trip.throughLineIds.map((x) => normalizeText(x)).filter(Boolean) : [],
                throughTripIds: Array.isArray(trip?.throughTripIds) ? trip.throughTripIds.map((x) => normalizeText(x)).filter(Boolean) : [],
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
                hasNm: trip?.hasNm === true,
                fromStop: currentBoardStopId, // 👈 写入升级后的最短用时起点！
                toStop: stopId,
                boardIndex: currentBoardIndex,
                alightIndex: i,
                depMs: currentBoardDepMs,
                arrMs
            });
            improvedStops.add(stopId);
            changed = true;
        }
    }

    // 将升级后的状态返回，供跨段直通车继续接力
    return { changed, currentBoardStopId, currentBoardDepMs, currentBoardIndex };
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

const findBoardingOnChain = ({ chainTrips, prevRoundEarliestArrivals, markedStops, minBoardSlackMs, serviceDayStartMs }) => {
    for (let seg = 0; seg < chainTrips.length; seg += 1) {
        const trip = chainTrips[seg];
        const stops = Array.isArray(trip?.stops) ? trip.stops : [];
        
        for (let i = 0; i < stops.length; i += 1) {
            const stop = stops[i];
            const stopId = normalizeText(stop?.stopId);
            if (!stopId) continue;
            
            if (!markedStops.has(stopId)) continue;

            const depMs = Number.isFinite(stop?.depMin) ? serviceDayStartMs + stop.depMin * 60000 : null;
            if (!Number.isFinite(depMs)) continue;
            
            const prevArrMs = prevRoundEarliestArrivals.get(stopId);
            if (!Number.isFinite(prevArrMs)) continue;
            if (depMs < prevArrMs + minBoardSlackMs) continue;

            // 🌟 极速回归：找到第一个合法上车点直接返回，拒绝返回数组！
            return {
                segmentIndex: seg,
                boardIndex: i,
                boardStopId: stopId,
                boardDepMs: depMs
            };
        }
    }
    return null;
};

const relaxChainFromBoardRaptor = ({ chainTrips, throughRootTripId, startSegmentIndex, startBoardIndex, startBoardStopId, startBoardDepMs, serviceDayStartMs, roundArr, roundParent, improvedStops, markedStops, prevArr, minBoardSlackMs }) => {
    
    // 维护一个可变的上车点状态
    let activeBoardStopId = normalizeText(startBoardStopId || '');
    let activeBoardDepMs = Number.isFinite(startBoardDepMs) ? Number(startBoardDepMs) : null;
    let activeBoardIndex = startBoardIndex; 

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

    if (!activeBoardStopId || !Number.isFinite(activeBoardDepMs)) return;

    for (let seg = startSegmentIndex; seg < chainTrips.length; seg += 1) {
        const trip = chainTrips[seg];
        if (!trip) continue;

        const isThroughContinuation = seg > startSegmentIndex;
        // 确保跨越不同路段时的遍历起点
        const tripLoopStartIndex = isThroughContinuation ? 0 : (Number.isFinite(activeBoardIndex) ? Number(activeBoardIndex) : 0);
        const currentTripBoardIndex = isThroughContinuation ? 0 : activeBoardIndex;

        // 🌟 接收底层返回的最新的上车点状态
        const res = rideTripFromBoardRaptor({
            trip: {
                ...trip,
                throughRootTripId,
                isThroughContinuation,
                throughLineIds,
                throughTripIds,
                timetableFile: normalizeText(trip?.timetableFile || getTripFileNameByLineId(trip?.lineId))
            },
            lineId: normalizeText(trip?.lineId || ''),
            tripStartIndex: tripLoopStartIndex,
            boardIndex: currentTripBoardIndex,
            boardStopId: activeBoardStopId,
            boardDepMs: activeBoardDepMs,
            serviceDayStartMs,
            roundArr,
            roundParent,
            improvedStops,
            // 传给最底层
            markedStops,
            prevArr,
            minBoardSlackMs
        });

        // 跨路段接力：将升级后的上车点带入下一段直通车
        activeBoardStopId = res.currentBoardStopId;
        activeBoardDepMs = res.currentBoardDepMs;
    }
};

const scanRoundRaptor = async ({ prevArr, markedStops, serviceDay, serviceDayStartMs, roundIndex, excludeSurchargeTypes = false }) => {
    const roundArr = new Map(prevArr);
    const roundParent = new Map();
    const improvedStops = new Set();

    const minBoardSlackMs = 0
    const routeIds = lineSetFromMarkedStops(markedStops);
    if (!routeIds.size) return { roundArr, roundParent, improvedStops };

    const routeArr = Array.from(routeIds);
    const routeTripsPairs = await Promise.all(
        routeArr.map(async (lineId) => ({ lineId, trips: await loadTripsForLineAndDay({ lineId, serviceDay, excludeSurchargeTypes }) }))
    );

    for (const { lineId, trips } of routeTripsPairs) {
        if (!Array.isArray(trips) || !trips.length) continue;

        for (const trip of trips) {
            const merged = await buildThroughChainFromTrip({
                seedTrip: trip,
                serviceDay,
                serviceDayStartMs
            });
            const chainVariants = Array.isArray(merged?.chainTripsList) && merged.chainTripsList.length
                ? merged.chainTripsList
                : (Array.isArray(merged?.chainTrips) && merged.chainTrips.length ? [merged.chainTrips] : []);
            if (!chainVariants.length) continue;

            for (const chainTrips of chainVariants) {
                if (!Array.isArray(chainTrips) || !chainTrips.length) continue;

                // 直接获取单一的起始上车点
                const board = findBoardingOnChain({
                    chainTrips,
                    prevRoundEarliestArrivals: prevArr,
                    markedStops,
                    minBoardSlackMs,
                    serviceDayStartMs
                });
                
                if (!board) continue;

                relaxChainFromBoardRaptor({
                    chainTrips,
                    throughRootTripId: normalizeText(merged?.throughRootTripId || ''),
                    startSegmentIndex: board.segmentIndex,
                    startBoardIndex: board.boardIndex,
                    startBoardStopId: board.boardStopId,
                    startBoardDepMs: board.boardDepMs,
                    serviceDayStartMs,
                    roundArr,
                    roundParent,
                    improvedStops,
                    markedStops,
                    prevArr,
                    minBoardSlackMs
                });
            }
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
            const penalty =  getTransferPenaltyMs(fromStop, toStop);
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

const runRaptorSearch = async ({ sourceStops, destinationStops, departureMs, serviceDay, maxRounds = 7, excludeSurchargeTypes = false }) => {
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
            roundIndex: round,
            excludeSurchargeTypes
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
            hasNm: p?.hasNm === true,
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

const optimizeSharedCorridorTransfers = async ({ plan, serviceDay }) => {
    if (!plan || !Array.isArray(plan.legs) || plan.legs.length < 2) return plan;

    // 深拷贝 legs，避免污染原始 RAPTOR 输出结果
    const optimizedLegs = JSON.parse(JSON.stringify(plan.legs)); 
    // 获取当天的毫秒基准，用于将 arrMin/depMin 转换为绝对时间戳
    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(plan.firstDepMs) || Date.now()));

    for (let i = 0; i < optimizedLegs.length - 1; i += 1) {
        const currLeg = optimizedLegs[i];
        const nextLeg = optimizedLegs[i + 1];

        // 1. 如果是直通运转（不需要真下车），直接跳过
        if (isThroughLegPairByMeta({ currentLeg: currLeg, nextLeg })) continue;

        // 2. 获取这两趟车的完整时刻表数据
        const tripA = await resolveTripForLeg({ leg: currLeg, serviceDay });
        const tripB = await resolveTripForLeg({ leg: nextLeg, serviceDay });
        if (!tripA || !tripB) continue;

        const stopsA = Array.isArray(tripA.stops) ? tripA.stops : [];
        const stopsB = Array.isArray(tripB.stops) ? tripB.stops : [];

        // 获取或推算当前记录的下车点与上车点索引
        let idxA = Number(currLeg.alightIndex);
        let idxB = Number(nextLeg.boardIndex);
        if (!Number.isFinite(idxA) || !Number.isFinite(idxB) || idxA < 0 || idxB < 0) {
            const resolvedA = resolveLegSliceIndexes(tripA, currLeg);
            const resolvedB = resolveLegSliceIndexes(tripB, nextLeg);
            idxA = resolvedA.toIdx;
            idxB = resolvedB.fromIdx;
        }
        if (idxA < 0 || idxB < 0) continue;

        // 3. 核心滑动逻辑准备
        const originalStopA = stopsA[idxA];
        const originalStopB = stopsB[idxB];
        if (!originalStopA || !originalStopB) continue;

        // 获取原定换乘点的步行惩罚（作为基准线）
        let currentPenalty = getTransferPenaltyMs(originalStopA.stopId, originalStopB.stopId);
        let bestTransfer = null;
        
        // B 车最多只能滑动到乘客的最终下车点
        const nextLegAlightIdx = Number.isFinite(nextLeg.alightIndex) ? nextLeg.alightIndex : stopsB.length - 1;

        // 开始向后探测共线段
        while (idxA + 1 < stopsA.length && idxB + 1 <= nextLegAlightIdx) {
            const nextStopA = stopsA[idxA + 1];
            const nextStopB = stopsB[idxB + 1];

            // 终止条件 A: 物理站点不一致，说明共线段结束/分叉了
            if (!isSamePhysicalStop(nextStopA.stopId, nextStopB.stopId)) break;

            // 计算如果滑动到这下一站，需要步行的换乘惩罚
            const nextPenalty = getTransferPenaltyMs(nextStopA.stopId, nextStopB.stopId);
            
            // 终止条件 B: 防劣化机制！如果下一站换乘走得更远（比如小站变大站迷宫），立刻放弃滑动
            if (nextPenalty > currentPenalty) break; 

            const arrMsA = serviceDayStartMs + (Number(nextStopA.arrMin) * 60000);
            const depMsB = serviceDayStartMs + (Number(nextStopB.depMin) * 60000);

            // 终止条件 C: 被超车了，来不及换乘（A 车到达 + 惩罚 > B 车发车）
            if (arrMsA + nextPenalty > depMsB) break;

            // 记录发现的更优晚换乘点
            bestTransfer = {
                idxA: idxA + 1,
                idxB: idxB + 1,
                stopIdA: nextStopA.stopId,
                stopIdB: nextStopB.stopId,
                arrMsA,
                depMsB
            };

            // 把当前惩罚设为新的基准，继续往后看能不能更好
            currentPenalty = nextPenalty;
            idxA += 1;
            idxB += 1;
        }

        // 4. 如果找到了更晚的换乘点，修改 A 车的下车信息和 B 车的上车信息
        if (bestTransfer) {
            currLeg.toStop = bestTransfer.stopIdA;
            currLeg.alightIndex = bestTransfer.idxA;
            currLeg.arrMs = bestTransfer.arrMsA;

            nextLeg.fromStop = bestTransfer.stopIdB;
            nextLeg.boardIndex = bestTransfer.idxB;
            nextLeg.depMs = bestTransfer.depMsB;
        }
    }

    // 5. 重新拼装 Sections，让 UI 根据新的换乘点切分行程条
    const sections = [];
    let current = [];
    for (let i = 0; i < optimizedLegs.length; i += 1) {
        const leg = optimizedLegs[i];
        current.push(leg);
        const next = optimizedLegs[i + 1] || null;
        const keep = next && isThroughLegPairByMeta({ currentLeg: leg, nextLeg: next });
        if (keep) continue;

        const first = current[0];
        const last = current[current.length - 1];
        const tripIds = [];
        const lineIds = [];
        const throughTripIds = [];

        for (const x of current) {
            const tid = normalizeText(x.rawTripId || x.tripId || '');
            if (tid && !tripIds.includes(tid)) tripIds.push(tid);
            const lid = normalizeText(x.lineId || '');
            if (lid && !lineIds.includes(lid)) lineIds.push(lid);
            
            for (const id of (Array.isArray(x.throughLineIds) ? x.throughLineIds : [])) {
                const v = normalizeText(id);
                if (v && !lineIds.includes(v)) lineIds.push(v);
            }
            for (const id of (Array.isArray(x.throughTripIds) ? x.throughTripIds : [])) {
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
            fromStop: normalizeText(first.fromStop),
            toStop: normalizeText(last.toStop),
            depMs: Number(first.depMs),
            arrMs: Number(last.arrMs),
            tripIds,
            throughTripIds,
            lineIds,
            legs: current.slice() // 使用已滑动优化的 legs
        });
        current = [];
    }

    // 6. 重新校准该 Plan 的起止时间与耗时（虽然滑动通常不会改变总时长，但严谨起见更新一下）
    const firstDepMs = Number.isFinite(optimizedLegs[0]?.depMs) ? optimizedLegs[0].depMs : plan.firstDepMs;
    const arrivalMs = Number.isFinite(optimizedLegs[optimizedLegs.length - 1]?.arrMs) ? optimizedLegs[optimizedLegs.length - 1].arrMs : plan.arrivalMs;
    const durationMs = (Number.isFinite(arrivalMs) && Number.isFinite(plan.baseDepartureMs)) 
        ? arrivalMs - plan.baseDepartureMs 
        : plan.durationMs;

    return {
        ...plan,
        firstDepMs,
        arrivalMs,
        durationMs,
        legs: optimizedLegs,
        sections
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

export const pickPlanBuckets = (plans) => {
    if (!plans.length) return [];
    const planSignature = (p) => [
        (Array.isArray(p?.legs) ? p.legs : []).map((x) => `${x?.lineId || ''}:${x?.typeId || ''}`).join('->'),
        String(Math.round((p?.firstDepMs || 0) / 60000)),
        String(Math.round((p?.arrivalMs || 0) / 60000))
    ].join('||');

    const shortest = plans.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0];
    const fewestTransfers = plans.slice().sort((a, b) => a.transfers - b.transfers || a.durationMs - b.durationMs || a.arrivalMs - b.arrivalMs)[0];
    const earliestDeparture = plans.slice().sort((a, b) => a.firstDepMs - b.firstDepMs || a.arrivalMs - b.arrivalMs)[0];

    const picked = [];
    const pickedSignatures = new Set();
    const addUnique = (plan, label) => {
        if (!plan) return;
        const sig = planSignature(plan);
        if (pickedSignatures.has(sig)) return;
        pickedSignatures.add(sig);
        picked.push({ label, plan });
    };
    addUnique(shortest, '最短用时');
    addUnique(fewestTransfers, '最少换乘');
    addUnique(earliestDeparture, '最早出发');

    const backup = plans
        .slice()
        .sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs)
        .filter((p) => !pickedSignatures.has(planSignature(p)))
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

const findSafeStopIndex = (stops, targetStopId, targetMs, serviceDayStartMs, isDeparture) => {
    let bestIdx = -1;
    let minDiff = Infinity;

    for (let i = 0; i < stops.length; i += 1) {
        const s = stops[i];
        if (isSamePhysicalStop(s.stopId, targetStopId)) {
            // 匹配出发或到达时间
            const timeMin = isDeparture ? (s.depMin ?? s.arrMin) : (s.arrMin ?? s.depMin);
            if (timeMin != null && Number.isFinite(targetMs)) {
                const ms = serviceDayStartMs + timeMin * 60000;
                const diff = Math.abs(ms - targetMs);
                // 寻找时间最接近的那一圈
                if (diff < minDiff) {
                    minDiff = diff;
                    bestIdx = i;
                }
            } else if (bestIdx < 0) {
                bestIdx = i; // 兜底
            }
        }
    }
    // 只要时间误差在 2 分钟内，绝对是这个站
    if (bestIdx >= 0 && minDiff <= 120000) return bestIdx;
    
    // 终极兜底退化：只看名字
    return stops.findIndex(s => isSamePhysicalStop(s.stopId, targetStopId));
};

const resolveLegSliceIndexes = (trip, leg) => {
    const stops = Array.isArray(trip?.stops) ? trip.stops : [];
    if (!stops.length) return { fromIdx: -1, toIdx: -1 };

    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(leg?.depMs) || Date.now()));
    
    // 彻底抛弃 findIndex，使用双重校验定位器
    const fromIdx = findSafeStopIndex(stops, leg?.fromStop, Number(leg?.depMs), serviceDayStartMs, true);
    const toIdx = findSafeStopIndex(stops, leg?.toStop, Number(leg?.arrMs), serviceDayStartMs, false);

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

    const serviceDayStartMs = getServiceDayStartMs(new Date(Number(section?.depMs) || Date.now()));
    const targetDepMs = Number(section?.depMs);
    const targetArrMs = Number(section?.arrMs);

    let startTripIdx = -1;
    let startStopIdx = -1;
    for (let ti = 0; ti < trips.length; ti += 1) {
        const stops = Array.isArray(trips[ti]?.stops) ? trips[ti].stops : [];
        // 防御：时间+空间双重验证寻找上车点
        const idx = findSafeStopIndex(stops, fromStopId, targetDepMs, serviceDayStartMs, true);
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
        
        let bestIdx = -1;
        let minDiff = Infinity;
        for (let si = begin; si < stops.length; si += 1) {
            const s = stops[si];
            if (isSamePhysicalStop(s.stopId, toStopId)) {
                const timeMin = s.arrMin ?? s.depMin;
                if (timeMin != null && Number.isFinite(targetArrMs)) {
                    const ms = serviceDayStartMs + timeMin * 60000;
                    const diff = Math.abs(ms - targetArrMs);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestIdx = si;
                    }
                } else if (bestIdx < 0) {
                    bestIdx = si;
                }
            }
        }
        if (bestIdx >= 0) {
            endTripIdx = ti;
            endStopIdx = bestIdx;
            break;
        }
    }
    if (endTripIdx < 0 || endStopIdx < 0) return [];

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

    const targetDepMs = Number(leg?.depMs);
    const targetArrMs = Number(leg?.arrMs);

    // 防御：时间+空间双重验证
    let firstFromIdx = findSafeStopIndex(firstTripStops, leg?.fromStop, targetDepMs, serviceDayStartMs, true);
    if (firstFromIdx < 0) firstFromIdx = 0;

    const targetToStopId = normalizeText(leg?.toStop || '');
    let endTripIndex = -1;
    let endStopIndex = -1;

    for (let tripIndex = 0; tripIndex < trips.length; tripIndex += 1) {
        const stops = Array.isArray(trips[tripIndex]?.stops) ? trips[tripIndex].stops : [];
        if (!stops.length) continue;

        const startIdx = tripIndex === 0 ? firstFromIdx : 0;
        
        let bestIdx = -1;
        let minDiff = Infinity;
        for (let i = startIdx; i < stops.length; i += 1) {
            const s = stops[i];
            if (isSamePhysicalStop(s.stopId, targetToStopId)) {
                const timeMin = s.arrMin ?? s.depMin;
                if (timeMin != null && Number.isFinite(targetArrMs)) {
                    const ms = serviceDayStartMs + timeMin * 60000;
                    const diff = Math.abs(ms - targetArrMs);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestIdx = i;
                    }
                } else if (bestIdx < 0) {
                    bestIdx = i;
                }
            }
        }
        if (bestIdx >= 0) {
            endTripIndex = tripIndex;
            endStopIndex = bestIdx;
            break;
        }
    }

    if (endTripIndex <= 0 || endStopIndex < 0) return [];

    // 循环 push 所有子班次，恢复多段高亮能力
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

    return (linkedByRef || linkedByBaseTrip);
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
            for (const leg of secLegs) {
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

                const lineIds = Array.isArray(section?.lineIds) ? section.lineIds.map((x) => normalizeText(x)).filter(Boolean) : [];
                const segmentLineId = normalizeText(lineIds[0] || leg?.lineId || '');
                if (!segmentLineId) continue;

                segments.push({
                    kind: 'main',
                    lineId: segmentLineId,
                    stationIds: compactIds,
                    d: normalizeText(trip?.d) || null,
                    typeColor: normalizeText(leg?.typeColor || trip?.typeColor || '') || null
                });
            }
        }
    } else {
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
        typeColor: normalizeText(firstSeg?.typeColor || firstLeg?.typeColor || '') || null,
        hasNt: false,
        fitMode: 'preview',
        segments: segments 
    };
};


export const collectJourneyCandidatesRaptor = async ({ sourceStops, destinationStops, serviceDay, baseDepartureMs, originWalkMin = null, destWalkMin = null, offsetMin = [0, 10] }) => {
    await ensurePlannerStaticData();

    // 默认偏移为 [0,10]。当起点为坐标并提供了步行分钟数时，使用该分钟数作为唯一偏移
    let offsetsMin = offsetMin;
    if (Number.isFinite(Number(originWalkMin)) && originWalkMin > 0) {
        offsetsMin = [Math.max(0, Math.round(Number(originWalkMin)))];
    }

    const runWithMaxRounds = async (maxRounds, { excludeSurchargeTypes = false } = {}) => {
        const candidates = [];
        for (const addMin of offsetsMin) {
            const depMs = baseDepartureMs + addMin * 60000;
            const runResult = await runRaptorSearch({
                sourceStops,
                destinationStops,
                departureMs: depMs,
                serviceDay,
                maxRounds,
                excludeSurchargeTypes
            });

            for (const best of runResult.bestByRound || []) {
                let plan = reconstructJourney({
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
                        plan = await optimizeSharedCorridorTransfers({
                            plan,
                            serviceDay
                        });
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

    let sortedPlans = dedupePlans(candidates).sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs);
    sortedPlans.forEach((plan) => {
        plan.hasSurcharge = planContainsSurcharge(plan);
    });
    const allPlansContainSurcharge = sortedPlans.length > 0 && sortedPlans.every((plan) => planContainsSurcharge(plan));

    if (allPlansContainSurcharge) {
        let nonSurchargeCandidates = await runWithMaxRounds(7, { excludeSurchargeTypes: true });
        if (!nonSurchargeCandidates.length) nonSurchargeCandidates = await runWithMaxRounds(10, { excludeSurchargeTypes: true });
        if (nonSurchargeCandidates.length) {
            const merged = dedupePlans(sortedPlans.concat(nonSurchargeCandidates));
            sortedPlans = merged.sort((a, b) => a.arrivalMs - b.arrivalMs || a.durationMs - b.durationMs);
            sortedPlans.forEach((plan) => {
                plan.hasSurcharge = planContainsSurcharge(plan);
            });
        }
    }

    // 如果提供了目的地步行时间，则将其加到方案的到达时间与耗时上（并记录元数据）
    if (Number.isFinite(Number(destWalkMin)) && destWalkMin > 0) {
        const addMs = Math.round(Number(destWalkMin)) * 60000;
        for (const p of sortedPlans) {
            if (Number.isFinite(p.arrivalMs)) p.arrivalMs = Number(p.arrivalMs) + addMs;
            if (Number.isFinite(p.durationMs) && Number.isFinite(p.baseDepartureMs)) {
                p.durationMs = Number(p.arrivalMs) - Number(p.baseDepartureMs);
            } else if (Number.isFinite(p.durationMs)) {
                p.durationMs = Number(p.durationMs) + addMs;
            }
            p.__walkDestinationMinutes = Number(destWalkMin);
        }
    }

    // 如果提供了起点步行时间，记录元信息（搜索时已使用该偏移）
    if (Number.isFinite(Number(originWalkMin)) && originWalkMin > 0) {
        for (const p of sortedPlans) p.__walkOriginMinutes = Number(originWalkMin);
    }
    return sortedPlans;
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

    if (!originId || !destinationId || shouldBlockJourneyPlanning({ originStationId: originId, destinationStationId: destinationId })) return null;

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
