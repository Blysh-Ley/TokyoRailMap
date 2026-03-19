const toText = (value) => String(value ?? '').trim();

export const TRIGGER_LINE_IDS = new Set([
    'JR-East.Tokaido',
    'JR-Central.Tokaido',
    'JR-East.Takasaki',
    'JR-East.Utsunomiya',
    'JR-East.Ito',
    'JR-East.Yokosuka',
    'JR-East.JobanRapid',
    'JR-East.Joban',
    'JR-East.NaritaAbikoBranch',
    'JR-East.Ryomo',
    'JR-East.ShonanShinjuku'
]);

export const THROUGH_SERVICE_TEMP_LINE_IDS = Object.freeze({
    UENO_TOKYO: 'TokyoRail.Temp.UenoTokyo',
    SHONAN_SHINJUKU: 'TokyoRail.Temp.ShonanShinjuku'
});

export const THROUGH_SERVICE_DISPLAY = Object.freeze({
    ShonanShinjuku: { name: '湘南新宿线', color: '#E31F26' },
    UenoTokyo: { name: '上野东京线', color: '#F68B1E' }
});

export const MENU_THROUGH_LINE_IDS = Object.freeze({
    UENO_TOKYO: 'TokyoRail.MenuThrough.UenoTokyo',
    SHONAN_SHINJUKU: 'TokyoRail.MenuThrough.ShonanShinjuku'
});

const MENU_THROUGH_CATEGORY_BY_LINE_ID = Object.freeze({
    [MENU_THROUGH_LINE_IDS.UENO_TOKYO]: 'UenoTokyo',
    [MENU_THROUGH_LINE_IDS.SHONAN_SHINJUKU]: 'ShonanShinjuku'
});

export const isMenuThroughLineId = (lineId) => {
    const id = toText(lineId);
    return !!MENU_THROUGH_CATEGORY_BY_LINE_ID[id];
};

export const getMenuThroughCategoryByLineId = (lineId) => {
    const id = toText(lineId);
    return MENU_THROUGH_CATEGORY_BY_LINE_ID[id] || '';
};

const STATION_TOKENS = Object.freeze({
    SHINJUKU: 'Shinjuku',
    SHIBUYA: 'Shibuya',
    UENO: 'Ueno',
    TOKYO: 'Tokyo'
});

const SHONAN_SHINJUKU_EXCLUDED_CHAIN_PREFIXES = Object.freeze([
    'JR-East.Ito',
    'Izukyu.Izukyu'
]);

const getTripId = (trip) => {
    const id = toText(trip?.id);
    if (id) return id;
    return toText(trip?.t);
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

const getBaseTripId = (trip) => {
    const base = toText(trip?.t);
    if (base) return base;
    const id = toText(trip?.id);
    if (!id) return '';
    return id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
};

const buildTripFilterKeys = (trip) => {
    const out = [];
    const id = toText(trip?.id);
    const t = toText(trip?.t);
    const base = getBaseTripId(trip);
    if (id) out.push(id);
    if (t) out.push(t);
    if (base) out.push(base);
    return out;
};

const getRefs = (trip, key) => {
    const raw = Array.isArray(trip?.[key]) ? trip[key] : (trip?.[key] ? [trip[key]] : []);
    return Array.from(new Set(raw.map((x) => toText(x)).filter(Boolean)));
};

const collectStopFlagsFromTrip = (trip, flags) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    for (const stop of tt) {
        const sid = toText(stop?.s);
        if (!sid) continue;
        const token = sid.split('.').pop();
        if (token === STATION_TOKENS.SHINJUKU) flags.hasShinjuku = true;
        if (token === STATION_TOKENS.SHIBUYA) flags.hasShibuya = true;
        if (token === STATION_TOKENS.UENO) flags.hasUeno = true;
        if (token === STATION_TOKENS.TOKYO) flags.hasTokyo = true;
    }
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

const classifyByFlags = (flags, options = {}) => {
    const isShonanShinjuku = !!(flags.hasShinjuku && flags.hasShibuya);
    const isUenoTokyo = !!(flags.hasUeno && flags.hasTokyo);
    const shonanExcluded = hasExcludedShonanChainLine(options?.chainLineIds);

    if (isShonanShinjuku && !shonanExcluded) return 'ShonanShinjuku';
    if (isUenoTokyo) return 'UenoTokyo';
    return '';
};

export const detectThroughServiceCategoryFromTrips = (trips) => {
    const flags = {
        hasShinjuku: false,
        hasShibuya: false,
        hasUeno: false,
        hasTokyo: false
    };
    const list = Array.isArray(trips) ? trips : [];
    const chainLineIds = [];
    for (const trip of list) {
        collectStopFlagsFromTrip(trip, flags);
        const lineId = getTripLineId(trip);
        if (lineId) chainLineIds.push(lineId);
    }
    return classifyByFlags(flags, { chainLineIds });
};

const isTripStoppingAtStation = (trip, stationIdSet) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    for (const stop of tt) {
        const sid = toText(stop?.s);
        if (sid && stationIdSet.has(sid)) return true;
    }
    return false;
};

const collectConnectedTrips = async (seedTrip, { loadTripByRefId, isStillCurrentStation }) => {
    const visitedTripIds = new Set();
    const queue = [seedTrip];
    const outTrips = [];

    while (queue.length) {
        if (typeof isStillCurrentStation === 'function' && !isStillCurrentStation()) return null;

        const trip = queue.shift();
        if (!trip) continue;

        const tripId = getTripId(trip);
        if (tripId && visitedTripIds.has(tripId)) continue;
        if (tripId) visitedTripIds.add(tripId);

        outTrips.push(trip);

        const refs = [...getRefs(trip, 'pt'), ...getRefs(trip, 'nt')];
        for (const refId of refs) {
            const refTrip = await loadTripByRefId(refId);
            if (!refTrip) continue;
            const refTripId = getTripId(refTrip);
            if (refTripId && visitedTripIds.has(refTripId)) continue;
            queue.push(refTrip);
        }
    }

    return outTrips;
};

export async function debugExtractShonanShinjukuUenoTokyoTrips(options = {}) {
    const stationId = toText(options.stationId);
    const stationNameZh = toText(options.stationNameZh);
    const servingLineIds = Array.isArray(options.servingLineIds)
        ? Array.from(new Set(options.servingLineIds.map((x) => toText(x)).filter(Boolean)))
        : [];

    const loadTimetableForLineId = typeof options.loadTimetableForLineId === 'function'
        ? options.loadTimetableForLineId
        : null;
    const resolveStationIdForLine = typeof options.resolveStationIdForLine === 'function'
        ? options.resolveStationIdForLine
        : null;
    const loadTripByRefId = typeof options.loadTripByRefId === 'function'
        ? options.loadTripByRefId
        : null;
    const parseTripServiceDayFromId = typeof options.parseTripServiceDayFromId === 'function'
        ? options.parseTripServiceDayFromId
        : null;
    const currentServiceDay = toText(options.currentServiceDay);
    const isStillCurrentStation = typeof options.isStillCurrentStation === 'function'
        ? options.isStillCurrentStation
        : null;
    const logger = typeof options.logger === 'function' ? options.logger : console.log;

    if (!stationId || !servingLineIds.length) return null;
    if (!loadTimetableForLineId || !resolveStationIdForLine || !loadTripByRefId) return null;

    const matchedServingLineIds = servingLineIds.filter((id) => TRIGGER_LINE_IDS.has(id));
    if (!matchedServingLineIds.length) return null;

    const report = {
        stationId,
        stationNameZh,
        serviceDay: currentServiceDay,
        matchedServingLineIds,
        scannedLineIds: [],
        shonanShinjuku: [],
        uenoTokyo: []
    };

    const seenTripKeys = new Set();

    for (const lineId of matchedServingLineIds) {
        if (isStillCurrentStation && !isStillCurrentStation()) return null;

        const lineStationId = toText(await resolveStationIdForLine(lineId)) || stationId;
        const stationIdSet = new Set([stationId, lineStationId].filter(Boolean));
        const data = await loadTimetableForLineId(lineId);
        const list = Array.isArray(data) ? data : [];
        report.scannedLineIds.push({ lineId, stationId: lineStationId, tripCount: list.length });

        for (const trip of list) {
            if (isStillCurrentStation && !isStillCurrentStation()) return null;

            const tripIdForDay = toText(trip?.id);
            if (currentServiceDay && parseTripServiceDayFromId && tripIdForDay) {
                const tripDay = toText(parseTripServiceDayFromId(tripIdForDay));
                if (tripDay && tripDay !== currentServiceDay) continue;
            }

            if (!isTripStoppingAtStation(trip, stationIdSet)) continue;

            const tripId = getTripId(trip);
            const uniqueTripKey = `${lineId}||${tripId}`;
            if (seenTripKeys.has(uniqueTripKey)) continue;
            seenTripKeys.add(uniqueTripKey);

            const connectedTrips = await collectConnectedTrips(trip, { loadTripByRefId, isStillCurrentStation });
            if (!connectedTrips) return null;

            const category = detectThroughServiceCategoryFromTrips(connectedTrips);
            if (!category) continue;

            const flags = {
                hasShinjuku: category === 'ShonanShinjuku',
                hasShibuya: category === 'ShonanShinjuku',
                hasUeno: category === 'UenoTokyo',
                hasTokyo: category === 'UenoTokyo'
            };
            const item = {
                lineId,
                stationId: lineStationId,
                tripId,
                baseTripId: getBaseTripId(trip),
                dir: toText(trip?.d),
                flags,
                chainTripIds: connectedTrips.map((x) => getTripId(x)).filter(Boolean)
            };

            if (category === 'ShonanShinjuku') report.shonanShinjuku.push(item);
            else if (category === 'UenoTokyo') report.uenoTokyo.push(item);
        }
    }

    logger('[panel-line][through-service-detect][summary]', {
        stationId: report.stationId,
        stationNameZh: report.stationNameZh,
        serviceDay: report.serviceDay,
        matchedServingLineIds: report.matchedServingLineIds,
        scannedLineIds: report.scannedLineIds,
        shonanShinjukuCount: report.shonanShinjuku.length,
        uenoTokyoCount: report.uenoTokyo.length
    });
    logger('[panel-line][through-service-detect][detail]', report);

    return report;
}

export async function buildTemporaryThroughServicePanelPlan(options = {}) {
    const stationId = toText(options.stationId);
    const servingLineIds = Array.isArray(options.servingLineIds)
        ? Array.from(new Set(options.servingLineIds.map((x) => toText(x)).filter(Boolean)))
        : [];

    const loadTimetableForLineId = typeof options.loadTimetableForLineId === 'function'
        ? options.loadTimetableForLineId
        : null;
    const resolveStationIdForLine = typeof options.resolveStationIdForLine === 'function'
        ? options.resolveStationIdForLine
        : null;
    const loadTripByRefId = typeof options.loadTripByRefId === 'function'
        ? options.loadTripByRefId
        : null;
    const parseTripServiceDayFromId = typeof options.parseTripServiceDayFromId === 'function'
        ? options.parseTripServiceDayFromId
        : null;
    const currentServiceDay = toText(options.currentServiceDay);
    const isStillCurrentStation = typeof options.isStillCurrentStation === 'function'
        ? options.isStillCurrentStation
        : null;

    if (!stationId || !servingLineIds.length) return null;
    if (!loadTimetableForLineId || !resolveStationIdForLine || !loadTripByRefId) return null;

    const matchedServingLineIds = servingLineIds.filter((id) => TRIGGER_LINE_IDS.has(id));
    if (!matchedServingLineIds.length) return null;

    const bucketByCategory = {
        ShonanShinjuku: {
            sourceLineIds: new Set(),
            allowedTripKeys: new Set()
        },
        UenoTokyo: {
            sourceLineIds: new Set(),
            allowedTripKeys: new Set()
        }
    };

    for (const lineId of matchedServingLineIds) {
        if (isStillCurrentStation && !isStillCurrentStation()) return null;

        const lineStationId = toText(await resolveStationIdForLine(lineId)) || stationId;
        const stationIdSet = new Set([stationId, lineStationId].filter(Boolean));
        const data = await loadTimetableForLineId(lineId);
        const list = Array.isArray(data) ? data : [];

        for (const trip of list) {
            if (isStillCurrentStation && !isStillCurrentStation()) return null;

            const tripIdForDay = toText(trip?.id);
            if (currentServiceDay && parseTripServiceDayFromId && tripIdForDay) {
                const tripDay = toText(parseTripServiceDayFromId(tripIdForDay));
                if (tripDay && tripDay !== currentServiceDay) continue;
            }

            if (!isTripStoppingAtStation(trip, stationIdSet)) continue;

            const connectedTrips = await collectConnectedTrips(trip, { loadTripByRefId, isStillCurrentStation });
            if (!connectedTrips) return null;

            const category = detectThroughServiceCategoryFromTrips(connectedTrips);
            if (category !== 'ShonanShinjuku' && category !== 'UenoTokyo') continue;

            const bucket = bucketByCategory[category];
            bucket.sourceLineIds.add(lineId);
            for (const key of buildTripFilterKeys(trip)) {
                if (key) bucket.allowedTripKeys.add(key);
            }
        }
    }

    const hasShonanServingLine = servingLineIds.includes('JR-East.ShonanShinjuku');
    const displayServingIds = servingLineIds.slice();
    const temporaryLineMetaById = new Map();
    const temporarySourceLineIdsByDisplayLineId = new Map();
    const temporaryAllowedTripKeysByDisplayLineId = new Map();

    const firstTriggerIndex = (() => {
        const idx = displayServingIds.findIndex((id) => TRIGGER_LINE_IDS.has(toText(id)));
        return idx >= 0 ? idx : displayServingIds.length;
    })();

    let insertCursor = firstTriggerIndex;

    const uenoBucket = bucketByCategory.UenoTokyo;
    if (uenoBucket.allowedTripKeys.size) {
        const lineId = THROUGH_SERVICE_TEMP_LINE_IDS.UENO_TOKYO;
        displayServingIds.splice(insertCursor, 0, lineId);
        insertCursor += 1;
        temporaryLineMetaById.set(lineId, {
            id: lineId,
            company: 'JR-East',
            name: THROUGH_SERVICE_DISPLAY.UenoTokyo.name,
            color: THROUGH_SERVICE_DISPLAY.UenoTokyo.color,
            code: 'JU/JT'
        });
        temporarySourceLineIdsByDisplayLineId.set(lineId, Array.from(uenoBucket.sourceLineIds));
        temporaryAllowedTripKeysByDisplayLineId.set(lineId, new Set(uenoBucket.allowedTripKeys));
    }

    const shonanBucket = bucketByCategory.ShonanShinjuku;
    if (shonanBucket.allowedTripKeys.size && !hasShonanServingLine) {
        const lineId = THROUGH_SERVICE_TEMP_LINE_IDS.SHONAN_SHINJUKU;
        displayServingIds.splice(insertCursor, 0, lineId);
        temporaryLineMetaById.set(lineId, {
            id: lineId,
            company: 'JR-East',
            name: THROUGH_SERVICE_DISPLAY.ShonanShinjuku.name,
            color: THROUGH_SERVICE_DISPLAY.ShonanShinjuku.color,
            code: 'JS'
        });

        temporarySourceLineIdsByDisplayLineId.set(lineId, Array.from(shonanBucket.sourceLineIds));
        temporaryAllowedTripKeysByDisplayLineId.set(lineId, new Set(shonanBucket.allowedTripKeys));
    }

    if (!temporarySourceLineIdsByDisplayLineId.size) return null;

    return {
        displayServingIds,
        temporaryLineMetaById,
        temporarySourceLineIdsByDisplayLineId,
        temporaryAllowedTripKeysByDisplayLineId
    };
}
