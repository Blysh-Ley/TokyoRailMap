import { compileStationFrameFilter, createStationFrameProjection, stationFramePointToLngLat } from '../domain/stationFrameGeometry.js';

const VERTEX = `attribute vec2 a_center;
attribute vec2 a_corner;
attribute vec2 a_size;
attribute vec4 a_fill;
attribute vec4 a_stroke;
uniform vec2 u_viewport;
varying vec2 v_local;
varying vec2 v_size;
varying vec4 v_fill;
varying vec4 v_stroke;
void main() {
    float extent = a_size.x + a_size.y + 1.0;
    gl_Position = vec4(a_center + a_corner * extent * vec2(2.0, -2.0) / u_viewport, 0.0, 1.0);
    v_local = a_corner * extent; v_size = a_size; v_fill = a_fill; v_stroke = a_stroke;
}`;
const FRAGMENT = `precision mediump float;
varying vec2 v_local;
varying vec2 v_size;
varying vec4 v_fill;
varying vec4 v_stroke;
void main() {
    float distance = length(v_local);
    float outer = 1.0 - smoothstep(v_size.x + v_size.y - 0.5, v_size.x + v_size.y + 0.5, distance);
    float inner = 1.0 - smoothstep(v_size.x - 0.5, v_size.x + 0.5, distance);
    gl_FragColor = mix(v_stroke, v_fill, inner) * outer;
}`;
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]];
const STRIDE = 14;
const color = (value, opacity) => [value.r * opacity, value.g * opacity, value.b * opacity, value.a * opacity];
const clipPoint = (matrix, point) => {
    const w = matrix[3] * point.x + matrix[7] * point.y + matrix[15];
    return { x: (matrix[0] * point.x + matrix[4] * point.y + matrix[12]) / w,
        y: (matrix[1] * point.x + matrix[5] * point.y + matrix[13]) / w, w };
};

// GL-only drawing service. All MapLibre access is supplied by mapEngine.
export function createStationCircleFrameRenderer({ geometry, getFrame, onFailure, onReady, onDetach }) {
    let program = null;
    let buffer = null;
    let locations = null;
    let records = [];
    let filter = null;
    let accepts = () => true;
    let vertices = new Float32Array(0);
    let active = false;
    const layer = {
        id: 'station-circles-frame-layer', type: 'custom', renderingMode: '2d',
        onAdd(_map, gl) {
            const shaders = [];
            try {
                for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
                    const shader = gl.createShader(type);
                    shaders.push(shader);
                    gl.shaderSource(shader, source); gl.compileShader(shader);
                    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
                }
                program = gl.createProgram();
                shaders.forEach((shader) => gl.attachShader(program, shader));
                gl.linkProgram(program);
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
                buffer = gl.createBuffer();
                locations = Object.fromEntries(['center', 'corner', 'size', 'fill', 'stroke'].map((name) => [name, gl.getAttribLocation(program, `a_${name}`)]));
                locations.viewport = gl.getUniformLocation(program, 'u_viewport');
                active = true;
                onReady?.();
            } catch (error) { onFailure(error); }
            finally { shaders.forEach((shader) => gl.deleteShader(shader)); }
        },
        render(gl, matrix) {
            if (!active) return;
            try {
                const frame = getFrame();
                records = [];
                if (!frame.visible) return;
                if (filter !== frame.filter) { accepts = compileStationFrameFilter(frame.filter); filter = frame.filter; }
                const points = [];
                const projectStation = createStationFrameProjection(frame.zoom, { mode: frame.mode, frozenZoom: frame.frozenZoom });
                for (const item of geometry) {
                    if (!accepts(item.feature.properties || {})) continue;
                    const mercator = projectStation(item);
                    // Draw the world copy nearest the camera.
                    mercator.x += Math.round(frame.centerMercatorX - mercator.x);
                    const clip = clipPoint(matrix, mercator);
                    const x = (clip.x + 1) * frame.width / 2;
                    const y = (1 - clip.y) * frame.height / 2;
                    if (x < -32 || x > frame.width + 32 || y < -32 || y > frame.height + 32) continue;
                    const style = frame.evaluate(item.feature);
                    if (style.opacity <= 0 && style.strokeOpacity <= 0) continue;
                    const pitchScale = style.pitchScale === 'map' ? frame.cameraDistance / clip.w : 1;
                    const radius = Math.max(0, style.radius * pitchScale);
                    const stroke = Math.max(0, style.strokeWidth * pitchScale);
                    const center = [Math.fround(clip.x), Math.fround(clip.y)];
                    points.push({ center, radius, stroke, fill: color(style.fill, style.opacity), outline: color(style.stroke, style.strokeOpacity) });
                    records.push({ ...item.feature, geometry: { type: 'Point', coordinates: stationFramePointToLngLat(mercator) },
                        layer: { id: 'stations-layer', type: 'circle', source: 'stations-source' }, source: 'stations-source',
                        screenPoint: { x: (center[0] + 1) * frame.width / 2, y: (1 - center[1]) * frame.height / 2 },
                        radius: radius + stroke, renderedZoom: frame.zoom, renderer: 'current-frame-circles' });
                }
                const length = points.length * 6 * STRIDE;
                if (vertices.length < length) vertices = new Float32Array(Math.max(length, vertices.length * 2));
                let index = 0;
                for (const p of points) for (const corner of CORNERS) {
                    vertices.set([...p.center, ...corner, p.radius, p.stroke, ...p.fill, ...p.outline], index);
                    index += STRIDE;
                }
                // Custom layers share GL state. MapLibre resets it after render;
                // detach its VAO before configuring attributes on our buffer.
                if (gl.bindVertexArray) gl.bindVertexArray(null);
                else gl.getExtension('OES_vertex_array_object')?.bindVertexArrayOES(null);
                gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, length), gl.DYNAMIC_DRAW);
                let offset = 0;
                for (const [name, size] of [['center', 2], ['corner', 2], ['size', 2], ['fill', 4], ['stroke', 4]]) {
                    gl.enableVertexAttribArray(locations[name]);
                    gl.vertexAttribPointer(locations[name], size, gl.FLOAT, false, STRIDE * 4, offset * 4);
                    offset += size;
                }
                gl.uniform2f(locations.viewport, frame.width, frame.height);
                gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
                gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                gl.drawArrays(gl.TRIANGLES, 0, points.length * 6);
            } catch (error) { active = false; records = []; onFailure(error); }
        },
        onRemove(_map, gl) { active = false; records = []; if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); onDetach?.(); }
    };
    return { layer, isActive: () => active, getRecords: () => records };
}
