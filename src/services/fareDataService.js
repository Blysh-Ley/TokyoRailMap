import { getCachedJson } from '../lib/fetch.js';

export const DEFAULT_FARE_GRAPH_URL = './data/fare-map-tokyo/fare_graph.json';

const state = {
    promiseByUrl: new Map()
};

const isFareGraphLike = (value) => value && typeof value === 'object' && !Array.isArray(value);

export const loadFareGraph = async ({ url = DEFAULT_FARE_GRAPH_URL } = {}) => {
    const graphUrl = String(url || DEFAULT_FARE_GRAPH_URL);
    if (!state.promiseByUrl.has(graphUrl)) {
        const promise = getCachedJson(graphUrl)
            .then((data) => {
                if (!isFareGraphLike(data)) {
                    return {
                        fareGraph: null,
                        status: 'missing',
                        url: graphUrl
                    };
                }
                return {
                    fareGraph: data,
                    status: 'ready',
                    url: graphUrl
                };
            })
            .catch((error) => ({
                fareGraph: null,
                status: 'missing',
                url: graphUrl,
                errorMessage: String(error?.message || error || '')
            }));
        state.promiseByUrl.set(graphUrl, promise);
    }

    return state.promiseByUrl.get(graphUrl);
};

export const clearFareDataServiceCache = () => {
    state.promiseByUrl.clear();
};
