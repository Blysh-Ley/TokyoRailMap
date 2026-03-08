const normalizeText = (v) => String(v ?? '').trim();

const defaultCoreUrls = [
    './data/railways.json',
    './data/stations.json',
    './data/station-groups.json',
    './data/train-types.json',
    './data/railways-order.json',
    './data/operators.json',
    './data/rail-directions.json',
    './data/train-vehicles.json',
    './data/train-types.json',
    './data/poi.json',
    './data/airports.json',
    './data/coordinates.json'
];

const state = {
    installed: false,
    nativeFetch: null,
    responseMetaByUrl: new Map(),
    responsePromiseByUrl: new Map(),
    jsonPromiseByUrl: new Map(),
    preloadAllPromise: null
};

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

const shouldCacheRequest = (input, init = {}) => {
    const reqMethod = normalizeText(init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (reqMethod && reqMethod !== 'GET') return false;
    if (init?.body != null) return false;
    return true;
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

const fetchAndStore = async (url, input, init) => {
    const nativeFetch = state.nativeFetch || fetch.bind(window);
    const resp = await nativeFetch(input, init);

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

    state.responseMetaByUrl.set(url, meta);
    return buildResponseFromMeta(meta);
};

export const cachedFetch = async (input, init = {}) => {
    if (!shouldCacheRequest(input, init)) {
        const nativeFetch = state.nativeFetch || fetch.bind(window);
        return nativeFetch(input, init);
    }

    const url = toAbsoluteUrl(input);
    if (!url) {
        const nativeFetch = state.nativeFetch || fetch.bind(window);
        return nativeFetch(input, init);
    }

    const existingMeta = state.responseMetaByUrl.get(url);
    if (existingMeta) return buildResponseFromMeta(existingMeta);

    if (!state.responsePromiseByUrl.has(url)) {
        const p = fetchAndStore(url, input, init)
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
    const abs = toAbsoluteUrl(url);
    if (!abs) return null;

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

export const preloadAllDataAssets = async ({ includeTimetables = true, timetableConcurrency = 8 } = {}) => {
    if (state.preloadAllPromise) return state.preloadAllPromise;

    state.preloadAllPromise = (async () => {
        const coreUrls = Array.from(new Set(defaultCoreUrls.map((u) => toAbsoluteUrl(u)).filter(Boolean)));
        await Promise.all(coreUrls.map((u) => cachedFetch(u).catch(() => null)));

        const railways = await getCachedJson('./data/railways.json');
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
            getCachedJson,
            preloadAllDataAssets
        };
    }
    if (typeof globalThis !== 'undefined') {
        globalThis.fetch = patched;
    }

    state.installed = true;
};
