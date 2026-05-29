export const createMapEngine = ({ maplibregl, container, center, zoom, style } = {}) => {
    if (!maplibregl?.Map) {
        throw new Error('MapLibre GL JS is not available');
    }

    const map = new maplibregl.Map({
        container,
        center,
        zoom,
        style
    });

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
        setSourceData: (sourceId, data) => {
            const source = map.getSource(sourceId);
            source?.setData?.(data);
            return source;
        },
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

    const getOstPaint = () => (theme === 'dark' ? darkRasterPaint : lightRasterPaint);

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

            const canvas = mapEngine.getCanvas?.();
            if (canvas?.style) canvas.style.background = mode === 'transparent' ? 'transparent' : '';
            if (typeof onThemeChanged === 'function') onThemeChanged({ theme, mode });
        } catch {
            // ignore
        }
    };

    const setMode = (nextMode) => {
        mode = ['carto', 'ost', 'transparent'].includes(nextMode) ? nextMode : 'carto';
        applyTheme(theme);
    };

    const ensureLayers = () => {
        const items = getBasemapItems();

        for (const item of items) {
            if (!mapEngine.getSource(item.sourceId)) {
                mapEngine.addSource(item.sourceId, item.source);
            }
        }

        const beforeLayerId = mapEngine.getLayer('lines-layer')
            ? 'lines-layer'
            : (mapEngine.getLayer('stations-layer') ? 'stations-layer' : undefined);

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
    };

    return {
        applyTheme,
        ensureLayers,
        setMode,
        getMode: () => mode,
        getTheme: () => theme
    };
};
