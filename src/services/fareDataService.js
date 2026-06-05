import { getCachedJson } from '../lib/fetch.js';

export const DEFAULT_FARE_GRAPH_URL = './data/fare-map-tokyo/fare_graph.json';
export const DEFAULT_STATION_GRAPH_URL = './data/fare-map-tokyo/station_graph.json';

const state = {
    promiseByUrl: new Map()
};

const isFareGraphLike = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const loadFareGraph = async ({
    stationGraphUrl = DEFAULT_STATION_GRAPH_URL,
    url = DEFAULT_FARE_GRAPH_URL
} = {}) => {
    const graphUrl = String(url || DEFAULT_FARE_GRAPH_URL);
    const stationUrl = String(stationGraphUrl || DEFAULT_STATION_GRAPH_URL);
    const cacheKey = `${graphUrl}|${stationUrl}`;
    if (!state.promiseByUrl.has(cacheKey)) {
        const promise = Promise.all([
            getCachedJson(graphUrl),
            getCachedJson(stationUrl).catch(() => null)
        ])
            .then(([fareGraph, stationGraph]) => {
                if (!isFareGraphLike(fareGraph)) {
                    return {
                        fareGraph: null,
                        stationGraph: null,
                        status: 'missing',
                        url: graphUrl
                    };
                }
                return {
                    fareGraph,
                    stationGraph: isFareGraphLike(stationGraph) ? stationGraph : null,
                    status: 'ready',
                    url: graphUrl,
                    stationGraphUrl: stationUrl
                };
            })
            .catch((error) => ({
                fareGraph: null,
                stationGraph: null,
                status: 'missing',
                url: graphUrl,
                stationGraphUrl: stationUrl,
                errorMessage: String(error?.message || error || '')
            }));
        state.promiseByUrl.set(cacheKey, promise);
    }

    return state.promiseByUrl.get(cacheKey);
};

export const clearFareDataServiceCache = () => {
    state.promiseByUrl.clear();
};
