import { hhmmToOffsetMinutes } from '../domain/routePlanning/time.js';
import {
    getTripBaseKey,
    getTripFileNameByLineId,
    normalizeRefArray,
    normalizeText,
    parseTripServiceDayFromId
} from '../domain/routePlanning/text.js';
import { isSurchargeTypeId } from '../domain/routePlanning/candidates.js';

const hasTripNmMarker = (tripLike) => {
    const nm = tripLike?.nm;
    if (nm == null) return false;
    if (typeof nm === 'string') return normalizeText(nm) !== '';
    if (Array.isArray(nm)) return nm.length > 0;
    if (typeof nm === 'object') return Object.keys(nm).length > 0;
    return Boolean(nm);
};

// Heatmap-only copy of the parsed-trip loader. The V2 service-day index owns
// caching; this loader never reads or writes legacy planner caches/ID indexes.
export const loadReachableStopsTripsForLineAndDay = async ({
    lineId,
    serviceDay,
    excludeSurchargeTypes = false,
    timetableCache = null,
    typeMetaById = new Map()
} = {}) => {
    const line = normalizeText(lineId);
    const day = normalizeText(serviceDay) || 'Weekday';
    if (!line || !timetableCache) return [];

    const existing = timetableCache.get(line);
    if (!existing) await timetableCache.preloadByLineIds([line]);
    const rawData = timetableCache.get(line);
    const list = Array.isArray(rawData) ? rawData : [];

    const parsedTrips = [];
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
            const hasArrival = Number.isFinite(arrOffset);
            const hasDeparture = Number.isFinite(depOffset);
            let arrMin = hasArrival ? arrOffset : null;
            let depMin = hasDeparture ? depOffset : null;
            if (arrMin == null && depMin == null) continue;
            if (arrMin == null) arrMin = depMin;
            if (depMin == null) depMin = arrMin;
            stops.push({ stopId, arrMin, depMin, hasArrival, hasDeparture });
        }

        if (stops.length < 2) continue;

        const typeId = normalizeText(trip?.y || '');
        const hasNm = hasTripNmMarker(trip);
        const typeMeta = typeMetaById.get(typeId) || null;
        if (excludeSurchargeTypes && (hasNm || isSurchargeTypeId({
            typeId,
            explicitSurcharge: typeMeta?.surcharge
        }))) continue;
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
    }

    parsedTrips.sort((a, b) => {
        const ta = Number.isFinite(a?.stops?.[0]?.depMin) ? a.stops[0].depMin : Infinity;
        const tb = Number.isFinite(b?.stops?.[0]?.depMin) ? b.stops[0].depMin : Infinity;
        return ta - tb;
    });
    return parsedTrips;
};
