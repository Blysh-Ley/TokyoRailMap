import { DEFAULT_BASEMAP_MODE, normalizeBasemapMode } from '../domain/basemapMode.js';
import {
    OSM_BASEMAP_ATTRIBUTION_ITEMS,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    OSM_BASEMAP_ATTRIBUTION_HTML,
    toPmtilesStyleUrl
} from '../domain/osmBasemapPackage.js';

const pmtilesProtocolTargets = new WeakSet();

export const createMapEngine = ({ maplibregl, container, center, zoom, style, localIdeographFontFamily = 'sans-serif' } = {}) => {
    if (!maplibregl?.Map) {
        throw new Error('MapLibre GL JS is not available');
    }

    const containerEl = typeof container === 'string' && typeof document !== 'undefined'
        ? document.getElementById(container)
        : container;
    const canCleanContainer = Boolean(containerEl && typeof containerEl.removeChild === 'function');

    if (canCleanContainer) {
        try {
            containerEl.__tokyoRailMapLibreInstance?.remove?.();
        } catch {
            // ignore stale MapLibre cleanup errors
        }
        while (containerEl.firstChild) {
            containerEl.removeChild(containerEl.firstChild);
        }
    }

    const map = new maplibregl.Map({
        container: containerEl || container,
        center,
        zoom,
        style,
        attributionControl: false,
        localIdeographFontFamily
    });

    if (canCleanContainer) {
        containerEl.__tokyoRailMapLibreInstance = map;
    }

    const ensureGeoJsonSource = (sourceId, data) => {
        if (!sourceId) return null;
        const existing = map.getSource(sourceId);
        if (existing) return existing;

        map.addSource(sourceId, {
            type: 'geojson',
            data: data || { type: 'FeatureCollection', features: [] }
        });
        return map.getSource(sourceId);
    };

    const ensureLayer = (layerDef, beforeLayerId) => {
        const layerId = layerDef?.id;
        if (!layerId) return null;
        const existing = map.getLayer(layerId);
        if (!existing) {
            if (beforeLayerId) map.addLayer(layerDef, beforeLayerId);
            else map.addLayer(layerDef);
            return map.getLayer(layerId);
        }
        if (beforeLayerId) {
            try {
                map.moveLayer(layerId, beforeLayerId);
            } catch {
                // keep existing layer order if MapLibre rejects the move
            }
        }
        return existing;
    };

    const applyPaintProperties = (layerId, paint = {}) => {
        if (!layerId || !map.getLayer(layerId)) return false;
        Object.entries(paint || {}).forEach(([property, value]) => {
            map.setPaintProperty(layerId, property, value);
        });
        return true;
    };

    const setLayerFilter = (layerId, filterExpr) => {
        if (!layerId || !map.getLayer(layerId)) return false;
        map.setFilter(layerId, filterExpr);
        return true;
    };

    const ensurePmtilesProtocol = () => {
        if (pmtilesProtocolTargets.has(maplibregl)) return true;
        const Protocol = globalThis.pmtiles?.Protocol;
        if (typeof maplibregl.addProtocol !== 'function' || typeof Protocol !== 'function') {
            return false;
        }
        const protocol = new Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        pmtilesProtocolTargets.add(maplibregl);
        return true;
    };

    const lineHighlightLabelMarkers = new Map();

    const toLabelText = (value) => String(value ?? '').trim();

    const createLineHighlightLabelElement = (item = {}) => {
        if (typeof document === 'undefined') return null;
        const color = toLabelText(item.color) || '#2f6fdf';
        const iconText = toLabelText(item.iconText);
        const lineName = toLabelText(item.lineName) || toLabelText(item.lineId);
        if (!lineName) return null;

        const el = document.createElement('div');
        el.className = 'map-line-highlight-label';
        el.style.setProperty('--line-highlight-label-color', color);

        const icon = document.createElement('span');
        icon.className = iconText
            ? 'map-line-highlight-label-icon'
            : 'map-line-highlight-label-icon map-line-highlight-label-icon-dot';
        icon.textContent = iconText;

        const name = document.createElement('span');
        name.className = 'map-line-highlight-label-name';
        name.textContent = lineName;

        el.append(icon, name);
        return el;
    };

    const getLineHighlightLabelSignature = (item = {}) => [
        toLabelText(item.lineId),
        toLabelText(item.lineName),
        toLabelText(item.iconText),
        toLabelText(item.color)
    ].join('|');

    const normalizeLineHighlightLabelItem = (item = {}) => {
        const lineId = toLabelText(item.lineId);
        const coordinate = Array.isArray(item.coordinate) ? item.coordinate : null;
        const lng = Number(coordinate?.[0]);
        const lat = Number(coordinate?.[1]);
        if (!lineId || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lineId,
            coordinate: [lng, lat],
            lineName: toLabelText(item.lineName) || lineId,
            iconText: toLabelText(item.iconText),
            color: toLabelText(item.color)
        };
    };

    const clearLineHighlightLabels = () => {
        for (const entry of lineHighlightLabelMarkers.values()) {
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
        }
        lineHighlightLabelMarkers.clear();
    };

    const renderLineHighlightLabels = (items = []) => {
        if (!Array.isArray(items) || !items.length) {
            clearLineHighlightLabels();
            return 0;
        }

        const normalizedItems = items
            .map(normalizeLineHighlightLabelItem)
            .filter(Boolean);
        const nextIds = new Set(normalizedItems.map((item) => item.lineId));

        for (const [lineId, entry] of lineHighlightLabelMarkers.entries()) {
            if (nextIds.has(lineId)) continue;
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
            lineHighlightLabelMarkers.delete(lineId);
        }

        for (const item of normalizedItems) {
            const signature = getLineHighlightLabelSignature(item);
            const existing = lineHighlightLabelMarkers.get(item.lineId);
            if (existing && existing.signature === signature) {
                existing.marker?.setLngLat?.(item.coordinate);
                continue;
            }

            if (existing) {
                try {
                    existing.marker?.remove?.();
                } catch {
                    // ignore stale marker cleanup errors
                }
            }

            const element = createLineHighlightLabelElement(item);
            if (!element) continue;
            const marker = new maplibregl.Marker({
                element,
                anchor: 'center',
                offset: [0, -18]
            }).setLngLat(item.coordinate);
            marker.addTo(map);
            lineHighlightLabelMarkers.set(item.lineId, { marker, signature });
        }

        return lineHighlightLabelMarkers.size;
    };

    return {
        getMap: () => map,
        addMetricScaleControl: ({ maxWidth = 100, position = 'bottom-left' } = {}) => {
            map.addControl(
                new maplibregl.ScaleControl({ maxWidth, unit: 'metric' }),
                position
            );
        },
        on: (...args) => map.on(...args),
        off: (...args) => map.off(...args),
        once: (...args) => map.once(...args),
        addControl: (...args) => map.addControl(...args),
        fitBounds: (...args) => map.fitBounds(...args),
        flyTo: (...args) => map.flyTo(...args),
        resize: (...args) => map.resize(...args),
        getBearing: (...args) => map.getBearing(...args),
        getBounds: (...args) => map.getBounds(...args),
        getCenter: (...args) => map.getCenter(...args),
        getPitch: (...args) => map.getPitch(...args),
        getZoom: (...args) => map.getZoom(...args),
        project: (...args) => map.project(...args),
        setPaintProperty: (...args) => map.setPaintProperty(...args),
        setLayoutProperty: (...args) => map.setLayoutProperty(...args),
        setFilter: (...args) => map.setFilter(...args),
        moveLayer: (...args) => map.moveLayer(...args),
        addSource: (...args) => map.addSource(...args),
        addLayer: (...args) => map.addLayer(...args),
        addImage: (...args) => map.addImage(...args),
        getLayer: (...args) => map.getLayer(...args),
        hasImage: (...args) => map.hasImage(...args),
        getSource: (...args) => map.getSource(...args),
        getCanvas: (...args) => map.getCanvas(...args),
        hasLayer: (layerId) => Boolean(layerId && map.getLayer(layerId)),
        queryRenderedFeatures: (...args) => map.queryRenderedFeatures(...args),
        applyPaintProperties,
        ensureGeoJsonSource,
        ensureLayer,
        ensurePmtilesProtocol,
        onMapClick: (listener) => {
            if (typeof listener !== 'function') return () => {};
            map.on('click', listener);
            return () => map.off('click', listener);
        },
        onLayerHover: (layerId, { onEnter, onMove, onLeave } = {}) => {
            if (!layerId) return () => {};
            if (typeof onEnter === 'function') map.on('mouseenter', layerId, onEnter);
            if (typeof onMove === 'function') map.on('mousemove', layerId, onMove);
            if (typeof onLeave === 'function') map.on('mouseleave', layerId, onLeave);
            return () => {
                if (typeof onEnter === 'function') map.off('mouseenter', layerId, onEnter);
                if (typeof onMove === 'function') map.off('mousemove', layerId, onMove);
                if (typeof onLeave === 'function') map.off('mouseleave', layerId, onLeave);
            };
        },
        setCursor: (cursor = '') => {
            const canvas = map.getCanvas?.();
            if (canvas?.style) canvas.style.cursor = cursor;
        },
        setLayerVisibility: (layerId, visible = true) => {
            if (!layerId || !map.getLayer(layerId)) return false;
            map.setLayoutProperty(layerId, 'visibility', visible === false ? 'none' : 'visible');
            return true;
        },
        setLayerFilter,
        setSourceData: (sourceId, data) => {
            const source = map.getSource(sourceId);
            source?.setData?.(data);
            return source;
        },
        clearLineHighlightLabels,
        renderLineHighlightLabels,
        updateGeoJsonSource: (sourceId, data) => {
            const source = ensureGeoJsonSource(sourceId, data);
            source?.setData?.(data || { type: 'FeatureCollection', features: [] });
            return source;
        },
        createMarker: (options = {}) => new maplibregl.Marker(options),
        addMarker: (marker) => marker?.addTo?.(map),
        createPopup: (options = {}) => new maplibregl.Popup(options),
        addPopup: (popup) => popup?.addTo?.(map)
    };
};

const OSM_VECTOR_SOURCE_ID = 'osm-vector-source';
const BASEMAP_GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

const getBasemapBackgroundColor = (theme) => (
    theme === 'dark' ? '#101216' : '#ffffff'
);

const getLayerVisibility = (mode, modes) => (
    modes.includes(mode) ? 'visible' : 'none'
);

const createTextField = () => ([
    'coalesce',
    ['get', 'name:ja'],
    ['get', 'name:en'],
    ['get', 'name']
]);

const createOsmBasemapSource = (pmtilesUrl) => ({
    type: 'vector',
    url: toPmtilesStyleUrl(pmtilesUrl),
    attribution: OSM_BASEMAP_ATTRIBUTION_HTML
});

const createOsmBasemapLayerItems = ({ mode = DEFAULT_BASEMAP_MODE, theme = 'light' } = {}) => {
    const dark = theme === 'dark';
    const textColor = dark ? '#d9dde5' : '#4f5663';
    const textHalo = dark ? '#101216' : '#ffffff';
    const roadColor = dark ? '#323846' : '#e7e9ee';
    const detailedRoadColor = dark ? '#4c5261' : '#d7dbe2';

    return [
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-water-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'water',
                paint: {
                    'fill-color': dark ? '#172435' : '#edf6fb',
                    'fill-opacity': mode === 'osm-detailed' ? 0.75 : 0.45
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-landuse-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'landuse',
                paint: {
                    'fill-color': dark ? '#172015' : '#f2f7ef',
                    'fill-opacity': 0.45
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-building-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'building',
                minzoom: 13,
                paint: {
                    'fill-color': dark ? '#2a2d34' : '#ece7df',
                    'fill-opacity': 0.55
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-road-layer',
                type: 'line',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'transportation',
                filter: [
                    'match',
                    ['get', 'class'],
                    ['motorway', 'trunk', 'primary', 'secondary'],
                    true,
                    false
                ],
                paint: {
                    'line-color': mode === 'osm-detailed' ? detailedRoadColor : roadColor,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        8,
                        mode === 'osm-detailed' ? 0.35 : 0.2,
                        14,
                        mode === 'osm-detailed' ? 1.4 : 0.65
                    ],
                    'line-opacity': mode === 'osm-detailed' ? 0.8 : 0.45
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-road-minor-layer',
                type: 'line',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'transportation',
                minzoom: 12,
                filter: [
                    'match',
                    ['get', 'class'],
                    ['minor', 'service', 'track', 'path'],
                    true,
                    false
                ],
                paint: {
                    'line-color': dark ? '#373c49' : '#e5e2dd',
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        12,
                        0.25,
                        16,
                        1.1
                    ],
                    'line-opacity': 0.65
                }
            }
        },
        {
            modes: ['osm-detailed'],
            layer: {
                id: 'osm-poi-label-layer',
                type: 'symbol',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'poi',
                minzoom: 14,
                layout: {
                    'text-field': createTextField(),
                    'text-size': 11,
                    'text-anchor': 'top',
                    'text-offset': [0, 0.7],
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': dark ? '#b6beca' : '#707782',
                    'text-halo-color': textHalo,
                    'text-halo-width': 1
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-place-label-layer',
                type: 'symbol',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'place',
                layout: {
                    'text-field': createTextField(),
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        6,
                        mode === 'osm-detailed' ? 11 : 10,
                        12,
                        mode === 'osm-detailed' ? 15 : 13
                    ],
                    'text-allow-overlap': false
                },
                paint: {
                    'text-color': textColor,
                    'text-halo-color': textHalo,
                    'text-halo-width': dark ? 1.4 : 1.1
                }
            }
        }
    ].map((item) => ({
        ...item,
        layer: {
            ...item.layer,
            layout: {
                ...(item.layer.layout || {}),
                visibility: getLayerVisibility(mode, item.modes)
            }
        }
    }));
};

const getOsmBasemapLayerIds = () => (
    createOsmBasemapLayerItems().map((item) => item.layer.id)
);

export const createOsmBasemapStyle = ({
    mode = DEFAULT_BASEMAP_MODE,
    theme = 'light',
    pmtilesAvailable = true,
    pmtilesUrl = DEFAULT_OSM_BASEMAP_PMTILES_URL
} = {}) => {
    const nextMode = normalizeBasemapMode(mode);
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    const layers = nextMode === 'transparent' || !pmtilesAvailable
        ? []
        : createOsmBasemapLayerItems({ mode: nextMode, theme: nextTheme })
            .filter((item) => item.modes.includes(nextMode))
            .map((item) => item.layer);

    return {
        version: 8,
        glyphs: BASEMAP_GLYPHS_URL,
        sources: pmtilesAvailable
            ? { [OSM_VECTOR_SOURCE_ID]: createOsmBasemapSource(pmtilesUrl) }
            : {},
        layers: [
            {
                id: 'tokyo-basemap-background-layer',
                type: 'background',
                paint: {
                    'background-color': getBasemapBackgroundColor(nextTheme),
                    'background-opacity': 1
                }
            },
            ...layers
        ]
    };
};

export const createBasemapController = ({
    mapEngine,
    initialTheme = 'light',
    initialMode = DEFAULT_BASEMAP_MODE,
    pmtilesAvailable = true,
    pmtilesUrl = DEFAULT_OSM_BASEMAP_PMTILES_URL,
    onThemeChanged
} = {}) => {
    if (!mapEngine) {
        throw new Error('basemapController requires mapEngine');
    }

    let theme = initialTheme === 'dark' ? 'dark' : 'light';
    let mode = normalizeBasemapMode(initialMode);
    let hasPmtilesArchive = pmtilesAvailable === true;
    const backgroundLayerId = 'tokyo-basemap-background-layer';
    const basemapLayerIds = Object.freeze(getOsmBasemapLayerIds());

    const getBackgroundColor = () => getBasemapBackgroundColor(theme);
    const getOverlayAnchorLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );
    const getFirstBasemapLayerId = () => basemapLayerIds.find((layerId) => mapEngine.getLayer(layerId)) || null;

    const normalizeBasemapLayerOrder = () => {
        const overlayAnchorLayerId = getOverlayAnchorLayerId();
        try {
            for (const layerId of basemapLayerIds) {
                if (overlayAnchorLayerId && mapEngine.getLayer(layerId)) {
                    mapEngine.moveLayer(layerId, overlayAnchorLayerId);
                }
            }

            const firstBasemapLayerId = getFirstBasemapLayerId();
            if (mapEngine.getLayer(backgroundLayerId)) {
                if (firstBasemapLayerId) mapEngine.moveLayer(backgroundLayerId, firstBasemapLayerId);
                else if (overlayAnchorLayerId) mapEngine.moveLayer(backgroundLayerId, overlayAnchorLayerId);
            }
        } catch {
            // keep current order if MapLibre rejects a move during style changes
        }
    };

    const getBasemapItems = () => createOsmBasemapLayerItems({ mode, theme });

    const applyTheme = (nextTheme) => {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        const items = getBasemapItems();

        try {
            for (const item of items) {
                const layerId = item.layer.id;
                if (!mapEngine.getLayer(layerId)) continue;
                mapEngine.setLayoutProperty(layerId, 'visibility', getLayerVisibility(mode, item.modes));
                Object.entries(item.layer.paint || {}).forEach(([key, value]) => {
                    mapEngine.setPaintProperty(layerId, key, value);
                });
            }
            if (mapEngine.getLayer(backgroundLayerId)) {
                mapEngine.setPaintProperty(backgroundLayerId, 'background-color', getBackgroundColor());
                mapEngine.setPaintProperty(backgroundLayerId, 'background-opacity', 1);
            }
            normalizeBasemapLayerOrder();

            const canvas = mapEngine.getCanvas?.();
            if (canvas?.style) canvas.style.background = getBackgroundColor();
            if (typeof onThemeChanged === 'function') onThemeChanged({ theme, mode });
        } catch {
            // ignore
        }
    };

    const setMode = (nextMode, nextTheme = theme) => {
        mode = normalizeBasemapMode(nextMode);
        applyTheme(nextTheme);
    };

    const setPmtilesAvailable = (available) => {
        hasPmtilesArchive = available === true;
        ensureLayers();
        applyTheme(theme);
        return hasPmtilesArchive;
    };

    const ensureLayers = () => {
        if (hasPmtilesArchive) mapEngine.ensurePmtilesProtocol?.();
        const items = getBasemapItems();

        if (hasPmtilesArchive && !mapEngine.getSource(OSM_VECTOR_SOURCE_ID)) {
            mapEngine.addSource(OSM_VECTOR_SOURCE_ID, createOsmBasemapSource(pmtilesUrl));
        }

        const beforeLayerId = getOverlayAnchorLayerId();

        if (!mapEngine.getLayer(backgroundLayerId)) {
            mapEngine.addLayer({
                id: backgroundLayerId,
                type: 'background',
                paint: {
                    'background-color': getBackgroundColor(),
                    'background-opacity': 1
                }
            }, beforeLayerId);
        } else {
            try {
                mapEngine.setPaintProperty(backgroundLayerId, 'background-color', getBackgroundColor());
                mapEngine.setPaintProperty(backgroundLayerId, 'background-opacity', 1);
            } catch {
                // keep existing background paint if MapLibre rejects the update
            }
        }

        for (const item of items) {
            const layer = item.layer;
            if (!hasPmtilesArchive) continue;
            if (!mapEngine.getLayer(layer.id)) {
                mapEngine.addLayer({
                    ...layer,
                    layout: {
                        ...(layer.layout || {}),
                        visibility: getLayerVisibility(mode, item.modes)
                    }
                }, beforeLayerId);
            }
        }

        normalizeBasemapLayerOrder();
    };

    return {
        applyTheme,
        ensureLayers,
        getAttributionItems: () => OSM_BASEMAP_ATTRIBUTION_ITEMS.map((item) => ({ ...item })),
        setMode,
        getStyle: (options = {}) => createOsmBasemapStyle({
            mode,
            theme,
            pmtilesAvailable: hasPmtilesArchive,
            pmtilesUrl,
            ...options
        }),
        getMode: () => mode,
        getPmtilesAvailable: () => hasPmtilesArchive,
        getTheme: () => theme
    };
};
