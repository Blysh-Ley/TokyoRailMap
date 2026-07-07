import { mergeStationGroups } from '../domain/stationGroupMerge.js';

const normalizeText = (v) => String(v ?? '').trim();

export const DATA_URLS = Object.freeze({
    railways: './data/railways.json',
    stations: './data/stations.json',
    stationGroups: './data/station-groups.json',
    stationGroupsSupplemental: './data/station-groups-supplemental.json',
    trainTypes: './data/train-types.json',
    railwaysOrder: './data/railways-order.json',
    railDirections: './data/rail-directions.json',
    trainVehicles: './data/train-vehicles.json',
    poi: './data/poi.json',
    coordinates: './data/coordinates.json',
    lineOffset: './data/line-offset.json'
});

const STATION_GROUPS_URL = DATA_URLS.stationGroups;
const SUPPLEMENTAL_STATION_GROUPS_URL = DATA_URLS.stationGroupsSupplemental;

const dataUrlAliasByPath = new Map(
    Object.entries({
        'data/railways.json': 'railways',
        'data/stations.json': 'stations',
        'data/station-groups.json': 'stationGroups',
        'data/station-groups-supplemental.json': 'stationGroupsSupplemental',
        'data/train-types.json': 'trainTypes',
        'data/railways-order.json': 'railwaysOrder',
        'data/rail-directions.json': 'railDirections',
        'data/train-vehicles.json': 'trainVehicles',
        'data/poi.json': 'poi',
        'data/coordinates.json': 'coordinates',
        'data/line-offset.json': 'lineOffset'
    })
);

export const ICON_BASE_PATH = './assets/icons/';
export const ICON_ROOT_PATH = '/assets/icons/';
export const COMPANY_LOGO_BASE_PATH = './assets/company-logos/';
export const COMPANY_LOGO_ROOT_PATH = '/assets/company-logos/';

const defaultCoreUrls = [
    DATA_URLS.railways,
    DATA_URLS.stations,
    DATA_URLS.stationGroups,
    DATA_URLS.stationGroupsSupplemental,
    DATA_URLS.trainTypes,
    DATA_URLS.railwaysOrder,
    DATA_URLS.railDirections,
    DATA_URLS.trainVehicles,
    DATA_URLS.trainTypes,
    DATA_URLS.poi,
    DATA_URLS.coordinates,
    DATA_URLS.lineOffset
];

const state = {
    installed: false,
    nativeFetch: null,
    responseMetaByUrl: new Map(),
    responsePromiseByUrl: new Map(),
    jsonPromiseByUrl: new Map(),
    stationGroupsPromise: null,
    preloadAllPromise: null,
    imageObjectUrlByAbsUrl: new Map(),
    imagePromiseByAbsUrl: new Map(),
    imageFailedAbsUrls: new Set(),
    resolvedImageSrcByKey: new Map(),
    companyLogoMap: null
};

const MAX_RESPONSE_META_ENTRIES = 512;
const MAX_IMAGE_OBJECT_URL_ENTRIES = 256;
const MAX_RESOLVED_IMAGE_SRC_ENTRIES = 512;

let imageLoadRequestSeq = 0;

const normalizeDataPath = (url) => {
    const raw = normalizeText(url);
    if (!raw) return '';
    try {
        const base = (typeof window !== 'undefined' && window.location?.href)
            ? window.location.href
            : 'http://localhost/';
        const parsed = new URL(raw, base);
        return parsed.pathname.replace(/^\/+/, '');
    } catch {
        return raw.replace(/^\.\//, '').replace(/^\/+/, '').split(/[?#]/)[0];
    }
};

const getManagedDataKeyForUrl = (url) => dataUrlAliasByPath.get(normalizeDataPath(url)) || '';

export const getDataAssetUrl = (key) => DATA_URLS[normalizeText(key)] || '';

export const isManagedDataAssetUrl = (url) => Boolean(getManagedDataKeyForUrl(url));

const resolveManagedDataUrl = (url) => {
    const key = getManagedDataKeyForUrl(url);
    return key ? getDataAssetUrl(key) : url;
};

const resolveManagedDataInput = (input) => {
    if (typeof input === 'string') return resolveManagedDataUrl(input);
    if (input instanceof URL) {
        const resolved = resolveManagedDataUrl(input.href);
        return resolved === input.href ? input : resolved;
    }
    return input;
};

const getCapacitorPlatform = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    try {
        if (typeof capacitor?.getPlatform === 'function') {
            return normalizeText(capacitor.getPlatform()).toLowerCase();
        }
    } catch {
        // ignore broken platform probes
    }
    return normalizeText(capacitor?.platform).toLowerCase();
};

const isIosNativeRuntime = (target = globalThis) => {
    const capacitor = target?.Capacitor;
    if (!capacitor) return false;
    if (getCapacitorPlatform(target) !== 'ios') return false;
    try {
        if (typeof capacitor.isNativePlatform === 'function') {
            return capacitor.isNativePlatform() === true;
        }
    } catch {
        return false;
    }
    return true;
};

export const shouldHideCompanyLogos = (target = globalThis) => isIosNativeRuntime(target);

const toAbsoluteUrl = (input) => {
    try {
        if (typeof input === 'string') return new URL(input, window.location.href).href;
        if (input instanceof URL) return input.href;
        if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    } catch {
        // ignore
    }
    return String(input ?? '');
};

const getElectronLocalFileApi = () => {
    try {
        if (typeof window === 'undefined') return null;
        const api = window.TokyoRailElectron;
        if (api && typeof api.readLocalFile === 'function') return api;
    } catch {
        // ignore
    }
    return null;
};

const shouldUseElectronLocalRead = (absUrl) => {
    const u = normalizeText(absUrl).toLowerCase();
    if (!u) return false;
    if (u.startsWith('http://') || u.startsWith('https://')) return false;
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    if (u.startsWith('ws://') || u.startsWith('wss://')) return false;
    return true;
};

const getRequestHeader = (headers, name) => {
    const key = normalizeText(name).toLowerCase();
    if (!headers || !key) return '';
    try {
        if (typeof Headers !== 'undefined' && headers instanceof Headers) {
            return normalizeText(headers.get(key));
        }
    } catch {
        // ignore
    }
    if (Array.isArray(headers)) {
        const found = headers.find(([headerName]) => normalizeText(headerName).toLowerCase() === key);
        return normalizeText(found?.[1]);
    }
    if (typeof headers === 'object') {
        const foundKey = Object.keys(headers).find((headerName) => normalizeText(headerName).toLowerCase() === key);
        return normalizeText(foundKey ? headers[foundKey] : '');
    }
    return '';
};

const getRangeHeader = (init = {}) => getRequestHeader(init?.headers, 'range');

const base64ToArrayBuffer = (base64) => {
    const raw = normalizeText(base64);
    if (!raw) return new ArrayBuffer(0);

    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
        bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
};

const fetchViaElectronLocalRead = async (url, init = {}) => {
    const api = getElectronLocalFileApi();
    if (!api) return null;
    if (!shouldUseElectronLocalRead(url)) return null;

    try {
        const range = getRangeHeader(init);
        const result = await api.readLocalFile(url, range ? { range } : {});
        if (!result || typeof result !== 'object') return null;

        return {
            url,
            status: Number(result.status) || 200,
            statusText: normalizeText(result.statusText) || 'OK',
            headers: Array.isArray(result.headers) ? result.headers : [],
            body: base64ToArrayBuffer(result.bodyBase64)
        };
    } catch {
        return null;
    }
};

const shouldCacheRequest = (input, init = {}) => {
    const reqMethod = normalizeText(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (reqMethod && reqMethod !== 'GET') return false;
    if (init?.body != null) return false;
    return true;
};

const shouldBypassResponseCache = (absUrl) => {
    const u = normalizeText(absUrl).toLowerCase();
    return u.includes('/data/train-timetables/');
};

const normalizeImageCandidates = (candidates) => {
    if (Array.isArray(candidates)) {
        return Array.from(new Set(candidates.map((x) => normalizeText(x)).filter(Boolean)));
    }
    const s = normalizeText(candidates);
    return s ? [s] : [];
};

const normalizeAssetFileName = (value, relBase, rootBase) => {
    const raw = normalizeText(value);
    if (!raw) return '';
    if (/^[a-z]+:\/\//i.test(raw)) return raw;

    if (raw.startsWith(relBase)) return raw.slice(relBase.length);
    if (raw.startsWith(rootBase)) return raw.slice(rootBase.length);
    return raw.replace(/^\/+/, '');
};

const buildAssetCandidates = (value, relBase, rootBase) => {
    const file = normalizeAssetFileName(value, relBase, rootBase);
    if (!file) return [];
    if (/^[a-z]+:\/\//i.test(file)) return [file];
    return [`${relBase}${file}`, `${rootBase}${file}`];
};

export const getIconCandidates = (iconFile) => buildAssetCandidates(iconFile, ICON_BASE_PATH, ICON_ROOT_PATH);

export const getCompanyLogoCandidates = (logoFile) => buildAssetCandidates(logoFile, COMPANY_LOGO_BASE_PATH, COMPANY_LOGO_ROOT_PATH);

const buildImageResolutionKey = (candidates, cacheKey = '') => {
    const key = normalizeText(cacheKey);
    if (key) return `key:${key}`;
    const absList = candidates.map((x) => toAbsoluteUrl(x)).filter(Boolean);
    return absList.length ? `cand:${absList.join('|')}` : '';
};

const revokeObjectUrl = (url) => {
    const normalized = normalizeText(url);
    if (!normalized) return;

    try {
        URL.revokeObjectURL(normalized);
    } catch {
        // ignore
    }
};

const trimMapToLimit = (map, limit, onEvict) => {
    if (!(map instanceof Map)) return;

    const maxEntries = Math.max(1, Number(limit) || 1);
    while (map.size > maxEntries) {
        const oldestKey = map.keys().next().value;
        const oldestValue = map.get(oldestKey);
        map.delete(oldestKey);
        if (typeof onEvict === 'function') onEvict(oldestValue, oldestKey);
    }
};

const storeImageObjectUrl = (absUrl, objectUrl) => {
    const abs = normalizeText(absUrl);
    const src = normalizeText(objectUrl);
    if (!abs || !src) return;

    const previous = state.imageObjectUrlByAbsUrl.get(abs);
    if (previous && previous !== src) {
        revokeObjectUrl(previous);
    }

    state.imageObjectUrlByAbsUrl.set(abs, src);
    trimMapToLimit(state.imageObjectUrlByAbsUrl, MAX_IMAGE_OBJECT_URL_ENTRIES, (value, key) => {
        revokeObjectUrl(value);
        state.imageFailedAbsUrls.delete(key);
    });
};

const storeResolvedImageSrc = (resolutionKey, src) => {
    const key = normalizeText(resolutionKey);
    if (!key) return;

    state.resolvedImageSrcByKey.set(key, normalizeText(src));
    trimMapToLimit(state.resolvedImageSrcByKey, MAX_RESOLVED_IMAGE_SRC_ENTRIES);
};

const storeResponseMeta = (url, meta) => {
    const key = normalizeText(url);
    if (!key || !meta) return;

    state.responseMetaByUrl.set(key, meta);
    trimMapToLimit(state.responseMetaByUrl, MAX_RESPONSE_META_ENTRIES);
};

const fetchImageObjectUrlByAbs = async (absUrl) => {
    const abs = normalizeText(absUrl);
    if (!abs) return '';

    if (state.imageObjectUrlByAbsUrl.has(abs)) {
        return state.imageObjectUrlByAbsUrl.get(abs) || '';
    }
    if (state.imageFailedAbsUrls.has(abs)) return '';
    if (state.imagePromiseByAbsUrl.has(abs)) {
        return state.imagePromiseByAbsUrl.get(abs);
    }

    const p = (async () => {
        try {
            const resp = await cachedFetch(abs);
            if (!resp || !resp.ok) throw new Error(`image fetch failed: ${abs}`);

            const blob = await resp.blob();
            if (!(blob instanceof Blob)) throw new Error(`invalid image blob: ${abs}`);

            const objectUrl = URL.createObjectURL(blob);
            storeImageObjectUrl(abs, objectUrl);
            state.imageFailedAbsUrls.delete(abs);
            return objectUrl;
        } catch {
            state.imageFailedAbsUrls.add(abs);
            return '';
        } finally {
            state.imagePromiseByAbsUrl.delete(abs);
        }
    })();

    state.imagePromiseByAbsUrl.set(abs, p);
    return p;
};

export const resolveCachedImageSrc = async (candidates, { cacheKey = '' } = {}) => {
    const list = normalizeImageCandidates(candidates);
    if (!list.length) return '';

    const resolutionKey = buildImageResolutionKey(list, cacheKey);
    if (resolutionKey && state.resolvedImageSrcByKey.has(resolutionKey)) {
        return state.resolvedImageSrcByKey.get(resolutionKey) || '';
    }

    for (const candidate of list) {
        const abs = toAbsoluteUrl(candidate);
        if (!abs) continue;
        const src = await fetchImageObjectUrlByAbs(abs);
        if (!src) continue;
        if (resolutionKey) storeResolvedImageSrc(resolutionKey, src);
        return src;
    }

    if (resolutionKey) storeResolvedImageSrc(resolutionKey, '');
    return '';
};

export const primeCachedImage = async (candidates, options = {}) => {
    try {
        return await resolveCachedImageSrc(candidates, options);
    } catch {
        return '';
    }
};

export const getPreferredCachedImageSrc = (candidates, { cacheKey = '' } = {}) => {
    const list = normalizeImageCandidates(candidates);
    if (!list.length) return '';

    const resolutionKey = buildImageResolutionKey(list, cacheKey);
    if (resolutionKey && state.resolvedImageSrcByKey.has(resolutionKey)) {
        const resolved = state.resolvedImageSrcByKey.get(resolutionKey);
        if (resolved) return resolved;
    }

    for (const candidate of list) {
        const abs = toAbsoluteUrl(candidate);
        if (!abs) continue;
        const cached = state.imageObjectUrlByAbsUrl.get(abs);
        if (cached) return cached;
    }

    primeCachedImage(list, { cacheKey }).catch(() => null);
    return list[0] || '';
};

export const setImageElementFromCache = async (imgEl, candidates, { cacheKey = '', fallbackSrc = '' } = {}) => {
    const list = normalizeImageCandidates(candidates);
    if (!list.length) return '';
    if (!(typeof HTMLImageElement !== 'undefined' && imgEl instanceof HTMLImageElement)) return '';

    imageLoadRequestSeq += 1;
    const requestId = String(imageLoadRequestSeq);
    imgEl.dataset.fetchCacheReqId = requestId;

    const preferred = normalizeText(fallbackSrc) || getPreferredCachedImageSrc(list, { cacheKey });
    if (preferred) imgEl.src = preferred;

    const resolved = await resolveCachedImageSrc(list, { cacheKey });
    if (imgEl.dataset.fetchCacheReqId !== requestId) return '';

    if (resolved) {
        imgEl.src = resolved;
        return resolved;
    }

    if (preferred) {
        imgEl.src = preferred;
        return preferred;
    }

    return '';
};

export const registerCompanyLogoMap = (companyLogoMap, { preload = true, concurrency = 8 } = {}) => {
    state.companyLogoMap = companyLogoMap && typeof companyLogoMap === 'object' ? companyLogoMap : {};

    try {
        if (typeof window !== 'undefined') {
            window.TokyoRailCompanyLogoMap = state.companyLogoMap;
            window.TokyoRailCompanyLogoBasePath = COMPANY_LOGO_BASE_PATH;
        }
    } catch {
        // ignore
    }

    if (preload) {
        preloadCompanyLogos(state.companyLogoMap, { concurrency }).catch(() => null);
    }

    return state.companyLogoMap;
};

export const clearFetchCache = ({ preserveImages = true, preserveResponses = true } = {}) => {
    state.responsePromiseByUrl.clear();
    state.jsonPromiseByUrl.clear();
    state.stationGroupsPromise = null;
    state.preloadAllPromise = null;

    if (!preserveResponses) {
        state.responseMetaByUrl.clear();
    }

    if (!preserveImages) {
        for (const value of state.imageObjectUrlByAbsUrl.values()) {
            revokeObjectUrl(value);
        }
        state.imageObjectUrlByAbsUrl.clear();
        state.imageFailedAbsUrls.clear();
        state.resolvedImageSrcByKey.clear();
    }
};

export const getCompanyLogoSrc = (companyKey, companyLogoMap = state.companyLogoMap) => {
    if (shouldHideCompanyLogos()) return '';

    const key = normalizeText(companyKey);
    if (!key) return '';

    const map = companyLogoMap && typeof companyLogoMap === 'object' ? companyLogoMap : state.companyLogoMap;
    const file = normalizeText(map?.[key]?.img?.[0]);
    if (!file) return '';

    const candidates = getCompanyLogoCandidates(file);
    return getPreferredCachedImageSrc(candidates, { cacheKey: `companyLogo:${file}` });
};

export const preloadCompanyLogos = async (companyLogoMap = state.companyLogoMap, { concurrency = 8 } = {}) => {
    if (shouldHideCompanyLogos()) return { total: 0, loaded: 0, skipped: true };

    const map = companyLogoMap && typeof companyLogoMap === 'object' ? companyLogoMap : {};
    const files = Array.from(new Set(
        Object.values(map)
            .map((row) => normalizeText(row?.img?.[0]))
            .filter(Boolean)
    ));

    let loaded = 0;
    const tasks = files.map((file) => async () => {
        const src = await primeCachedImage(getCompanyLogoCandidates(file), { cacheKey: `companyLogo:${file}` });
        if (src) loaded += 1;
    });

    await runWithConcurrency(tasks, concurrency);
    return { total: files.length, loaded };
};

export const preloadIcons = async (iconFiles = [], { concurrency = 8 } = {}) => {
    const files = Array.from(new Set(
        (Array.isArray(iconFiles) ? iconFiles : [])
            .map((x) => normalizeText(x))
            .filter(Boolean)
    ));

    let loaded = 0;
    const tasks = files.map((file) => async () => {
        const src = await primeCachedImage(getIconCandidates(file), { cacheKey: `icon:${file}` });
        if (src) loaded += 1;
    });

    await runWithConcurrency(tasks, concurrency);
    return { total: files.length, loaded };
};

const buildResponseFromMeta = (meta) => {
    const body = meta?.body instanceof ArrayBuffer ? meta.body.slice(0) : (meta?.body || null);
    const resp = new Response(body, {
        status: Number(meta?.status) || 200,
        statusText: normalizeText(meta?.statusText) || 'OK',
        headers: Array.isArray(meta?.headers) ? meta.headers : []
    });
    return resp;
};

const storeResponseMetaFromResponse = async (url, resp) => {
    let bodyBuffer = new ArrayBuffer(0);
    try {
        bodyBuffer = await resp.arrayBuffer();
    } catch {
        bodyBuffer = new ArrayBuffer(0);
    }

    const headers = [];
    try {
        resp.headers.forEach((value, key) => headers.push([key, value]));
    } catch {
        // ignore
    }

    const meta = {
        url,
        status: resp.status,
        statusText: resp.statusText,
        headers,
        body: bodyBuffer
    };

    storeResponseMeta(url, meta);
    return meta;
};

const fetchAndStore = async (url, input, init) => {
    const nativeFetch = state.nativeFetch || fetch.bind(window);
    if (shouldUseElectronLocalRead(url) && getRangeHeader(init)) {
        const rangeMeta = await fetchViaElectronLocalRead(url, init);
        if (rangeMeta) {
            storeResponseMeta(url, rangeMeta);
            return buildResponseFromMeta(rangeMeta);
        }
    }
    try {
        const resp = await nativeFetch(input, init);

        // file:// 下 fetch 在不同平台行为不一致，优先回退到 Electron 的本地读取。
        if (shouldUseElectronLocalRead(url) && (!resp || !resp.ok)) {
            const fallbackMeta = await fetchViaElectronLocalRead(url, init);
            if (fallbackMeta) {
                storeResponseMeta(url, fallbackMeta);
                return buildResponseFromMeta(fallbackMeta);
            }
        }

        const meta = await storeResponseMetaFromResponse(url, resp);
        return buildResponseFromMeta(meta);
    } catch (nativeErr) {
        const fallbackMeta = await fetchViaElectronLocalRead(url, init);
        if (fallbackMeta) {
            storeResponseMeta(url, fallbackMeta);
            return buildResponseFromMeta(fallbackMeta);
        }
        throw nativeErr;
    }
};

const fetchWithoutResponseCache = async (url, input, init) => {
    const nativeFetch = state.nativeFetch || fetch.bind(window);
    if (shouldUseElectronLocalRead(url) && getRangeHeader(init)) {
        const rangeMeta = await fetchViaElectronLocalRead(url, init);
        if (rangeMeta) return buildResponseFromMeta(rangeMeta);
    }
    try {
        const resp = await nativeFetch(input, init);

        if (shouldUseElectronLocalRead(url) && (!resp || !resp.ok)) {
            const fallbackMeta = await fetchViaElectronLocalRead(url, init);
            if (fallbackMeta) return buildResponseFromMeta(fallbackMeta);
        }

        return resp;
    } catch (nativeErr) {
        const fallbackMeta = await fetchViaElectronLocalRead(url, init);
        if (fallbackMeta) return buildResponseFromMeta(fallbackMeta);
        throw nativeErr;
    }
};

const getCachedJsonRaw = async (url) => {
    const resolvedUrl = resolveManagedDataUrl(url);
    const abs = toAbsoluteUrl(resolvedUrl);
    if (!abs) return null;
    if (shouldBypassResponseCache(abs)) {
        const resp = await cachedFetch(abs);
        if (!resp.ok) return null;
        return resp.json();
    }

    if (!state.jsonPromiseByUrl.has(abs)) {
        const p = cachedFetch(abs)
            .then(async (resp) => {
                if (!resp.ok) return null;
                return resp.json();
            })
            .catch(() => null);
        state.jsonPromiseByUrl.set(abs, p);
    }

    return state.jsonPromiseByUrl.get(abs);
};

const isStationGroupsUrl = (url) => {
    const abs = toAbsoluteUrl(resolveManagedDataUrl(url));
    const stationGroupsAbs = toAbsoluteUrl(STATION_GROUPS_URL);
    return Boolean(abs && stationGroupsAbs && abs === stationGroupsAbs);
};

export const cachedFetch = async (input, init = {}) => {
    const requestInput = resolveManagedDataInput(input);

    if (!shouldCacheRequest(requestInput, init)) {
        const nativeFetch = state.nativeFetch || fetch.bind(window);
        return nativeFetch(requestInput, init);
    }

    const url = toAbsoluteUrl(requestInput);
    if (!url) {
        const nativeFetch = state.nativeFetch || fetch.bind(window);
        return nativeFetch(requestInput, init);
    }

    if (shouldBypassResponseCache(url)) {
        return fetchWithoutResponseCache(url, requestInput, init);
    }

    const existingMeta = state.responseMetaByUrl.get(url);
    if (existingMeta) return buildResponseFromMeta(existingMeta);

    if (!state.responsePromiseByUrl.has(url)) {
        const p = fetchAndStore(url, requestInput, init)
            .catch((err) => {
                state.responsePromiseByUrl.delete(url);
                throw err;
            })
            .finally(() => {
                state.responsePromiseByUrl.delete(url);
            });
        state.responsePromiseByUrl.set(url, p);
    }

    const resp = await state.responsePromiseByUrl.get(url);
    return resp;
};

export const getCachedJson = async (url) => {
    if (isStationGroupsUrl(url)) return getCachedStationGroups();
    return getCachedJsonRaw(url);
};

export const getDataAssetJson = async (key) => getCachedJson(getDataAssetUrl(key));

export const getCachedStationGroups = async () => {
    if (!state.stationGroupsPromise) {
        state.stationGroupsPromise = (async () => {
            const primaryGroups = await getCachedJsonRaw(STATION_GROUPS_URL);
            const supplementalGroups = await getCachedJsonRaw(SUPPLEMENTAL_STATION_GROUPS_URL).catch(() => null);
            return mergeStationGroups(
                Array.isArray(primaryGroups) ? primaryGroups : [],
                Array.isArray(supplementalGroups) ? supplementalGroups : []
            );
        })();
    }
    return state.stationGroupsPromise;
};

const toFileStem = (lineId) => {
    const raw = normalizeText(lineId);
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

export const preloadAllDataAssets = async ({ includeTimetables = false, timetableConcurrency = 8 } = {}) => {
    if (state.preloadAllPromise) return state.preloadAllPromise;

    state.preloadAllPromise = (async () => {
        const coreUrls = Array.from(new Set(defaultCoreUrls.map((u) => toAbsoluteUrl(u)).filter(Boolean)));
        await Promise.all(coreUrls.map((u) => cachedFetch(u).catch(() => null)));

        const railways = await getDataAssetJson('railways');
        const railwayIds = (Array.isArray(railways) ? railways : [])
            .map((row) => normalizeText(row?.id))
            .filter(Boolean);

        if (includeTimetables && railwayIds.length) {
            const timetableTasks = Array.from(new Set(railwayIds))
                .map((lineId) => toFileStem(lineId))
                .filter(Boolean)
                .map((stem) => async () => {
                    const url = `./data/train-timetables/${encodeURIComponent(stem)}.json`;
                    await cachedFetch(url).catch(() => null);
                });

            await runWithConcurrency(timetableTasks, timetableConcurrency);
        }

        return {
            coreCount: coreUrls.length,
            railwayCount: railwayIds.length,
            timetablesPreloaded: includeTimetables
        };
    })();

    try {
        return await state.preloadAllPromise;
    } finally {
        // keep resolved promise for one-time semantics
    }
};

export const initializeFetchCache = () => {
    if (state.installed) return;

    state.nativeFetch = (typeof window !== 'undefined' && typeof window.fetch === 'function')
        ? window.fetch.bind(window)
        : fetch.bind(globalThis);

    const patched = (input, init) => cachedFetch(input, init);

    if (typeof window !== 'undefined') {
        window.fetch = patched;
        window.TokyoRailFetchCache = {
            DATA_URLS,
            getDataAssetUrl,
            getDataAssetJson,
            getCachedJson,
            getCachedStationGroups,
            preloadAllDataAssets,
            clearFetchCache,
            getIconCandidates,
            getCompanyLogoCandidates,
            resolveCachedImageSrc,
            getPreferredCachedImageSrc,
            setImageElementFromCache,
            primeCachedImage,
            registerCompanyLogoMap,
            getCompanyLogoSrc,
            preloadCompanyLogos,
            preloadIcons
        };
        if (window.TokyoRailCompanyLogoMap == null) window.TokyoRailCompanyLogoMap = state.companyLogoMap || {};
        if (!window.TokyoRailCompanyLogoBasePath) window.TokyoRailCompanyLogoBasePath = COMPANY_LOGO_BASE_PATH;
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.fetch = patched;
    }

    state.installed = true;

    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('__TokyoRailFetchCacheReady'));
        }
    } catch {
        // ignore
    }
};
