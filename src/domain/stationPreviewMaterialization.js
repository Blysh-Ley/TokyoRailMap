const toText = (value) => String(value ?? '').trim();

export const getStationPreviewTargets = (features = []) => features.filter((feature) => {
    const value = feature?.properties?.serving_ids;
    const ids = typeof value === 'string' ? JSON.parse(value) : value;
    return new Set((Array.isArray(ids) ? ids : []).map(toText).filter(Boolean)).size >= 6;
});

export const stationPreviewVariantKey = (stationId, serviceDay, theme, profile) => (
    `${profile}||${toText(stationId)}||${serviceDay}||${theme}`
);

const encodeSets = (value) => JSON.parse(JSON.stringify(value, (_key, item) => (
    item instanceof Set ? { $stationPreviewSet: [...item] } : item
)));

const decodeSets = (value) => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(decodeSets);
    if (value.$stationPreviewSet) return new Set(value.$stationPreviewSet.map(decodeSets));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeSets(item)]));
};

const createPool = () => {
    const values = [];
    const ids = new Map();
    return {
        values,
        add(value) {
            const key = JSON.stringify(value);
            if (!ids.has(key)) {
                ids.set(key, values.length);
                values.push(value);
            }
            return ids.get(key);
        }
    };
};

// 多站共享完全相同的几何、要素和虚拟班次；索引顺序保留原预览输出。
export const createStationPreviewAtlasBuilder = () => {
    const geometries = createPool();
    const lines = createPool();
    const stops = createPool();
    const trips = createPool();
    const signatures = createPool();
    const signatureIds = new Map();
    const tripKeys = createPool();
    const endpointLists = createPool();
    const builds = createPool();
    const entries = {};
    const addSignature = (signature) => {
        if (!signatureIds.has(signature)) {
            const requests = JSON.parse(signature).map((request) => ({
                ...request,
                targetTripKeys: request.targetTripKeys.map((key) => tripKeys.add(key))
            }));
            signatureIds.set(signature, signatures.add(requests));
        }
        return signatureIds.get(signature);
    };
    return {
        add({ stationId, serviceDay, theme, profile, requestsSignature, snapshot }) {
            const { payload, built, source } = snapshot;
            const lineIds = built.lineFc.features.map((feature) => lines.add({
                ...feature,
                geometry: geometries.add(feature.geometry)
            }));
            const stopIds = built.stopFc.features.map((feature) => stops.add(feature));
            entries[stationPreviewVariantKey(stationId, serviceDay, theme, profile)] = {
                requestsSignature: addSignature(requestsSignature),
                snapshot: {
                    source,
                    payload: {
                        ...payload,
                        originStationIds: endpointLists.add(payload.originStationIds),
                        terminalStationIds: endpointLists.add(payload.terminalStationIds),
                        endpointLabelCounts: endpointLists.add(payload.endpointLabelCounts),
                        virtualTrips: (payload.virtualTrips || []).map((trip) => trips.add(trip))
                    },
                    built: builds.add(encodeSets({
                        ...built,
                        lineFc: { ...built.lineFc, features: lineIds },
                        stopFc: { ...built.stopFc, features: stopIds }
                    }))
                }
            };
        },
        build() {
            return { version: 1, geometries: geometries.values, lines: lines.values,
                stops: stops.values, trips: trips.values, tripKeys: tripKeys.values,
                endpointLists: endpointLists.values, signatures: signatures.values, builds: builds.values, entries };
        }
    };
};

export const createStationPreviewAtlasReader = (atlas) => {
    const entries = new Map();
    const lines = new Map();
    const signatures = new Map();
    const readSignature = (index) => {
        if (!signatures.has(index)) {
            signatures.set(index, JSON.stringify(atlas.signatures[index].map((request) => ({
                ...request,
                targetTripKeys: request.targetTripKeys.map((key) => atlas.tripKeys[key])
            }))));
        }
        return signatures.get(index);
    };
    const readLine = (index) => {
        if (!lines.has(index)) {
            const feature = atlas.lines[index];
            lines.set(index, { ...feature, geometry: atlas.geometries[feature.geometry] });
        }
        return lines.get(index);
    };
    return {
        get(stationId, serviceDay, theme, profile) {
            const key = stationPreviewVariantKey(stationId, serviceDay, theme, profile);
            const entry = atlas.entries[key];
            if (!entry) return null;
            if (!entries.has(key)) {
                const snapshot = entry.snapshot;
                const built = decodeSets(atlas.builds[snapshot.built]);
                entries.set(key, {
                    requestsSignature: readSignature(entry.requestsSignature),
                    snapshot: {
                        source: snapshot.source,
                        payload: { ...snapshot.payload,
                            originStationIds: atlas.endpointLists[snapshot.payload.originStationIds],
                            terminalStationIds: atlas.endpointLists[snapshot.payload.terminalStationIds],
                            endpointLabelCounts: atlas.endpointLists[snapshot.payload.endpointLabelCounts],
                            virtualTrips: snapshot.payload.virtualTrips.map((index) => atlas.trips[index]) },
                        built: { ...built,
                            lineFc: { ...built.lineFc, features: built.lineFc.features.map(readLine) },
                            stopFc: { ...built.stopFc, features: built.stopFc.features.map((index) => atlas.stops[index]) } }
                    }
                });
            }
            return entries.get(key);
        }
    };
};
