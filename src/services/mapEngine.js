export const createMapEngine = ({ maplibregl, container, center, zoom, style } = {}) => {
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
        style
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

    const lineHighlightLabelMarkers = new Map();
    const lineNameLabelMarkers = new Map();

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

    const normalizeLineNameLabelFeature = (feature = {}) => {
        const props = feature?.properties || {};
        const lineId = toLabelText(props.id || feature.id);
        const coordinates = feature?.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates)
            ? feature.geometry.coordinates
            : null;
        const lng = Number(coordinates?.[0]);
        const lat = Number(coordinates?.[1]);
        const lineName = toLabelText(props.name) || lineId;
        if (!lineId || !lineName || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        return {
            lineId,
            coordinate: [lng, lat],
            lineName,
            color: toLabelText(props.color) || '#2f6fdf'
        };
    };

    const createLineNameLabelElement = (item = {}) => {
        if (typeof document === 'undefined') return null;
        const el = document.createElement('div');
        el.className = 'map-line-name-label';
        el.textContent = toLabelText(item.lineName);
        el.style.setProperty('--line-name-label-color', toLabelText(item.color) || '#2f6fdf');
        return el;
    };

    const clearLineNameLabels = () => {
        for (const entry of lineNameLabelMarkers.values()) {
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
        }
        lineNameLabelMarkers.clear();
    };

    const renderLineNameLabels = (geojson = {}) => {
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
        if (!features.length) {
            clearLineNameLabels();
            return 0;
        }

        const items = features.map(normalizeLineNameLabelFeature).filter(Boolean);
        const nextIds = new Set(items.map((item) => item.lineId));

        for (const [lineId, entry] of lineNameLabelMarkers.entries()) {
            if (nextIds.has(lineId)) continue;
            try {
                entry?.marker?.remove?.();
            } catch {
                // ignore stale marker cleanup errors
            }
            lineNameLabelMarkers.delete(lineId);
        }

        for (const item of items) {
            const signature = [
                item.lineId,
                item.lineName,
                item.color
            ].join('|');
            const existing = lineNameLabelMarkers.get(item.lineId);
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

            const element = createLineNameLabelElement(item);
            if (!element) continue;
            const marker = new maplibregl.Marker({
                element,
                anchor: 'center'
            }).setLngLat(item.coordinate);
            marker.addTo(map);
            lineNameLabelMarkers.set(item.lineId, { marker, signature });
        }

        return lineNameLabelMarkers.size;
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
        getLayer: (...args) => map.getLayer(...args),
        getSource: (...args) => map.getSource(...args),
        getCanvas: (...args) => map.getCanvas(...args),
        hasLayer: (layerId) => Boolean(layerId && map.getLayer(layerId)),
        queryRenderedFeatures: (...args) => map.queryRenderedFeatures(...args),
        applyPaintProperties,
        ensureGeoJsonSource,
        ensureLayer,
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
        clearLineNameLabels,
        renderLineHighlightLabels,
        renderLineNameLabels,
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

export const createBasemapController = ({
    mapEngine,
    initialTheme = 'light',
    initialMode = 'carto',
    lightRasterPaint = {},
    darkRasterPaint = {},
    onThemeChanged
} = {}) => {
    if (!mapEngine) {
        throw new Error('basemapController requires mapEngine');
    }

    let theme = initialTheme === 'dark' ? 'dark' : 'light';
    let mode = ['carto', 'ost', 'transparent'].includes(initialMode) ? initialMode : 'carto';
    const backgroundLayerId = 'tokyo-basemap-background-layer';
    const rasterLayerIds = Object.freeze(['carto-light-layer', 'carto-dark-layer', 'ost-layer']);

    const getOstPaint = () => (theme === 'dark' ? darkRasterPaint : lightRasterPaint);
    const getBackgroundColor = () => (theme === 'dark' ? '#101216' : '#ffffff');
    const getOverlayAnchorLayerId = () => (
        mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined)
    );
    const getFirstRasterLayerId = () => rasterLayerIds.find((layerId) => mapEngine.getLayer(layerId)) || null;

    const normalizeBasemapLayerOrder = () => {
        const overlayAnchorLayerId = getOverlayAnchorLayerId();
        try {
            for (const layerId of rasterLayerIds) {
                if (overlayAnchorLayerId && mapEngine.getLayer(layerId)) {
                    mapEngine.moveLayer(layerId, overlayAnchorLayerId);
                }
            }

            const firstRasterLayerId = getFirstRasterLayerId();
            if (mapEngine.getLayer(backgroundLayerId)) {
                if (firstRasterLayerId) mapEngine.moveLayer(backgroundLayerId, firstRasterLayerId);
                else if (overlayAnchorLayerId) mapEngine.moveLayer(backgroundLayerId, overlayAnchorLayerId);
            }
        } catch {
            // keep current order if MapLibre rejects a move during style changes
        }
    };

    const getBasemapItems = () => [
        {
            id: 'carto-light-layer',
            sourceId: 'carto-light-source',
            source: {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">Carto</a>'
            },
            layout: { visibility: (mode === 'carto' && theme === 'light') ? 'visible' : 'none' }
        },
        {
            id: 'carto-dark-layer',
            sourceId: 'carto-dark-source',
            source: {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">Carto</a>'
            },
            layout: { visibility: (mode === 'carto' && theme === 'dark') ? 'visible' : 'none' }
        },
        {
            id: 'ost-layer',
            sourceId: 'ost-source',
            source: {
                type: 'raster',
                tiles: [
                    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>'
            },
            layout: { visibility: mode === 'ost' ? 'visible' : 'none' },
            paint: getOstPaint()
        }
    ];

    const applyTheme = (nextTheme) => {
        theme = nextTheme === 'dark' ? 'dark' : 'light';
        const lightVisibility = (mode === 'carto' && theme === 'light') ? 'visible' : 'none';
        const darkVisibility = (mode === 'carto' && theme === 'dark') ? 'visible' : 'none';
        const ostVisibility = mode === 'ost' ? 'visible' : 'none';

        try {
            if (mapEngine.getLayer('carto-light-layer')) mapEngine.setLayoutProperty('carto-light-layer', 'visibility', lightVisibility);
            if (mapEngine.getLayer('carto-dark-layer')) mapEngine.setLayoutProperty('carto-dark-layer', 'visibility', darkVisibility);
            if (mapEngine.getLayer('ost-layer')) {
                mapEngine.setLayoutProperty('ost-layer', 'visibility', ostVisibility);
                Object.entries(getOstPaint()).forEach(([key, value]) => {
                    mapEngine.setPaintProperty('ost-layer', key, value);
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
        mode = ['carto', 'ost', 'transparent'].includes(nextMode) ? nextMode : 'carto';
        applyTheme(nextTheme);
    };

    const ensureLayers = () => {
        const items = getBasemapItems();

        for (const item of items) {
            if (!mapEngine.getSource(item.sourceId)) {
                mapEngine.addSource(item.sourceId, item.source);
            }
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
            if (!mapEngine.getLayer(item.id)) {
                mapEngine.addLayer({
                    id: item.id,
                    type: 'raster',
                    source: item.sourceId,
                    layout: item.layout,
                    minzoom: 0,
                    paint: item.paint || {}
                }, beforeLayerId);
            }
        }

        normalizeBasemapLayerOrder();
    };

    return {
        applyTheme,
        ensureLayers,
        setMode,
        getMode: () => mode,
        getTheme: () => theme
    };
};
