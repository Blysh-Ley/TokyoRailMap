import {createDemoEngine} from './demo-engine.js';

const element = id => document.getElementById(id);
const controls = ['mode', 'apply-config', 'geometry', 'style', 'amplitude', 'comparison', 'zoom-in', 'zoom-out', 'reverse', 'theme', 'reset'];
controls.forEach(id => element(id).disabled = true);
const errors = [];
const engine = createDemoEngine({container: 'map', onError(message) {errors.push(message); element('error').textContent = message;},
    onState(state) {
        controls.forEach(id => element(id).disabled = !state.ready);
        element('amplitude-value').textContent = `${state.amplitude} px`;
        element('status').textContent = `缩放 ${state.zoom.toFixed(2)} · ${state.reverse ? '反向' : '正向'}${state.hit ? ` · ${state.hit}` : ''}`;
        element('reverse').textContent = state.reverse ? '恢复正向' : '反向';
        element('theme').textContent = state.dark ? '浅色' : '深色';
    }
});
element('geometry').addEventListener('change', event => engine.setGeometry(event.target.value));
element('style').addEventListener('change', event => engine.setStyle(event.target.value));
element('amplitude').addEventListener('input', event => engine.setAmplitude(Number(event.target.value)));
element('comparison').addEventListener('change', event => engine.setComparison(event.target.checked));
element('zoom-in').addEventListener('click', () => engine.zoomIn());
element('zoom-out').addEventListener('click', () => engine.zoomOut());
element('reverse').addEventListener('click', () => engine.reverse());
element('reset').addEventListener('click', () => engine.reset());
element('theme').addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    engine.setDark(dark);
});
if (innerWidth <= 600) engine.reset();
globalThis.offsetDemo = {engine, errors};

const segmentExample = {offset: 0, transitionMeters: 400, segments: [
    {points: [[139.71, 35.675], [139.73, 35.675]], offset: 1},
    {points: [[139.77, 35.675], [139.79, 35.675]], offset: -1}
]};
element('config').value = JSON.stringify(segmentExample, null, 2);
const applyConfig = () => {
    try { engine.setConfig(JSON.parse(element('config').value)); element('error').textContent = ''; }
    catch (error) { element('error').textContent = error.message; }
};
element('mode').addEventListener('change', event => {
    const enabled = event.target.value === 'segment';
    element('config-editor').hidden = !enabled;
    if (enabled) applyConfig(); else engine.setConfig(null);
});
element('apply-config').addEventListener('click', applyConfig);
