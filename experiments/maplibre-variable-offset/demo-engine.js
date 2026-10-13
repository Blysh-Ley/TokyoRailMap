import { normalizeLineOffsetConfig, buildLineOffsetProfile } from '../../src/domain/lineOffsetProfile.js';

const CENTER = [139.75, 35.675];
const PROFILES = {
    open: [[0, 1], [.25, 1], [.75, -1], [1, -1]],
    loop: [[0, 1], [.2, 1], [.4, -1], [.6, -1], [.8, 1], [1, 1]]
};

export const createDemoEngine = ({container, onState, onError}) => {
    const api = globalThis.maplibregl;
    const state = {geometry: 'straight', style: 'solid', amplitude: 12, comparison: true, reverse: false, dark: false, ready: false, hit: '', sourceUpdates: 0, config: null};
    const map = new api.Map({container, center: CENTER, zoom: 12, attributionControl: false, preserveDrawingBuffer: true,
        style: {version: 8, sources: {}, layers: [{id: 'background', type: 'background', paint: {'background-color': '#f2f5f8'}}]}});
    const publish = () => onState({...state, zoom: map.getZoom(), version: api.version, capability: api.variableLineOffset});
    const coordinates = () => {
        let line;
        if (state.geometry === 'loop') {
            line = Array.from({length: 97}, (_, i) => {
                const t = i / 96 * Math.PI * 2;
                return [CENTER[0] + Math.cos(t) * .028, CENTER[1] + Math.sin(t) * .022];
            });
        } else if (state.geometry === 'curve') {
            line = Array.from({length: 65}, (_, i) => {
                const t = i / 64;
                return [139.70 + .1 * t, CENTER[1] + Math.sin(t * Math.PI * 2) * .006];
            });
        } else line = state.config === null ? [[139.70, CENTER[1]], [139.80, CENTER[1]]]
            : Array.from({length: 101}, (_, i) => [139.70 + .001 * i, CENTER[1]]);
        return state.reverse ? line.reverse() : line;
    };
    const collection = () => {
        const coords = coordinates();
        const profile = state.config === null ? (state.geometry === 'loop' ? PROFILES.loop : PROFILES.open)
            : buildLineOffsetProfile(coords, state.config);
        return {type: 'FeatureCollection', features: [{type: 'Feature', id: 1,
            properties: {line_offset_profile: JSON.stringify(profile)}, geometry: {type: 'LineString', coordinates: coords}}]};
    };
    const changeGeometry = () => {
        const data = collection();
        map.getSource('variable').setData(data);
        map.getSource('ordinary').setData({...data, features: data.features.map(feature => ({...feature, properties: {}}))});
        state.sourceUpdates++;
    };
    const addVariableLayer = () => {
        if (map.getLayer('variable-line')) map.removeLayer('variable-line');
        const paint = {'line-color': '#1772cd', 'line-width': 5, 'line-offset': state.amplitude};
        if (state.style === 'gradient') paint['line-gradient'] = ['interpolate', ['linear'], ['line-progress'], 0, '#d33248', 1, '#22a767'];
        if (state.style === 'dash') paint['line-dasharray'] = [2, 1];
        if (state.style === 'pattern') paint['line-pattern'] = 'stripe';
        map.addLayer({id: 'variable-line', type: 'line', source: 'variable', layout: {'line-cap': 'round', 'line-join': 'round'}, paint});
    };
    map.on('error', event => onError(event.error.message));
    map.on('load', () => {
        const data = collection();
        map.addSource('variable', {type: 'geojson', data, lineMetrics: true, tolerance: 0, maxzoom: 18});
        map.addSource('ordinary', {type: 'geojson', data: {...data, features: data.features.map(feature => ({...feature, properties: {}}))}, tolerance: 0, maxzoom: 18});
        map.addImage('stripe', {width: 8, height: 8, data: new Uint8Array(Array.from({length: 64}, (_, i) => i % 8 < 4 ? [23, 114, 205, 255] : [125, 185, 245, 255]).flat())});
        map.addLayer({id: 'reference-line', type: 'line', source: 'ordinary', paint: {'line-color': '#8b99ab', 'line-width': 1}});
        map.addLayer({id: 'ordinary-line', type: 'line', source: 'ordinary', layout: {'line-cap': 'round', 'line-join': 'round'}, paint: {'line-color': '#d15783', 'line-width': 3, 'line-offset': state.amplitude, 'line-opacity': .7}});
        addVariableLayer();
        state.ready = true;
        publish();
    });
    map.on('move', publish);
    map.on('click', event => {
        state.hit = map.queryRenderedFeatures(event.point, {layers: ['variable-line', 'ordinary-line']}).map(feature => feature.layer.id === 'variable-line' ? '分段偏移' : '固定偏移').filter((value, index, all) => all.indexOf(value) === index).join('、') || '未命中线路';
        publish();
    });
    return {
        setConfig(value) {state.config = value === null ? null : normalizeLineOffsetConfig(value); state.hit = ''; changeGeometry(); publish();},
        setGeometry(value) {state.geometry = value; state.hit = ''; changeGeometry(); publish();},
        setStyle(value) {state.style = value; state.hit = ''; addVariableLayer(); publish();},
        setAmplitude(value) {state.amplitude = value; state.hit = ''; for (const id of ['variable-line', 'ordinary-line']) map.setPaintProperty(id, 'line-offset', value); publish();},
        setComparison(value) {state.comparison = value; state.hit = ''; map.setLayoutProperty('ordinary-line', 'visibility', value ? 'visible' : 'none'); publish();},
        reverse() {state.reverse = !state.reverse; state.hit = ''; changeGeometry(); publish();},
        setDark(value) {state.dark = value; map.setPaintProperty('background', 'background-color', value ? '#152033' : '#f2f5f8'); publish();},
        zoomIn() {map.zoomIn();}, zoomOut() {map.zoomOut();}, reset() {map.jumpTo({center: CENTER, zoom: innerWidth <= 600 ? 11 : 12, bearing: 0, pitch: 0});},
        // 只供实验验证：保留地图对象以读取原生 bucket、查询和实际像素。
        map, getState: () => ({...state})
    };
};
