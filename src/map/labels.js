import {
    getFocusedStationLabelPriority,
    isTerminalStationLabel
} from '../domain/stationLabelDisplay.js';

/**
 * 创建站名 DOM Marker（文字标签）。
 * 同时返回用于“圆点碰撞检测”的站点列表（按站点 id 过滤 circle layer）。
 */
const resolveMarkerAdapter = (mapOrEngine, maplibregl) => {
    if (mapOrEngine && typeof mapOrEngine.createMarker === 'function') {
        return {
            createMarker: (options) => mapOrEngine.createMarker(options),
            addMarker: (marker) => mapOrEngine.addMarker(marker)
        };
    }

    return {
        createMarker: (options) => new maplibregl.Marker(options),
        addMarker: (marker) => marker?.addTo?.(mapOrEngine)
    };
};

export function buildStationLabelGeoJSON(stationsData) {
    const features = [];
    const stationFeatures = Array.isArray(stationsData?.features) ? stationsData.features : [];

    stationFeatures.forEach((feature) => {
        if (!feature || feature.geometry?.type !== 'Point') return;
        const coordinates = feature.geometry.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;

        const props = feature.properties || {};
        const stationId = props.id || feature.id;
        const name = props.name_zh || props.name;
        if (!stationId || !name) return;

        const servingIds = Array.isArray(props.serving_ids) ? props.serving_ids.map(String) : [];
        const priority = servingIds.length;
        const isTerminalStation = isTerminalStationLabel({ props });
        const focusPriority = getFocusedStationLabelPriority({ priority, isTerminalStation });

        features.push({
            type: 'Feature',
            id: stationId,
            properties: {
                ...props,
                id: stationId,
                name,
                priority,
                focus_priority: focusPriority,
                is_terminal_station: isTerminalStation ? 1 : 0,
                hidden_by_opacity_zero: Number(props.hidden_by_opacity_zero) === 1 || props.hidden_by_opacity_zero === true ? 1 : 0
            },
            geometry: {
                type: 'Point',
                coordinates: coordinates.slice()
            }
        });
    });

    return {
        type: 'FeatureCollection',
        features
    };
}

export function createStationMarkers(mapOrEngine, maplibreglOrStationsData, stationsDataMaybe, optionsMaybe = {}) {
    const usingMapEngine = mapOrEngine && typeof mapOrEngine.createMarker === 'function';
    const maplibregl = usingMapEngine ? null : maplibreglOrStationsData;
    const stationsData = usingMapEngine ? maplibreglOrStationsData : stationsDataMaybe;
    const options = usingMapEngine ? (stationsDataMaybe || {}) : optionsMaybe;
    const attachMarkers = options.attachMarkers !== false;
    const markerAdapter = resolveMarkerAdapter(mapOrEngine, maplibregl);
    const stationLabels = [];
    const stationCircles = [];

    if (!stationsData || !Array.isArray(stationsData.features)) {
        return { stationLabels, stationCircles };
    }

    stationsData.features.forEach((feature) => {
        if (!feature || !feature.geometry || feature.geometry.type !== 'Point') return;

        const coordinates = feature.geometry.coordinates;
        const props = feature.properties || {};
        const propsSnapshot = { ...props };
        const stationId = props.id || feature.id;
        const name = props.name_zh || props.name;
        // serving_ids：用于判断换乘站优先级（全服务线路集合）
        const servingIds = Array.isArray(props.serving_ids) ? props.serving_ids.map(String) : [];
        // platform_line_id：用于“当前高亮线路是否命中该站台/点”
        const platformIds = Array.isArray(props.platform_line_id)
            ? props.platform_line_id.map(String)
            : servingIds;

        const priority = servingIds.length;
        const isTerminalStation = isTerminalStationLabel({ props });
        const focusPriority = getFocusedStationLabelPriority({ priority, isTerminalStation });
        const servingLineIds = platformIds;
        const hiddenByOpacityZero = Number(props.hidden_by_opacity_zero) === 1 || props.hidden_by_opacity_zero === true;

        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        if (!name) return;

        const el = document.createElement('div');
        el.className = 'station-label';
        el.textContent = name;

        // 站名标签上移：换乘站 6px，非换乘站 3px（只在这里集中设置）
        const labelDyPx = priority > 1 ? 6 : 3;
        el.style.translate = `0 -${labelDyPx}px`;

        const label = {
            marker: null,
            el,
            stationId,
            coordinates,
            props: propsSnapshot,
            priority,
            focusPriority,
            isTerminalStation,
            servingLineIds,
            hiddenByOpacityZero,
            labelDyPx,
            width: null,
            height: null,
            ensureMarker: () => {
                if (label.marker) return label.marker;
                const marker = markerAdapter.createMarker({ element: el, anchor: 'bottom' })
                    .setLngLat(label.coordinates);
                markerAdapter.addMarker(marker);
                label.marker = marker;
                return marker;
            },
            removeMarker: () => {
                if (!label.marker) return;
                try {
                    label.marker.remove?.();
                } catch {
                    // ignore stale marker cleanup errors
                }
                label.marker = null;
            }
        };

        if (attachMarkers) label.ensureMarker();
        stationLabels.push(label);

        if (stationId) {
            stationCircles.push({
                stationId,
                coordinates,
                priority,
                servingLineIds,
                hiddenByOpacityZero
            });
        }
    });

    return { stationLabels, stationCircles };
}
