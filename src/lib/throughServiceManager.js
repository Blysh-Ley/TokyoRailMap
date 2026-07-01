const toText = (value) => String(value ?? '').trim();

const uniqueTexts = (values) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .map((value) => toText(value))
        .filter(Boolean)
));

const freezeArray = (values) => Object.freeze(uniqueTexts(values));

const buildRailwayStationIndex = (railways) => {
    const out = new Map();
    for (const railway of Array.isArray(railways) ? railways : []) {
        const lineId = toText(railway?.id);
        const stations = freezeArray(railway?.stations);
        if (!lineId || !stations.length) continue;
        out.set(lineId, stations);
    }
    return out;
};

const getLineIdFromStationId = (stationId) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((part) => toText(part)).filter(Boolean);
    if (parts.length < 2) return '';
    return `${parts[0]}.${parts[1]}`;
};

const createThroughServiceConfig = (base) => {
    const category = toText(base?.category);
    const rawRequiredThroughStationToken = base?.requiredThroughStationToken;
    const requiredThroughStationToken = (() => {
        if (!rawRequiredThroughStationToken) return null;
        if (typeof rawRequiredThroughStationToken === 'object' && !Array.isArray(rawRequiredThroughStationToken)) {
            const station = toText(rawRequiredThroughStationToken.station);
            if (!station) return null;
            return Object.freeze({
                station,
                through: rawRequiredThroughStationToken.through === true
            });
        }
        const station = toText(rawRequiredThroughStationToken);
        return station ? Object.freeze({ station, through: false }) : null;
    })();
    const codeBadges = Object.freeze(
        (Array.isArray(base?.codeBadges) ? base.codeBadges : [])
            .map((badge) => Object.freeze({
                lineId: toText(badge?.lineId),
                code: toText(badge?.code)
            }))
            .filter((badge) => badge.lineId || badge.code)
    );
    const segments = Object.freeze(
        (Array.isArray(base?.segments) ? base.segments : [])
            .map((segment) => Object.freeze({
                lineId: toText(segment?.lineId),
                from: toText(segment?.from),
                to: toText(segment?.to),
                skipStations: freezeArray(segment?.skipStations)
            }))
            .filter((segment) => segment.lineId && segment.from && segment.to)
    );

    return Object.freeze({
        operator: toText(base?.operator),
        category,
        lineId: toText(base?.lineId),
        lineName: toText(base?.lineName),
        color: toText(base?.color),
        codeBadges,
        hiddenEntityLineIds: freezeArray(base?.hiddenEntityLineIds),
        requiredThroughStationToken,
        excludeNmTrips: base?.excludeNmTrips !== false,
        directionRule: Object.freeze({ ...(base?.directionRule || {}) }),
        segments,
        get codes() {
            return freezeArray(codeBadges.map((badge) => badge.code));
        },
        get stations() {
            return getThroughServiceDerivedInfo(category).stations;
        },
        get stationIdSet() {
            return getThroughServiceDerivedInfo(category).stationIdSet;
        },
        get segmentLineIds() {
            return getThroughServiceDerivedInfo(category).segmentLineIds;
        }
    });
};

export const THROUGH_SERVICE_CONFIGS = Object.freeze([
    createThroughServiceConfig({
        operator: 'JR-East',
        category: 'UenoTokyo',
        lineId: 'TokyoRail.Temp.UenoTokyo',
        lineName: '上野东京LINE',
        color: '#F68B1E',
        codeBadges: [
            { lineId: 'JR-East.Utsunomiya', code: 'JU' },
            { lineId: 'JR-East.Tokaido', code: 'JT' }
        ],
        requiredThroughStationToken: { station: 'Tokyo', through: true },
        directionRule: { southNode: 'Tokyo', northNode: 'Ueno' },
        segments: [
            { lineId: 'JR-East.Tokaido', from: 'JR-East.Tokaido.Tokyo', to: 'JR-East.Tokaido.Atami' },
            { lineId: 'JR-East.Takasaki', from: 'JR-East.Takasaki.Tokyo', to: 'JR-East.Takasaki.Takasaki' },
            { lineId: 'JR-East.Utsunomiya', from: 'JR-East.Utsunomiya.Tokyo', to: 'JR-East.Utsunomiya.Utsunomiya' },
            { lineId: 'JR-East.Ryomo', from: 'JR-East.Ryomo.Takasaki', to: 'JR-East.Ryomo.Maebashi' },
            { lineId: 'JR-East.Ito', from: 'JR-East.Ito.Atami', to: 'JR-East.Ito.Ito' },
            { lineId: 'JR-Central.Tokaido', from: 'JR-Central.Tokaido.Atami', to: 'JR-Central.Tokaido.Numazu' }
        ]
    }),
    createThroughServiceConfig({
        operator: 'JR-East',
        category: 'ShonanShinjuku',
        lineId: 'TokyoRail.Temp.ShonanShinjuku',
        lineName: '湘南新宿LINE',
        color: '#E31F26',
        codeBadges: [{ lineId: 'JR-East.ShonanShinjuku', code: 'JS' }],
        //hiddenEntityLineIds: ['JR-East.ShonanShinjuku'],
        requiredThroughStationToken: { station: 'Shinjuku', through: true },
        directionRule: { southNode: 'Shibuya', northNode: 'Shinjuku' },
        segments: [
            { lineId: 'JR-East.ShonanShinjuku', from: 'JR-East.ShonanShinjuku.Ofuna', to: 'JR-East.ShonanShinjuku.Omiya' },
            { lineId: 'JR-East.Takasaki', from: 'JR-East.Takasaki.Omiya', to: 'JR-East.Takasaki.Takasaki' },
            { lineId: 'JR-East.Tokaido', from: 'JR-East.Tokaido.Ofuna', to: 'JR-East.Tokaido.Odawara' },
            { lineId: 'JR-East.Utsunomiya', from: 'JR-East.Utsunomiya.Omiya', to: 'JR-East.Utsunomiya.Utsunomiya' },
            { lineId: 'JR-East.Ryomo', from: 'JR-East.Ryomo.Takasaki', to: 'JR-East.Ryomo.Maebashi' },
            { lineId: 'JR-East.Yokosuka', from: 'JR-East.Yokosuka.Ofuna', to: 'JR-East.Yokosuka.Zushi' }
        ]
    }),
    createThroughServiceConfig({
        operator: 'JR-East',
        category: 'UenoTokyoJoban',
        lineId: 'TokyoRail.Temp.UenoTokyoJoban',
        lineName: '上野东京LINE(常磐线)',
        color: '#00B261',
        codeBadges: [{ lineId: 'JR-East.JobanRapid', code: 'JJ' }],
        requiredThroughStationToken: { station: 'Tokyo', through: true },
        directionRule: { southNode: 'Tokyo', northNode: 'Ueno' },
        segments: [
            { lineId: 'JR-East.JobanRapid', from: 'JR-East.JobanRapid.Shinagawa', to: 'JR-East.JobanRapid.Toride' },
            {
                lineId: 'JR-East.Joban',
                from: 'JR-East.Joban.Toride',
                to: 'JR-East.Joban.Takahagi',
                skipStations: ['JR-East.Joban.Kairakuen']
            },
            { lineId: 'JR-East.NaritaAbikoBranch', from: 'JR-East.NaritaAbikoBranch.Abiko', to: 'JR-East.NaritaAbikoBranch.Narita' }
        ]
    }),
    createThroughServiceConfig({
        operator: 'JR-East',
        category: 'YokosukaSobuRapid',
        lineId: 'TokyoRail.Temp.YokosukaSobuRapid',
        lineName: '横须贺线·总武线(快速)',
        color: '#007AC1',
        codeBadges: [{ lineId: 'JR-East.Yokosuka', code: 'JO' }],
        //hiddenEntityLineIds: ['JR-East.Yokosuka', 'JR-East.SobuRapid'],
        requiredThroughStationToken: { station: 'Tokyo', through: true },
        directionRule: { southNode: 'Shinagawa', northNode: 'ShinNihombashi' },
        segments: [
            { lineId: 'JR-East.Yokosuka', from: 'JR-East.Yokosuka.Tokyo', to: 'JR-East.Yokosuka.Kurihama' },
            { lineId: 'JR-East.SobuRapid', from: 'JR-East.SobuRapid.Tokyo', to: "JR-East.SobuRapid.NaritaAirportTerminal1" },
            { lineId: 'JR-East.Sobu', from: 'JR-East.Sobu.Sakura', to: 'JR-East.Sobu.Naruto' },
            {
                lineId: 'JR-East.Sotobo',
                from: 'JR-East.Sotobo.Chiba',
                to: 'JR-East.Sotobo.KazusaIchinomiya',
                skipStations: [
                    'JR-East.Sotobo.Nagata',
                    'JR-East.Sotobo.Honno',
                    'JR-East.Sotobo.ShimMobara',
                    'JR-East.Sotobo.Yatsumi'
                ]
            },
            { lineId: 'JR-East.Uchibo', from: 'JR-East.Uchibo.Chiba', to: 'JR-East.Uchibo.Kimitsu' },
            { lineId: 'JR-East.Narita', from: 'JR-East.Narita.Sakura', to: 'JR-East.Narita.Katori' },
            { lineId: 'JR-East.Kashima', from: 'JR-East.Kashima.Sawara', to: 'JR-East.Kashima.Kashimajingu' }
        ]
    }),
    createThroughServiceConfig({
        operator: 'JR-East',
        category: 'NariraExpress',
        lineId: 'TokyoRail.Temp.NariraExpress',
        lineName: '成田特快',
        color: '#ff0000',
        codeBadges: [{ lineId: 'JR-East.NaritaExpress', code: "NE'X" }],
        requiredThroughStationToken: { station: "NaritaAirportTerminal2and3", through: true },
        directionRule: { southNode: "NaritaAirportTerminal2and3", northNode: 'NaritaAirportTerminal1' },
        excludeNmTrips: false,
        segments: [
            { lineId: 'JR-East.SobuRapid', from: 'JR-East.SobuRapid.Tokyo', to: "JR-East.SobuRapid.NaritaAirportTerminal1" },
            { lineId: 'JR-East.Yokosuka', from: 'JR-East.Yokosuka.Tokyo', to: 'JR-East.Yokosuka.Ofuna' },
            { lineId: 'JR-East.YamanoteFreight', from: 'JR-East.YamanoteFreight.Tokyo', to: 'JR-East.YamanoteFreight.Shibuya' },
            { lineId: 'JR-East.ShonanShinjuku', from: 'JR-East.ShonanShinjuku.Shinjuku', to: 'JR-East.ShonanShinjuku.Shibuya' }
        ]
    })
]);

const THROUGH_SERVICE_LEGACY_LINE_IDS_BY_CATEGORY = Object.freeze({
    UenoTokyo: Object.freeze(['TokyoRail.MenuThrough.UenoTokyo']),
    ShonanShinjuku: Object.freeze(['TokyoRail.MenuThrough.ShonanShinjuku']),
    UenoTokyoJoban: Object.freeze(['TokyoRail.MenuThrough.UenoTokyoJoban']),
    YokosukaSobuRapid: Object.freeze(['TokyoRail.MenuThrough.YokosukaSobuRapid'])
});

export const THROUGH_SERVICE_CONFIGS_OBJECT = Object.freeze(
    Object.fromEntries(THROUGH_SERVICE_CONFIGS.map(info => [info.category, info]))
);

export const THROUGH_SERVICE_CONFIGS_Categories = Object.freeze(Object.keys(THROUGH_SERVICE_CONFIGS_OBJECT));

const EMPTY_DERIVED_INFO = Object.freeze({
    stations: Object.freeze([]),
    stationIdSet: Object.freeze(new Set()),
    segmentLineIds: Object.freeze([])
});

const buildEmptyDerivedInfoByCategory = () => Object.freeze(
    Object.fromEntries(THROUGH_SERVICE_CONFIGS.map((info) => [
        info.category,
        Object.freeze({
            stations: Object.freeze([]),
            stationIdSet: Object.freeze(new Set()),
            segmentLineIds: Object.freeze(uniqueTexts(info.segments.map((segment) => segment.lineId)))
        })
    ]))
);

let throughServiceDerivedInfoByCategory = buildEmptyDerivedInfoByCategory();

export let THROUGH_SERVICE_SEGMENT_LINE_IDS = Object.freeze(new Set(
    THROUGH_SERVICE_CONFIGS.flatMap((info) => info.segments.map((segment) => segment.lineId))
));

const expandSegmentStations = (segment, railwayStationIndex) => {
    const lineStations = railwayStationIndex instanceof Map ? railwayStationIndex.get(segment.lineId) : null;
    if (!Array.isArray(lineStations) || !lineStations.length) return [];

    const fromIndex = lineStations.indexOf(segment.from);
    const toIndex = lineStations.indexOf(segment.to);
    if (fromIndex < 0 || toIndex < 0) return [];

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const skip = new Set(uniqueTexts(segment.skipStations));
    const expanded = lineStations.slice(start, end + 1).filter((stationId) => !skip.has(stationId));
    return fromIndex <= toIndex ? expanded : expanded.reverse();
};

export const buildThroughServiceDerivedState = ({ railways, railwayStationIndex } = {}) => {
    const index = railwayStationIndex instanceof Map ? railwayStationIndex : buildRailwayStationIndex(railways);
    const infoByCategory = {};
    const allSegmentLineIds = new Set();

    for (const config of THROUGH_SERVICE_CONFIGS) {
        const stations = [];
        const seenStations = new Set();
        const segmentLineIds = [];
        const seenLineIds = new Set();

        for (const segment of config.segments) {
            if (!seenLineIds.has(segment.lineId)) {
                seenLineIds.add(segment.lineId);
                segmentLineIds.push(segment.lineId);
                allSegmentLineIds.add(segment.lineId);
            }

            for (const stationId of expandSegmentStations(segment, index)) {
                if (!stationId || seenStations.has(stationId)) continue;
                seenStations.add(stationId);
                stations.push(stationId);
            }
        }

        infoByCategory[config.category] = Object.freeze({
            stations: Object.freeze(stations),
            stationIdSet: Object.freeze(new Set(stations)),
            segmentLineIds: Object.freeze(segmentLineIds)
        });
    }

    return Object.freeze({
        infoByCategory: Object.freeze(infoByCategory),
        segmentLineIds: Object.freeze(new Set(allSegmentLineIds))
    });
};

const getThroughServiceDerivedInfo = (category) => {
    return throughServiceDerivedInfoByCategory?.[category] || EMPTY_DERIVED_INFO;
};

export const initializeThroughServiceStationIndex = ({ railways, railwayStationIndex } = {}) => {
    const state = buildThroughServiceDerivedState({ railways, railwayStationIndex });
    throughServiceDerivedInfoByCategory = state.infoByCategory;
    THROUGH_SERVICE_SEGMENT_LINE_IDS = state.segmentLineIds;
    return state;
};

export const getThroughServiceDisplayByCategory = (category) => {
    const info = THROUGH_SERVICE_CONFIGS_OBJECT[toText(category)] || null;
    if (!info) return null;
    return Object.freeze({ name: info.lineName, color: info.color });
};

export const isSUStations = (stationId) => {
    const sid = toText(stationId);
    return Object.fromEntries(
        THROUGH_SERVICE_CONFIGS_Categories.map(category => [
            category,
            getThroughServiceDerivedInfo(category).stationIdSet.has(sid)
        ])
    );
};

export const isSUStation = (stationId) => {
    const flags = isSUStations(stationId);
    return Object.values(flags).some(Boolean);
};

export const getMenuThroughCategoryByLineId = (lineId) => {
    const raw = toText(lineId);
    const id = raw.startsWith('rw-menu-through:')
        ? raw.slice('rw-menu-through:'.length).trim()
        : raw;
    if (!id) return '';

    for (const info of THROUGH_SERVICE_CONFIGS) {
        if (id === info.lineId) return info.category;
        const legacyIds = THROUGH_SERVICE_LEGACY_LINE_IDS_BY_CATEGORY[info.category] || [];
        if (legacyIds.includes(id)) return info.category;
    }

    return '';
};

export const isMenuThroughLineId = (lineId) => {
    return !!getMenuThroughCategoryByLineId(lineId);
};


const getTripId = (trip) => {
    const id = toText(trip?.id);
    if (id) return id;
    return toText(trip?.t);
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

const getTripRefLineIds = (trip) => {
    return [...getRefs(trip, 'pt'), ...getRefs(trip, 'nt')]
        .map((refId) => getLineIdFromStationId(refId))
        .filter(Boolean);
};

const getTripIdentityKeys = (trip) => {
    const keys = new Set(buildTripFilterKeys(trip));
    return keys;
};

const getFirstStopToken = (trip) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    return getStationToken(tt[0]?.s);
};

const getLastStopToken = (trip) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    return getStationToken(tt.length ? tt[tt.length - 1]?.s : '');
};

const getStationToken = (stationId) => {
    const sid = toText(stationId);
    if (!sid) return '';
    const parts = sid.split('.').map((part) => toText(part)).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
};

const hasTripNmMarker = (trip) => {
    if (!trip || typeof trip !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(trip, 'nm')) return false;
    const nm = trip.nm;
    if (Array.isArray(nm)) return nm.length > 0;
    if (nm && typeof nm === 'object') return Object.keys(nm).length > 0;
    return toText(nm) !== '';
};

const doesRefMatchTrip = (refId, tripKeySet) => {
    const ref = toText(refId);
    if (!ref || !(tripKeySet instanceof Set)) return false;
    if (tripKeySet.has(ref)) return true;
    const base = ref.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
    return !!base && tripKeySet.has(base);
};

const hasRequiredThroughStation = (trips, requiredRule) => {
    const requiredStation = toText(requiredRule?.station || requiredRule);
    if (!requiredStation) return true;
    const requiresThrough = requiredRule?.through === true;

    const list = Array.isArray(trips) ? trips : [];
    let hasStation = false;
    const allTripKeys = new Set();
    for (const trip of list) {
        for (const key of getTripIdentityKeys(trip)) {
            allTripKeys.add(key);
        }
    }

    const endpointTokens = new Set();
    for (const trip of list) {
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        for (const stop of tt) {
            if (getStationToken(stop?.s) === requiredStation) {
                hasStation = true;
            }
        }

        if (!requiresThrough) continue;

        const hasPreviousInChain = getRefs(trip, 'pt').some((refId) => doesRefMatchTrip(refId, allTripKeys));
        const hasNextInChain = getRefs(trip, 'nt').some((refId) => doesRefMatchTrip(refId, allTripKeys));
        if (!hasPreviousInChain) {
            const token = getFirstStopToken(trip);
            if (token) endpointTokens.add(token);
        }
        if (!hasNextInChain) {
            const token = getLastStopToken(trip);
            if (token) endpointTokens.add(token);
        }
    }

    if (!hasStation) return false;
    return !requiresThrough || !endpointTokens.has(requiredStation);
};

const classifyTripByThroughServiceSegments = (trips) => {
    const list = Array.isArray(trips) ? trips : [];
    let best = null;
    for (const info of THROUGH_SERVICE_CONFIGS) {
        const stationSet = info.stationIdSet;
        if (!(stationSet instanceof Set) || !stationSet.size) continue;
        if (info.excludeNmTrips !== false && list.some((trip) => hasTripNmMarker(trip))) continue;
        const segmentLineIdSet = new Set(info.segmentLineIds || []);
        const requiredThroughStationToken = info.requiredThroughStationToken;

        const matchedLineIds = new Set();
        let matchedStationCount = 0;
        let hasStation = false;
        let isInsideCategory = true;

        for (const trip of list) {
            for (const refLineId of getTripRefLineIds(trip)) {
                if (!segmentLineIdSet.has(refLineId)) {
                    isInsideCategory = false;
                    break;
                }
            }
            if (!isInsideCategory) break;

            const tt = Array.isArray(trip?.tt) ? trip.tt : [];
            for (const stop of tt) {
                const stationId = toText(stop?.s);
                if (!stationId) continue;
                hasStation = true;
                if (!stationSet.has(stationId)) {
                    isInsideCategory = false;
                    break;
                }
                matchedStationCount += 1;
                const lineId = getLineIdFromStationId(stationId);
                if (lineId) matchedLineIds.add(lineId);
            }
            if (!isInsideCategory) break;
        }

        if (!isInsideCategory || !hasStation) continue;
        if (!hasRequiredThroughStation(list, requiredThroughStationToken)) continue;
        if (matchedLineIds.size < 2) continue;
        const score = (matchedLineIds.size * 1000) + matchedStationCount;
        if (!best || score > best.score) {
            best = { category: info.category, score };
        }
    }
    return best?.category || '';
};

export const detectThroughServiceCategoryFromTrips = (trips) => {
    const list = Array.isArray(trips) ? trips : [];
    return classifyTripByThroughServiceSegments(list);
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

export async function buildTemporaryThroughServicePanelPlan(options = {}) {
    const stationId = toText(options.stationId);
    const servingLineIds = Array.isArray(options.servingLineIds)
        ? Array.from(new Set(options.servingLineIds.map((x) => toText(x)).filter(Boolean)))
        : [];

    const loadTimetableForLineId = typeof options.loadTimetableForLineId === 'function' ? options.loadTimetableForLineId : null;
    const resolveStationIdForLine = typeof options.resolveStationIdForLine === 'function' ? options.resolveStationIdForLine : null;
    const loadTripByRefId = typeof options.loadTripByRefId === 'function' ? options.loadTripByRefId : null;
    const parseTripServiceDayFromId = typeof options.parseTripServiceDayFromId === 'function' ? options.parseTripServiceDayFromId : null;
    const currentServiceDay = toText(options.currentServiceDay);
    const isStillCurrentStation = typeof options.isStillCurrentStation === 'function' ? options.isStillCurrentStation : null;

    if (!stationId || !servingLineIds.length) return null;
    if (!loadTimetableForLineId || !resolveStationIdForLine || !loadTripByRefId) return null;

    const matchedServingLineIds = servingLineIds.filter((id) => THROUGH_SERVICE_SEGMENT_LINE_IDS.has(id));
    if (!matchedServingLineIds.length) return null;

    // 1. 动态初始化 Bucket
    const bucketByCategory = {};
    for (const category of THROUGH_SERVICE_CONFIGS_Categories) {
        bucketByCategory[category] = {
            sourceLineIds: new Set(),
            allowedTripKeys: new Set()
        };
    }

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

            // 2. 动态分类判定
            const category = detectThroughServiceCategoryFromTrips(connectedTrips);
            if (!category || !bucketByCategory[category]) continue;

            const bucket = bucketByCategory[category];
            bucket.sourceLineIds.add(lineId);
            for (const key of buildTripFilterKeys(trip)) {
                if (key) bucket.allowedTripKeys.add(key);
            }
        }
    }

    const displayServingIds = servingLineIds.slice();
    const temporaryLineMetaById = new Map();
    const temporarySourceLineIdsByDisplayLineId = new Map();
    const temporaryAllowedTripKeysByDisplayLineId = new Map();
    const hiddenEntityLineIds = new Set();

    const firstTriggerIndex = (() => {
        const idx = displayServingIds.findIndex((id) => THROUGH_SERVICE_SEGMENT_LINE_IDS.has(toText(id)));
        return idx >= 0 ? idx : displayServingIds.length;
    })();

    let insertCursor = firstTriggerIndex;

    // 3. 动态组装面板数据
    for (const info of THROUGH_SERVICE_CONFIGS) {
        const bucket = bucketByCategory[info.category];
        const hasTrips = bucket.allowedTripKeys.size > 0;

        if (hasTrips) {
            const lineId = info.lineId;
            for (const hiddenLineId of info.hiddenEntityLineIds || []) {
                hiddenEntityLineIds.add(hiddenLineId);
            }
            
            if (!displayServingIds.includes(lineId)) {
                displayServingIds.splice(insertCursor, 0, lineId);
                insertCursor += 1; 
            }

            temporaryLineMetaById.set(lineId, {
                id: lineId,
                company: info.operator,
                name: info.lineName,
                color: info.color,
                code: info.codes.join('/') 
            });

            if (hasTrips) {
                // 有真实发车数据
                temporarySourceLineIdsByDisplayLineId.set(lineId, Array.from(bucket.sourceLineIds));
                temporaryAllowedTripKeysByDisplayLineId.set(lineId, new Set(bucket.allowedTripKeys));
            } 
        }
    }

    if (!temporarySourceLineIdsByDisplayLineId.size) return null;

    return {
        displayServingIds: displayServingIds.filter((lineId) => !hiddenEntityLineIds.has(lineId)),
        temporaryLineMetaById,
        temporarySourceLineIdsByDisplayLineId,
        temporaryAllowedTripKeysByDisplayLineId
    };
}
