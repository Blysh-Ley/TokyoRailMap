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

    return {
        getMap: () => map,
        on: (...args) => map.on(...args),
        once: (...args) => map.once(...args),
        addControl: (...args) => map.addControl(...args),
        fitBounds: (...args) => map.fitBounds(...args),
        flyTo: (...args) => map.flyTo(...args),
        setPaintProperty: (...args) => map.setPaintProperty(...args),
        setLayoutProperty: (...args) => map.setLayoutProperty(...args),
        setFilter: (...args) => map.setFilter(...args),
        addSource: (...args) => map.addSource(...args),
        addLayer: (...args) => map.addLayer(...args),
        getLayer: (...args) => map.getLayer(...args),
        getSource: (...args) => map.getSource(...args),
        queryRenderedFeatures: (...args) => map.queryRenderedFeatures(...args)
    };
};
