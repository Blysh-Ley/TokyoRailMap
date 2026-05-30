const DEFAULT_STORAGE_KEY = 'zoomlevel-bookmark';

const readRecords = (storage, storageKey) => {
    try {
        const records = JSON.parse(storage?.getItem?.(storageKey) || '[]');
        return Array.isArray(records) ? records : [];
    } catch {
        return [];
    }
};

const writeRecords = (storage, storageKey, records) => {
    storage?.setItem?.(storageKey, JSON.stringify(records));
};

export const registerDebugZoomTools = ({
    map,
    mapEngine,
    target = window,
    storage = globalThis.localStorage,
    storageKey = DEFAULT_STORAGE_KEY
} = {}) => {
    if (!target || !mapEngine) return false;

    target.getZoomInfo = () => {
        if (!map) return;
        const zoom = mapEngine.getZoom();
        const center = mapEngine.getCenter();
        const pitch = mapEngine.getPitch();
        const bearing = mapEngine.getBearing();
        console.log(`Current map state - Zoom: ${zoom.toFixed(2)}, Center: [${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}], Pitch: ${pitch.toFixed(1)}, Bearing: ${bearing.toFixed(1)}`);
    };

    target.saveZoom = (remark = false) => {
        if (!map) return;
        const zoom = mapEngine.getZoom();
        const center = mapEngine.getCenter();
        const pitch = mapEngine.getPitch();
        const bearing = mapEngine.getBearing();
        const records = readRecords(storage, storageKey);
        const nextRemark = remark === false ? `u${records.length + 1}` : remark;
        records.push({ zoom, center, pitch, bearing, remark: nextRemark });
        writeRecords(storage, storageKey, records);
        console.log('Map state saved');
    };

    target.showZoomRecords = () => {
        const records = readRecords(storage, storageKey);
        records.forEach((rec) => {
            rec.zoom = rec.zoom.toFixed(2);
            rec.centerLat = rec.center.lat.toFixed(3);
            rec.centerLon = rec.center.lng.toFixed(3);
            delete rec.center;
        });
        console.table(records);
    };

    target.clearZoomRecords = () => {
        storage?.removeItem?.(storageKey);
        console.log('Map zoom records cleared');
    };

    target.setZoom = (remark) => {
        const records = readRecords(storage, storageKey);
        const record = records.find((item) => item.remark === remark);
        if (!record) return;

        mapEngine.flyTo({
            zoom: record.zoom,
            center: record.center,
            pitch: record.pitch,
            bearing: record.bearing,
            essential: true
        });
        console.log(`Flew to map bookmark "${remark}"`);
    };

    return true;
};
