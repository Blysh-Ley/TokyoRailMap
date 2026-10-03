const STATIONS_LAYER_ID = 'stations-layer';
const DEFAULT_MAX_STATIONS = 64;

const getStationId = (feature) => String(feature?.properties?.id || feature?.id || '').trim();

const getPointCoordinates = (feature) => {
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
    return coordinates.length >= 2 && coordinates.slice(0, 2).every(Number.isFinite)
        ? coordinates.slice(0, 2)
        : null;
};

const isFinitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

/**
 * Read-only diagnostics for station circles. Call after a map render: source
 * submissions are not evidence that their coordinates have reached the renderer.
 * Map access stays behind mapEngine; expected coordinates use the existing pure
 * offset calculation, limited to the sampled visible stations.
 */
export const createStationOffsetVisualSampler = ({
    mapEngine,
    baseStationsGeoJSON,
    stationOffsetAlgorithmContext,
    buildStationOffsetGeoJSONAtZoom,
    getRenderedStationCircles,
    maxStations = DEFAULT_MAX_STATIONS
} = {}) => {
    const limit = Number.isFinite(maxStations) && maxStations >= 1
        ? Math.floor(maxStations)
        : DEFAULT_MAX_STATIONS;
    const baseFeaturesById = new Map();
    const baseFeatures = Array.isArray(baseStationsGeoJSON?.features) ? baseStationsGeoJSON.features : [];
    for (const feature of baseFeatures) {
        const id = getStationId(feature);
        if (id) baseFeaturesById.set(id, feature);
    }
    const contextById = new Map(Object.entries(
        stationOffsetAlgorithmContext?.stationLocalChainsById || {}
    ));

    return function sampleRenderedOffsets() {
        let zoom = null;
        let visibleStationCount = 0;
        let truncated = false;
        const unavailable = () => ({
            status: 'unavailable',
            zoom,
            stationCount: 0,
            visibleStationCount,
            truncated,
            maxErrorPx: null,
            meanErrorPx: null,
            worstStationId: null
        });
        try {
            if (typeof mapEngine?.hasLayer !== 'function'
                || typeof mapEngine?.getZoom !== 'function'
                || typeof mapEngine?.queryRenderedFeatures !== 'function'
                || typeof mapEngine?.project !== 'function'
                || typeof buildStationOffsetGeoJSONAtZoom !== 'function') return unavailable();
            const currentZoom = mapEngine.getZoom();
            if (!Number.isFinite(currentZoom)) return unavailable();
            zoom = currentZoom;
            if (!mapEngine.hasLayer(STATIONS_LAYER_ID)) return unavailable();

            const renderedFeatures = getRenderedStationCircles?.() || mapEngine.queryRenderedFeatures({ layers: [STATIONS_LAYER_ID] });
            if (!Array.isArray(renderedFeatures)) return unavailable();
            const renderedById = new Map();
            for (const feature of renderedFeatures) {
                const id = getStationId(feature);
                if (!id || !contextById.has(id) || renderedById.has(id)) continue;
                const units = Number(contextById.get(id)?.units);
                if (!Number.isFinite(units) || units === 0) continue;
                renderedById.set(id, feature);
            }
            visibleStationCount = renderedById.size;
            truncated = visibleStationCount > limit;
            if (!visibleStationCount) return unavailable();

            const samples = Array.from(renderedById.entries()).slice(0, limit);
            const sampleFeatures = [];
            const sampleContext = Object.create(null);
            for (const [id] of samples) {
                const baseFeature = baseFeaturesById.get(id);
                if (!baseFeature || !getPointCoordinates(baseFeature)) return unavailable();
                sampleFeatures.push(baseFeature);
                sampleContext[id] = contextById.get(id);
            }
            const expectedGeoJSON = buildStationOffsetGeoJSONAtZoom({
                baseStationsGeoJSON: { type: 'FeatureCollection', features: sampleFeatures },
                stationOffsetAlgorithmContext: {
                    ...stationOffsetAlgorithmContext,
                    stationLocalChainsById: sampleContext
                },
                zoom
            });
            if (!Array.isArray(expectedGeoJSON?.features)) return unavailable();
            const expectedById = new Map(expectedGeoJSON.features.map((feature) => [getStationId(feature), feature]));
            let totalErrorPx = 0;
            let maxErrorPx = -1;
            let worstStationId = null;
            for (const [id, feature] of samples) {
                const actualCoordinates = getPointCoordinates(feature);
                const expectedCoordinates = getPointCoordinates(expectedById.get(id));
                if (!actualCoordinates || !expectedCoordinates) return unavailable();
                // Compare the same world copy when the map crosses the antimeridian.
                expectedCoordinates[0] += 360 * Math.round((actualCoordinates[0] - expectedCoordinates[0]) / 360);
                if (Number.isFinite(feature.renderedZoom) && Math.abs(feature.renderedZoom - zoom) > 0.001) return unavailable();
                const actualPoint = feature.screenPoint || mapEngine.project(actualCoordinates);
                const expectedPoint = mapEngine.project(expectedCoordinates);
                if (!isFinitePoint(actualPoint) || !isFinitePoint(expectedPoint)) return unavailable();
                const errorPx = Math.hypot(actualPoint.x - expectedPoint.x, actualPoint.y - expectedPoint.y);
                if (!Number.isFinite(errorPx)) return unavailable();
                totalErrorPx += errorPx;
                if (errorPx > maxErrorPx) {
                    maxErrorPx = errorPx;
                    worstStationId = id;
                }
            }
            return {
                status: 'sampled',
                zoom,
                stationCount: samples.length,
                visibleStationCount,
                truncated,
                maxErrorPx,
                meanErrorPx: totalErrorPx / samples.length,
                worstStationId
            };
        } catch {
            return unavailable();
        }
    };
};
