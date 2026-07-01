import { DEFAULT_BASEMAP_MODE, normalizeBasemapMode } from '../domain/basemapMode.js';
import {
    OSM_BASEMAP_ATTRIBUTION_ITEMS,
    DEFAULT_OSM_BASEMAP_PMTILES_URL,
    OSM_BASEMAP_ATTRIBUTION_HTML,
    toPmtilesTileTemplate
} from '../domain/osmBasemapPackage.js';
import {
    OPENFREEMAP_ATTRIBUTION_ITEMS
} from '../domain/openFreeMapBasemap.js';
import {
    BASEMAP_SOURCE_OPENFREEMAP,
    BASEMAP_SOURCE_PMTILES
} from '../domain/basemapSource.js';
import {
    readAndroidPmtilesRange,
    shouldUseAndroidNativePmtiles
} from './androidPmtilesArchiveSource.js';

const pmtilesProtocolTargets = new WeakSet();
let pmtilesRangeRequestCounter = 0;

const appendPmtilesRangeCacheKey = (url, offset, length) => {
    const value = String(url || '').trim();
    if (!value) return value;
    const hashIndex = value.indexOf('#');
    const base = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
    const separator = base.includes('?') ? '&' : '?';
    pmtilesRangeRequestCounter = (pmtilesRangeRequestCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `${base}${separator}pmtiles-range=${offset}-${length}-${pmtilesRangeRequestCounter}${hash}`;
};

const createRangeSafePmtilesSource = (url) => ({
    getKey: () => url,
    getBytes: async (offset, length, signal, etag) => {
        if (shouldUseAndroidNativePmtiles({ url })) {
            const range = await readAndroidPmtilesRange({ offset, length });
            if (!range?.data) throw new Error('Android PMTiles range reader returned no data');
            return {
                data: range.data,
                etag: undefined,
                cacheControl: undefined,
                expires: undefined
            };
        }

        const headers = new Headers();
        headers.set('Range', `bytes=${offset}-${offset + length - 1}`);
        const response = await fetch(appendPmtilesRangeCacheKey(url, offset, length), {
            cache: 'no-store',
            headers,
            signal
        });
        const responseEtag = response.headers?.get?.('Etag');
        const nextEtag = responseEtag && !responseEtag.startsWith('W/') ? responseEtag : undefined;
        if (response.status === 416 || (etag && nextEtag && nextEtag !== etag)) {
            throw new Error('PMTiles archive changed while reading ranges');
        }
        if (response.status >= 300) {
            throw new Error(`Bad response code: ${response.status}`);
        }
        const contentLength = Number(response.headers?.get?.('Content-Length') || 0);
        if (response.status === 200 && (!contentLength || contentLength > length)) {
            throw new Error('PMTiles server does not support byte range requests');
        }
        return {
            data: await response.arrayBuffer(),
            etag: nextEtag,
            cacheControl: response.headers?.get?.('Cache-Control') || undefined,
            expires: response.headers?.get?.('Expires') || undefined
        };
    }
});

const createRangeSafePmtilesProtocol = (pmtilesGlobal) => {
    const PMTilesCtor = pmtilesGlobal?.PMTiles;
    if (typeof PMTilesCtor !== 'function') return null;

    const archives = new Map();
    const getArchive = (url) => {
        if (!archives.has(url)) {
            archives.set(url, new PMTilesCtor(createRangeSafePmtilesSource(url)));
        }
        return archives.get(url);
    };

    const tile = (params, callback) => {
        const abortController = new AbortController();
        Promise.resolve().then(async () => {
            const match = String(params?.url || '').match(/^pmtiles:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?$/);
            if (!match) throw new Error('Invalid PMTiles protocol URL');
            const [, archiveUrl, z, x, y] = match;
            const tileResult = await getArchive(archiveUrl).getZxy(+z, +x, +y, abortController.signal);
            if (!tileResult) {
                callback(null, new ArrayBuffer(0));
                return;
            }
            const data = tileResult.data instanceof ArrayBuffer
                ? tileResult.data
                : tileResult.data.buffer.slice(
                    tileResult.data.byteOffset,
                    tileResult.data.byteOffset + tileResult.data.byteLength
                );
            callback(
                null,
                data,
                tileResult.cacheControl || '',
                tileResult.expires || ''
            );
        }).catch((error) => callback(error));

        return {
            cancel: () => abortController.abort()
        };
    };

    return { tile };
};

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
        if (typeof maplibregl.addProtocol !== 'function' || (typeof Protocol !== 'function' && typeof globalThis.pmtiles?.PMTiles !== 'function')) {
            return false;
        }
        const protocol = createRangeSafePmtilesProtocol(globalThis.pmtiles) || new Protocol();
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
        isLoaded: () => Boolean(map.loaded?.()),
        isStyleLoaded: () => Boolean(map.isStyleLoaded?.()),
        areTilesLoaded: () => Boolean(map.areTilesLoaded?.()),
        addControl: (...args) => map.addControl(...args),
        easeTo: (...args) => map.easeTo?.(...args),
        fitBounds: (...args) => map.fitBounds(...args),
        flyTo: (...args) => map.flyTo(...args),
        jumpTo: (...args) => map.jumpTo?.(...args),
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
        removeLayer: (...args) => map.removeLayer(...args),
        removeSource: (...args) => map.removeSource(...args),
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
export const BASEMAP_GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

const getBasemapBackgroundColor = (theme) => (
    getBasemapPalette(theme).background
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

const BASEMAP_PALETTES = {
    light: {
        background: '#f8f7f1',
        water: '#c9dce2',
        waterDetailed: '#abcbd7',
        forest: '#ccdbc3',
        grass: '#d9e2cf',
        farmland: '#e1dfce',
        wetland: '#d2dcda',
        rock: '#d5d1c9',
        sand: '#e4ddcc',
        landcover: '#e5e3db',
        landuse: '#ece9e1',
        park: '#d5dfd2',
        urban: '#ece8df',
        industry: '#e7e0d8',
        building: '#ded8cf',
        road: '#e7e5db',
        roadDetailed: '#b0bac4',
        roadMinor: '#d3cec5',
        text: '#343b44',
        textHalo: '#fffdf8',
        poiText: '#69727b'
    },
    dark: {
        background: '#101418',
        water: '#243746',
        waterDetailed: '#2b4554',
        forest: '#2c352f',
        grass: '#303830',
        farmland: '#38382e',
        wetland: '#2b3c3d',
        rock: '#3a3732',
        sand: '#403b31',
        landcover: '#2b2f2d',
        landuse: '#20252a',
        park: '#2c3b32',
        urban: '#23272d',
        industry: '#2d2930',
        building: '#30343a',
        road: '#252a30',
        roadDetailed: '#606a76',
        roadMinor: '#3f4650',
        text: '#e1e6ea',
        textHalo: '#0d1115',
        poiText: '#b7c0c8'
    }
};

const getBasemapPalette = (theme) => (
    theme === 'dark' ? BASEMAP_PALETTES.dark : BASEMAP_PALETTES.light
);

const createLandcoverColorExpression = (palette) => ([
    'match',
    ['get', 'class'],
    'wood',
    palette.forest,
    'grass',
    palette.grass,
    'farmland',
    palette.farmland,
    'wetland',
    palette.wetland,
    'rock',
    palette.rock,
    'sand',
    palette.sand,
    palette.landcover
]);

const createLanduseColorExpression = (palette) => ([
    'match',
    ['get', 'class'],
    ['park', 'grass', 'recreation_ground', 'zoo'],
    palette.park,
    ['commercial', 'retail', 'residential', 'school', 'university', 'hospital'],
    palette.urban,
    ['industrial', 'railway', 'military', 'quarry'],
    palette.industry,
    palette.landuse
]);

const createMunicipalityPlaceFilter = () => ([
    'match',
    ['get', 'class'],
    ['city', 'town', 'village'],
    true,
    false
]);

const createOsmBasemapSource = (pmtilesUrl) => ({
    type: 'vector',
    tiles: [toPmtilesTileTemplate(pmtilesUrl)],
    minzoom: 0,
    maxzoom: 14,
    attribution: OSM_BASEMAP_ATTRIBUTION_HTML
});

const createOsmBasemapLayerItems = ({ mode = DEFAULT_BASEMAP_MODE, theme = 'light' } = {}) => {
    const dark = theme === 'dark';
    const palette = getBasemapPalette(theme);
    const textColor = palette.text;
    const textHalo = palette.textHalo;
    const roadColor = palette.road;
    const detailedRoadColor = palette.roadDetailed;

    return [
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-water-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'water',
                paint: {
                    'fill-color': mode === 'osm-detailed' ? palette.waterDetailed : palette.water,
                    'fill-opacity': mode === 'osm-detailed' ? 0.82 : 0.72
                }
            }
        },
        {
            modes: ['osm-white', 'osm-detailed'],
            layer: {
                id: 'osm-landcover-layer',
                type: 'fill',
                source: OSM_VECTOR_SOURCE_ID,
                'source-layer': 'landcover',
                paint: {
                    'fill-color': createLandcoverColorExpression(palette),
                    'fill-opacity': mode === 'osm-detailed' ? 0.72 : 0.48
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
                    'fill-color': createLanduseColorExpression(palette),
                    'fill-opacity': 0.54
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
                    'fill-color': palette.building,
                    'fill-opacity': dark ? 0.62 : 0.58
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
                        mode === 'osm-detailed' ? 0.35 :0.16,
                        14,
                        mode === 'osm-detailed' ? 1.4 : 0.45
                    ],
                    'line-opacity': mode === 'osm-detailed' ? 0.82 : 0.5
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
                    'line-color': palette.roadMinor,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        12,
                        0.25,
                        16,
                        1.1
                    ],
                    'line-opacity': 0.7
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
                    'text-color': palette.poiText,
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
                filter: createMunicipalityPlaceFilter(),
                layout: {
                    'text-field': createTextField(),
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        6,
                        mode === 'osm-detailed' ? 11.5 : 10.5,
                        12,
                        mode === 'osm-detailed' ? 15.5 : 13.5
                    ],
                    'symbol-sort-key': ['coalesce', ['get', 'rank'], 20],
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

const createBackgroundBasemapStyle = (theme = 'light', backgroundColor) => ({
    version: 8,
    glyphs: BASEMAP_GLYPHS_URL,
    sources: {},
    layers: [
        {
            id: 'tokyo-basemap-background-layer',
            type: 'background',
            paint: {
                'background-color': backgroundColor || getBasemapBackgroundColor(theme),
                'background-opacity': 1
            }
        }
    ],
    metadata: {
        tokyoRailBasemap: {
            sourceKind: 'none',
            primarySourceId: null
        }
    }
});

const createOnlineBasemapExportStyle = (descriptor, theme = 'light') => {
    if (!descriptor?.style) return createBackgroundBasemapStyle(theme);
    return {
        ...descriptor.style,
        layers: [
            createBackgroundBasemapStyle(theme, descriptor.backgroundColor).layers[0],
            ...(descriptor.style.layers || [])
        ],
        metadata: {
            ...(descriptor.style.metadata || {}),
            tokyoRailBasemap: {
                ...(descriptor.style.metadata?.tokyoRailBasemap || {}),
                sourceKind: 'openfreemap',
                primarySourceId: descriptor.primarySourceId || null
            }
        }
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
    let activeBasemapSourceKind = hasPmtilesArchive ? BASEMAP_SOURCE_PMTILES : 'none';
    let onlineBasemapStyle = null;
    const backgroundLayerId = 'tokyo-basemap-background-layer';
    const basemapLayerIds = Object.freeze(getOsmBasemapLayerIds());

    const shouldUseOnlineBasemap = () => (
        activeBasemapSourceKind === BASEMAP_SOURCE_OPENFREEMAP
        && mode !== 'transparent'
        && onlineBasemapStyle?.style
    );
    const shouldUsePmtilesBasemap = () => (
        activeBasemapSourceKind === BASEMAP_SOURCE_PMTILES
        && hasPmtilesArchive
        && mode !== 'transparent'
    );
    const getBackgroundColor = () => (
        shouldUseOnlineBasemap()
            ? onlineBasemapStyle.backgroundColor
            : getBasemapBackgroundColor(theme)
    );
    const getOverlayAnchorLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );
    const getActiveBasemapLayerIds = () => [
        ...basemapLayerIds,
        ...(onlineBasemapStyle?.layerIds || [])
    ];
    const getFirstBasemapLayerId = () => getActiveBasemapLayerIds().find((layerId) => mapEngine.getLayer(layerId)) || null;

    const removeLayers = (layerIds = []) => {
        for (const layerId of [...layerIds].reverse()) {
            try {
                if (layerId && mapEngine.getLayer(layerId)) mapEngine.removeLayer?.(layerId);
            } catch {
                // ignore cleanup races during style changes
            }
        }
    };

    const removeSources = (sourceIds = []) => {
        for (const sourceId of sourceIds) {
            try {
                if (sourceId && mapEngine.getSource(sourceId)) mapEngine.removeSource?.(sourceId);
            } catch {
                // ignore cleanup races during style changes
            }
        }
    };

    const cleanupPmtilesBasemap = () => {
        removeLayers(basemapLayerIds);
        removeSources([OSM_VECTOR_SOURCE_ID]);
    };

    const cleanupOnlineBasemap = () => {
        removeLayers(onlineBasemapStyle?.layerIds || []);
        removeSources(onlineBasemapStyle?.sourceIds || []);
    };

    const normalizeBasemapLayerOrder = () => {
        const overlayAnchorLayerId = getOverlayAnchorLayerId();
        try {
            for (const layerId of getActiveBasemapLayerIds()) {
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
    const getPmtilesLayerVisibility = (item) => (
        shouldUsePmtilesBasemap() ? getLayerVisibility(mode, item.modes) : 'none'
    );

    const applyTheme = (nextTheme) => {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        const items = getBasemapItems();

        try {
            for (const item of items) {
                const layerId = item.layer.id;
                if (!mapEngine.getLayer(layerId)) continue;
                mapEngine.setLayoutProperty(layerId, 'visibility', getPmtilesLayerVisibility(item));
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
        try {
            ensureLayers();
        } catch {
            // Layer sync retries when the map style is ready.
        }
        applyTheme(nextTheme);
    };

    const setPmtilesAvailable = (available) => {
        hasPmtilesArchive = available === true;
        if (!hasPmtilesArchive && activeBasemapSourceKind === BASEMAP_SOURCE_PMTILES) {
            activeBasemapSourceKind = 'none';
        }
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Keep the archive availability state; layer sync retries when the map style is ready.
        }
        return hasPmtilesArchive;
    };

    const setActiveBasemapSource = (sourceKind) => {
        if (sourceKind === BASEMAP_SOURCE_OPENFREEMAP) {
            activeBasemapSourceKind = BASEMAP_SOURCE_OPENFREEMAP;
        } else if (sourceKind === BASEMAP_SOURCE_PMTILES && hasPmtilesArchive) {
            activeBasemapSourceKind = BASEMAP_SOURCE_PMTILES;
        } else {
            activeBasemapSourceKind = 'none';
        }
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Layer sync retries when the map style is ready.
        }
        return activeBasemapSourceKind;
    };

    const setOnlineBasemapStyle = (descriptor) => {
        cleanupOnlineBasemap();
        onlineBasemapStyle = descriptor?.style ? descriptor : null;
        try {
            ensureLayers();
            applyTheme(theme);
        } catch {
            // Layer sync retries when the map style is ready.
        }
        return onlineBasemapStyle;
    };

    const ensureLayers = () => {
        const items = getBasemapItems();
        const pmtilesProtocolReady = hasPmtilesArchive
            ? mapEngine.ensurePmtilesProtocol?.() === true
            : false;

        if (!hasPmtilesArchive) {
            cleanupPmtilesBasemap();
        }
        if (!shouldUseOnlineBasemap()) {
            cleanupOnlineBasemap();
        }

        if (pmtilesProtocolReady && !mapEngine.getSource(OSM_VECTOR_SOURCE_ID)) {
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
            if (!hasPmtilesArchive || !mapEngine.getSource(OSM_VECTOR_SOURCE_ID)) continue;
            if (!mapEngine.getLayer(layer.id)) {
                mapEngine.addLayer({
                    ...layer,
                    layout: {
                        ...(layer.layout || {}),
                        visibility: getPmtilesLayerVisibility(item)
                    }
                }, beforeLayerId);
            }
        }

        if (shouldUseOnlineBasemap()) {
            const descriptor = onlineBasemapStyle;
            Object.entries(descriptor.style.sources || {}).forEach(([sourceId, source]) => {
                if (!mapEngine.getSource(sourceId)) mapEngine.addSource(sourceId, source);
            });
            for (const layer of descriptor.style.layers || []) {
                if (!mapEngine.getLayer(layer.id)) {
                    mapEngine.addLayer(layer, beforeLayerId);
                }
            }
        } else {
            cleanupOnlineBasemap();
        }

        normalizeBasemapLayerOrder();
    };

    const getStyle = (options = {}) => {
        const nextMode = normalizeBasemapMode(options.mode || mode);
        const nextTheme = options.theme === 'dark' ? 'dark' : (options.theme === 'light' ? 'light' : theme);
        const forcePmtilesSource = options.sourceKind === BASEMAP_SOURCE_PMTILES;
        if (forcePmtilesSource) {
            if (hasPmtilesArchive) {
                const style = createOsmBasemapStyle({
                    mode: nextMode,
                    theme: nextTheme,
                    pmtilesAvailable: true,
                    pmtilesUrl,
                    ...options
                });
                return {
                    ...style,
                    metadata: {
                        ...(style.metadata || {}),
                        tokyoRailBasemap: {
                            sourceKind: nextMode === 'transparent' ? 'none' : 'pmtiles',
                            primarySourceId: nextMode === 'transparent' ? null : OSM_VECTOR_SOURCE_ID
                        }
                    }
                };
            }
            return createBackgroundBasemapStyle(nextTheme);
        }
        if (
            activeBasemapSourceKind === BASEMAP_SOURCE_OPENFREEMAP
            && nextMode !== 'transparent'
            && onlineBasemapStyle?.style
        ) {
            return createOnlineBasemapExportStyle(onlineBasemapStyle, nextTheme);
        }
        if (hasPmtilesArchive) {
            const style = createOsmBasemapStyle({
                mode: nextMode,
                theme: nextTheme,
                pmtilesAvailable: true,
                pmtilesUrl,
                ...options
            });
            return {
                ...style,
                metadata: {
                    ...(style.metadata || {}),
                    tokyoRailBasemap: {
                        sourceKind: nextMode === 'transparent' ? 'none' : 'pmtiles',
                        primarySourceId: nextMode === 'transparent' ? null : OSM_VECTOR_SOURCE_ID
                    }
                }
            };
        }
        return createBackgroundBasemapStyle(nextTheme);
    };

    return {
        applyTheme,
        ensureLayers,
        getAttributionItems: () => (
            shouldUseOnlineBasemap()
                ? OPENFREEMAP_ATTRIBUTION_ITEMS
                : OSM_BASEMAP_ATTRIBUTION_ITEMS
        ).map((item) => ({ ...item })),
        setPmtilesAvailable,
        setActiveBasemapSource,
        setOnlineBasemapStyle,
        setMode,
        getStyle,
        getExportStyle: getStyle,
        getMode: () => mode,
        getPmtilesAvailable: () => hasPmtilesArchive,
        getActiveBasemapSource: () => activeBasemapSourceKind,
        getOnlineBasemapStyle: () => onlineBasemapStyle,
        getTheme: () => theme
    };
};
