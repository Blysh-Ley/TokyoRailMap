export const createJourneyPickController = ({
    formatCoordinates,
    getNearbyStationsForJourneyPick,
    mapActions,
    normalizeText,
    maxNearbyMeters = 2000
} = {}) => {
    const normalize = typeof normalizeText === 'function'
        ? normalizeText
        : (value) => String(value ?? '').trim();

    const showStationPin = async ({ label = '', type, stationId } = {}) => {
        await mapActions?.clearJourneyPickPin?.(type);
        return mapActions?.showJourneyPickPin?.({ label, stationId: normalize(stationId), type });
    };

    const showCoordinatePin = async ({ label = '', type, lngLat } = {}) => {
        await mapActions?.clearJourneyPickPin?.(type);
        return mapActions?.showJourneyPickPin?.({ label, lngLat, type });
    };

    const resolveCoordinatePick = async ({ lngLat } = {}) => {
        const coordsText = typeof formatCoordinates === 'function' ? formatCoordinates(lngLat) : '';
        if (!coordsText) return null;

        let nearbyStations = [];
        try {
            nearbyStations = await getNearbyStationsForJourneyPick?.({ lngLat, maxMeters: maxNearbyMeters });
        } catch {
            nearbyStations = [];
        }

        const candidateMeta = (Array.isArray(nearbyStations) ? nearbyStations : []).slice(0, 3);
        const candidateIds = Array.from(new Set(
            candidateMeta.map((item) => normalize(item?.stationId || '')).filter(Boolean)
        ));
        const lng = Number(lngLat?.lng ?? lngLat?.[0]);
        const lat = Number(lngLat?.lat ?? lngLat?.[1]);

        return {
            candidateIds,
            candidateMeta,
            coordsText,
            lngLat: [lng, lat]
        };
    };

    return Object.freeze({
        clearPin: (type) => mapActions?.clearJourneyPickPin?.(type),
        onMapPickClick: (listener) => mapActions?.onMapPickClick?.(listener),
        resolveCoordinatePick,
        showCoordinatePin,
        showStationPin
    });
};
