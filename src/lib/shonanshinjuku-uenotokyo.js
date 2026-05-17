const toText = (value) => String(value ?? '').trim();

const SU_STATION_IDS_BY_CATEGORY = Object.freeze({
    UenoTokyo: Object.freeze([
    "JR-East.Tokaido.Tokyo",
    "JR-East.Tokaido.Shimbashi",
    "JR-East.Tokaido.Shinagawa",
    "JR-East.Tokaido.Kawasaki",
    "JR-East.Tokaido.Yokohama",
    "JR-East.Tokaido.Totsuka",
    "JR-East.Tokaido.Ofuna",
    "JR-East.Tokaido.Fujisawa",
    "JR-East.Tokaido.Tsujido",
    "JR-East.Tokaido.Chigasaki",
    "JR-East.Tokaido.Hiratsuka",
    "JR-East.Tokaido.Oiso",
    "JR-East.Tokaido.Ninomiya",
    "JR-East.Tokaido.Kozu",
    "JR-East.Tokaido.Kamonomiya",
    "JR-East.Tokaido.Odawara",
    "JR-East.Takasaki.Kagohara",
    "JR-East.Takasaki.Kumagaya",
    "JR-East.Takasaki.Gyoda",
    "JR-East.Takasaki.Fukiage",
    "JR-East.Takasaki.KitaKonosu",
    "JR-East.Takasaki.Konosu",
    "JR-East.Takasaki.Kitamoto",
    "JR-East.Takasaki.Okegawa",
    "JR-East.Takasaki.KitaAgeo",
    "JR-East.Takasaki.Ageo",
    "JR-East.Takasaki.Miyahara",
    "JR-East.Takasaki.Omiya",
    "JR-East.Takasaki.SaitamaShintoshin",
    "JR-East.Takasaki.Urawa",
    "JR-East.Takasaki.Akabane",
    "JR-East.Takasaki.Oku",
    "JR-East.Takasaki.Ueno",
    "JR-East.Takasaki.Tokyo",
    "JR-East.Tokaido.Hayakawa",
    "JR-East.Tokaido.Nebukawa",
    "JR-East.Tokaido.Manazuru",
    "JR-East.Tokaido.Yugawara",
    "JR-East.Tokaido.Atami",
    "JR-East.Utsunomiya.Utsunomiya",
    "JR-East.Utsunomiya.Suzumenomiya",
    "JR-East.Utsunomiya.Ishibashi",
    "JR-East.Utsunomiya.Jichiidai",
    "JR-East.Utsunomiya.Koganei",
    "JR-East.Utsunomiya.Oyama",
    "JR-East.Utsunomiya.Mamada",
    "JR-East.Utsunomiya.Nogi",
    "JR-East.Utsunomiya.Koga",
    "JR-East.Utsunomiya.Kurihashi",
    "JR-East.Utsunomiya.HigashiWashinomiya",
    "JR-East.Utsunomiya.Kuki",
    "JR-East.Utsunomiya.ShinShiraoka",
    "JR-East.Utsunomiya.Shiraoka",
    "JR-East.Utsunomiya.Hasuda",
    "JR-East.Utsunomiya.HigashiOmiya",
    "JR-East.Utsunomiya.Toro",
    "JR-East.Utsunomiya.Omiya",
    "JR-East.Utsunomiya.SaitamaShintoshin",
    "JR-East.Utsunomiya.Urawa",
    "JR-East.Utsunomiya.Akabane",
    "JR-East.Utsunomiya.Oku",
    "JR-East.Utsunomiya.Ueno",
    "JR-East.Utsunomiya.Tokyo",
    "JR-East.Takasaki.Takasaki",
    "JR-East.Takasaki.Kuragano",
    "JR-East.Takasaki.Shimmachi",
    "JR-East.Takasaki.Jimbohara",
    "JR-East.Takasaki.Honjo",
    "JR-East.Takasaki.Okabe",
    "JR-East.Takasaki.Fukaya",
    "JR-East.Ryomo.ShimMaebashi",
    "JR-East.Ryomo.Ino",
    "JR-East.Ryomo.Takasakitonyamachi",
    "JR-East.Ryomo.Takasaki",
    "JR-East.Ryomo.Maebashi",
    "JR-East.Ito.Atami",
    "JR-East.Ito.Kinomiya",
    "JR-East.Ito.IzuTaga",
    "JR-East.Ito.Ajiro",
    "JR-East.Ito.Usami",
    "JR-East.Ito.Ito",
    "JR-Central.Tokaido.Atami",
    "JR-Central.Tokaido.Kannami",
    "JR-Central.Tokaido.Mishima",
    "JR-Central.Tokaido.Numazu"
]),
    ShonanShinjuku: Object.freeze([
    "JR-East.ShonanShinjuku.Omiya",
    "JR-East.ShonanShinjuku.Urawa",
    "JR-East.ShonanShinjuku.Akabane",
    "JR-East.ShonanShinjuku.Ikebukuro",
    "JR-East.ShonanShinjuku.Shinjuku",
    "JR-East.ShonanShinjuku.Shibuya",
    "JR-East.ShonanShinjuku.Ebisu",
    "JR-East.ShonanShinjuku.Osaki",
    "JR-East.ShonanShinjuku.MusashiKosugi",
    "JR-East.ShonanShinjuku.Yokohama",
    "JR-East.ShonanShinjuku.Totsuka",
    "JR-East.ShonanShinjuku.Ofuna",
    "JR-East.Takasaki.Kagohara",
    "JR-East.Takasaki.Kumagaya",
    "JR-East.Takasaki.Gyoda",
    "JR-East.Takasaki.Fukiage",
    "JR-East.Takasaki.KitaKonosu",
    "JR-East.Takasaki.Konosu",
    "JR-East.Takasaki.Kitamoto",
    "JR-East.Takasaki.Okegawa",
    "JR-East.Takasaki.KitaAgeo",
    "JR-East.Takasaki.Ageo",
    "JR-East.Takasaki.Miyahara",
    "JR-East.Takasaki.Omiya",
    "JR-East.Tokaido.Ofuna",
    "JR-East.Tokaido.Fujisawa",
    "JR-East.Tokaido.Tsujido",
    "JR-East.Tokaido.Chigasaki",
    "JR-East.Tokaido.Hiratsuka",
    "JR-East.ShonanShinjuku.NishiOi",
    "JR-East.ShonanShinjuku.ShinKawasaki",
    "JR-East.ShonanShinjuku.Hodogaya",
    "JR-East.ShonanShinjuku.HigashiTotsuka",
    "JR-East.Utsunomiya.Utsunomiya",
    "JR-East.Utsunomiya.Suzumenomiya",
    "JR-East.Utsunomiya.Ishibashi",
    "JR-East.Utsunomiya.Jichiidai",
    "JR-East.Utsunomiya.Koganei",
    "JR-East.Utsunomiya.Oyama",
    "JR-East.Utsunomiya.Mamada",
    "JR-East.Utsunomiya.Nogi",
    "JR-East.Utsunomiya.Koga",
    "JR-East.Utsunomiya.Kurihashi",
    "JR-East.Utsunomiya.HigashiWashinomiya",
    "JR-East.Utsunomiya.Kuki",
    "JR-East.Utsunomiya.ShinShiraoka",
    "JR-East.Utsunomiya.Shiraoka",
    "JR-East.Utsunomiya.Hasuda",
    "JR-East.Utsunomiya.HigashiOmiya",
    "JR-East.Utsunomiya.Toro",
    "JR-East.Utsunomiya.Omiya",
    "JR-East.Takasaki.Takasaki",
    "JR-East.Takasaki.Kuragano",
    "JR-East.Takasaki.Shimmachi",
    "JR-East.Takasaki.Jimbohara",
    "JR-East.Takasaki.Honjo",
    "JR-East.Takasaki.Okabe",
    "JR-East.Takasaki.Fukaya",
    "JR-East.Tokaido.Oiso",
    "JR-East.Tokaido.Ninomiya",
    "JR-East.Tokaido.Kozu",
    "JR-East.Tokaido.Kamonomiya",
    "JR-East.Tokaido.Odawara",
    "JR-East.Ryomo.Maebashi",
    "JR-East.Ryomo.ShimMaebashi",
    "JR-East.Ryomo.Ino",
    "JR-East.Ryomo.Takasakitonyamachi",
    "JR-East.Ryomo.Takasaki",
    "JR-East.Yokosuka.Ofuna",
    "JR-East.Yokosuka.KitaKamakura",
    "JR-East.Yokosuka.Kamakura",
    "JR-East.Yokosuka.Zushi"
]),
    UenoTokyoJoban: Object.freeze([
    "JR-East.JobanRapid.Shinagawa",
    "JR-East.JobanRapid.Shimbashi",
    "JR-East.JobanRapid.Tokyo",
    "JR-East.JobanRapid.Ueno",
    "JR-East.JobanRapid.Nippori",
    "JR-East.JobanRapid.Mikawashima",
    "JR-East.JobanRapid.MinamiSenju",
    "JR-East.JobanRapid.KitaSenju",
    "JR-East.JobanRapid.Matsudo",
    "JR-East.JobanRapid.Kashiwa",
    "JR-East.JobanRapid.Abiko",
    "JR-East.JobanRapid.Tennodai",
    "JR-East.JobanRapid.Toride",
    "JR-East.Joban.Toride",
    "JR-East.Joban.Fujishiro",
    "JR-East.Joban.Ryugasakishi",
    "JR-East.Joban.Ushiku",
    "JR-East.Joban.Hitachinoushiku",
    "JR-East.Joban.Arakawaoki",
    "JR-East.Joban.Tsuchiura",
    "JR-East.Joban.Kandatsu",
    "JR-East.Joban.Takahama",
    "JR-East.Joban.Ishioka",
    "JR-East.Joban.Hatori",
    "JR-East.Joban.Iwama",
    "JR-East.Joban.Tomobe",
    "JR-East.Joban.Uchihara",
    "JR-East.Joban.Akatsuka",
    "JR-East.Joban.Mito",
    "JR-East.Joban.Katsuta",
    "JR-East.Joban.Sawa",
    "JR-East.Joban.Tokai",
    "JR-East.Joban.Omika",
    "JR-East.Joban.HitachiTaga",
    "JR-East.Joban.Hitachi",
    "JR-East.Joban.Ogitsu",
    "JR-East.Joban.Juo",
    "JR-East.Joban.Takahagi",
    "JR-East.NaritaAbikoBranch.Abiko",
    "JR-East.NaritaAbikoBranch.HigashiAbiko",
    "JR-East.NaritaAbikoBranch.Kohoku",
    "JR-East.NaritaAbikoBranch.Araki",
    "JR-East.NaritaAbikoBranch.Fusa",
    "JR-East.NaritaAbikoBranch.Kioroshi",
    "JR-East.NaritaAbikoBranch.Kobayashi",
    "JR-East.NaritaAbikoBranch.Ajiki",
    "JR-East.NaritaAbikoBranch.ShimosaManzaki",
    "JR-East.NaritaAbikoBranch.Narita"
    ])
});


export const THROUGH_SERVICE_TEMP_LINE_IDS = Object.freeze({
    UENO_TOKYO: 'TokyoRail.Temp.UenoTokyo',
    SHONAN_SHINJUKU: 'TokyoRail.Temp.ShonanShinjuku',
    UENO_TOKYO_JOBAN: 'TokyoRail.Temp.UenoTokyoJoban'
});

export const THROUGH_SERVICE_DISPLAY = Object.freeze({
    ShonanShinjuku: { name: '湘南新宿线', color: '#E31F26' },
    UenoTokyo: { name: '上野东京线', color: '#F68B1E' },
    UenoTokyoJoban: { name: '上野东京线（常磐快速）', color: '#00B261' }
});

export const MENU_THROUGH_LINE_IDS = Object.freeze({
    UENO_TOKYO: 'TokyoRail.MenuThrough.UenoTokyo',
    SHONAN_SHINJUKU: 'TokyoRail.MenuThrough.ShonanShinjuku',
    UENO_TOKYO_JOBAN: 'TokyoRail.MenuThrough.UenoTokyoJoban'

});

export const SU_Info = Object.freeze([
    {
        operator: 'JR-East',
        category: 'UenoTokyo',
        lineId: MENU_THROUGH_LINE_IDS.UENO_TOKYO,
        tempId: THROUGH_SERVICE_TEMP_LINE_IDS.UENO_TOKYO,
        lineName: THROUGH_SERVICE_DISPLAY.UenoTokyo.name,
        color: THROUGH_SERVICE_DISPLAY.UenoTokyo.color,
        codes: ['JU', 'JT'],
        routeIds: ['JR-East.Tokaido','JR-East.Utsunomiya'],
        directionRule: { southNode: 'Tokyo', northNode: 'Ueno' },
        stations: SU_STATION_IDS_BY_CATEGORY.UenoTokyo,
        triggerLineIds: [
            'JR-East.Tokaido',
            'JR-Central.Tokaido',
            'JR-East.Takasaki',
            'JR-East.Utsunomiya',
            'JR-East.Ito',
            'JR-East.Ryomo'
        ],
        excludeLineIds: [
            'JR-East.KeihinTohokuNegishi',
            'JR-East.Yamanote',
            'JR-East.SaikyoKawagoe',
            'JR-East.JobanRapid',
            'JR-East.Joban',
            'JR-East.NaritaAbikoBranch'
        ],
        triggerStations: ['Ueno', 'Tokyo']
    },
    {
        operator: 'JR-East',
        category: 'ShonanShinjuku',
        lineId: MENU_THROUGH_LINE_IDS.SHONAN_SHINJUKU,
        tempId: THROUGH_SERVICE_TEMP_LINE_IDS.SHONAN_SHINJUKU,
        lineName: THROUGH_SERVICE_DISPLAY.ShonanShinjuku.name,
        color: THROUGH_SERVICE_DISPLAY.ShonanShinjuku.color,
        codes: ['JS'],
        routeIds: ['JR-East.ShonanShinjuku'],
        directionRule: { southNode: 'Shibuya', northNode: 'Shinjuku' },
        stations: SU_STATION_IDS_BY_CATEGORY.ShonanShinjuku,
        triggerLineIds: [
            'JR-East.Tokaido',
            'JR-East.ShonanShinjuku',
            'JR-East.Yokosuka',
            'JR-East.Takasaki',
            'JR-East.Utsunomiya',
            'JR-East.Ryomo'
        ],
        excludeLineIds: [
            'JR-East.KeihinTohokuNegishi',
            'JR-East.Yamanote',
            'JR-East.SaikyoKawagoe',
            'JR-East.Ito',
            'Izukyu.Izukyu',
            'JR-East.NaritaExpress',
            'JR-East.NaritaAbikoBranch'
        ],
        triggerStations: ['Shinjuku', 'Shibuya']
    },
    {
        operator: 'JR-East',
        category: 'UenoTokyoJoban',
        lineId: MENU_THROUGH_LINE_IDS.UENO_TOKYO_JOBAN,
        tempId: THROUGH_SERVICE_TEMP_LINE_IDS.UENO_TOKYO_JOBAN,
        lineName: THROUGH_SERVICE_DISPLAY.UenoTokyoJoban.name,
        color: THROUGH_SERVICE_DISPLAY.UenoTokyoJoban.color,
        codes: ['JJ'],
        routeIds: ['JR-East.JobanRapid'],
        directionRule: { southNode: 'Tokyo', northNode: 'Ueno' },
        stations: SU_STATION_IDS_BY_CATEGORY.UenoTokyoJoban,
        triggerLineIds: [
            'JR-East.JobanRapid',
            'JR-East.Joban',
            'JR-East.NaritaAbikoBranch',
        ],
        excludeLineIds: [
            'JR-East.KeihinTohokuNegishi',
            'JR-East.Yamanote',
            'JR-East.SaikyoKawagoe',
            'JR-East.Tokaido',
            'JR-Central.Tokaido',
            'JR-East.Takasaki',
            'JR-East.Utsunomiya',
            'JR-East.Ito',
            'JR-East.Ryomo'
        ],
        triggerStations: ['Ueno', 'Tokyo']
    }
]);


export const SU_Object = Object.freeze(
    Object.fromEntries(
        SU_Info.map(info => [info.category, info])
    )
);


export const SU_Categories = Object.freeze(Object.keys(SU_Object));



export const isSUStations = (stationId) => {
    const sid = toText(stationId);
    // 动态遍历分类，生成 { UenoTokyo: true/false, ShonanShinjuku: true/false ... }
    return Object.fromEntries(
        SU_Categories.map(category => [
            category,
            (SU_STATION_IDS_BY_CATEGORY[category] || []).includes(sid)
        ])
    );
};

export const isSUStation = (stationId) => {
    const flags = isSUStations(stationId);
    // 只要 flags 里的 value 有一个是 true，就返回 true
    return Object.values(flags).some(Boolean);
};


export const TRIGGER_LINE_IDS = new Set(
    SU_Info.flatMap(info => info.triggerLineIds)
);


export const getMenuThroughCategoryByLineId = (lineId) => {
    const id = toText(lineId);
    return SU_Info.find(info => 
        id === info.lineId || 
        id === info.tempId || 
        (info.routeIds && info.routeIds.includes(id))
    )?.category || '';
};

export const isMenuThroughLineId = (lineId) => {
    return !!getMenuThroughCategoryByLineId(lineId);
};


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

const collectTriggerStationsFromTrip = (trip, visitedSet) => {
    const tt = Array.isArray(trip?.tt) ? trip.tt : [];
    for (const stop of tt) {
        const sid = toText(stop?.s);
        if (!sid) continue;
        const token = sid.split('.').pop();
        if (token) visitedSet.add(token);
    }
};

const hasExcludedChainLine = (lineIds, excludePrefixes) => {
    const ids = Array.isArray(lineIds) ? lineIds : [];
    const prefixes = Array.isArray(excludePrefixes) ? excludePrefixes : [];
    
    for (const lineId of ids) {
        const lid = toText(lineId);
        if (!lid) continue;
        for (const prefix of prefixes) {
            if (lid === prefix || lid.startsWith(`${prefix}.`)) return true;
        }
    }
    return false;
};

const classifyTripBySUInfo = (visitedStations, chainLineIds) => {
    for (const info of SU_Info) {
        // 条件 1: 必须包含该分类要求的所有触发站点
        const hasAllTriggers = info.triggerStations.every(st => visitedStations.has(st));
        if (!hasAllTriggers) continue;

        // 条件 2: 关联线路中绝对不能包含该分类排斥的线路
        const isExcluded = hasExcludedChainLine(chainLineIds, info.excludeLineIds);
        if (isExcluded) continue;
        return info.category;
    }
    return '';
};

const hasNmServiceMarker = (trip) => {
    if (!trip || typeof trip !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(trip, 'nm')) return false;
    const nm = trip.nm;
    if (Array.isArray(nm)) return nm.length > 0;
    return nm !== null && nm !== undefined && toText(nm) !== '';
};

export const detectThroughServiceCategoryFromTrips = (trips) => {
    const list = Array.isArray(trips) ? trips : [];
    
    // 如果包含 nm 标记（通常代表某种特急或特殊的非直通服务），直接排除
    if (list.some((trip) => hasNmServiceMarker(trip))) return '';

    const chainLineIds = [];
    const visitedStations = new Set(); // 替代了旧的 flags 对象

    for (const trip of list) {
        // 收集这趟车以及关联车次经过的所有站点
        collectTriggerStationsFromTrip(trip, visitedStations);
        
        const lineId = getTripLineId(trip);
        if (lineId) chainLineIds.push(lineId);
    }
    
    return classifyTripBySUInfo(visitedStations, chainLineIds);
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

    const matchedServingLineIds = servingLineIds.filter((id) => TRIGGER_LINE_IDS.has(id));
    if (!matchedServingLineIds.length) return null;

    // 1. 动态初始化 Bucket
    const bucketByCategory = {};
    for (const category of SU_Categories) {
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
    const suStationFlags = isSUStations(stationId);

    // 3. 动态组装面板数据
    for (const info of SU_Info) {
        const bucket = bucketByCategory[info.category];
        const hasTrips = bucket.allowedTripKeys.size > 0;
        
        // 特殊逻辑：湘南新宿线如果已有原生线路，则跳过
        if (info.category === 'ShonanShinjuku' && hasShonanServingLine) continue;

        if (hasTrips) {
            const lineId = info.tempId;
            
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
        displayServingIds,
        temporaryLineMetaById,
        temporarySourceLineIdsByDisplayLineId,
        temporaryAllowedTripKeysByDisplayLineId
    };
}
