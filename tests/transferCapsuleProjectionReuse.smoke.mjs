import assert from 'node:assert/strict';
import { createTransferCapsuleFrameRenderer } from '../src/services/transferCapsuleFrameRenderer.js';

let baseReads = 0;
const station = { units: 0, get base() { baseReads += 1; return { x: 1000000, y: 800000 }; } };
const point = { id: '测试站', virtual: false, geometry: station,
    feature: { type: 'Feature', properties: { id: '测试站' } } };
const makeGeometry = () => [{ properties: { groupId: '测试组' }, points: [point], edges: [] }];
let geometry = makeGeometry();
const frame = { zoom: 12, mode: 'dynamic', frozenZoom: 12, centerMercatorX: 0.5,
    width: 100, height: 100, cameraDistance: 1, styles: [{
        id: '测试胶囊', type: 'circle', role: 'fallback', visible: true, filter: null,
        evaluate: () => ({ radius: 2, opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 } })
    }] };
const failures = [];
const renderer = createTransferCapsuleFrameRenderer({ getFrame: () => frame, getGeometry: () => geometry,
    onFailure: error => failures.push(error) });
const noop = () => {};
const gl = {
    createShader: () => ({}), shaderSource: noop, compileShader: noop, getShaderParameter: () => true,
    createProgram: () => ({}), attachShader: noop, linkProgram: noop, getProgramParameter: () => true,
    createBuffer: () => ({}), getAttribLocation: () => 0, getUniformLocation: () => ({}), deleteShader: noop,
    bindVertexArray: noop, useProgram: noop, bindBuffer: noop, bufferData: noop, enableVertexAttribArray: noop,
    vertexAttribPointer: noop, uniform2f: noop, disable: noop, enable: noop, blendFunc: noop, drawArrays: noop,
    deleteBuffer: noop, deleteProgram: noop
};
const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
renderer.layer.onAdd({}, gl);
renderer.layer.render(gl, matrix);
assert.equal(failures.length, 0);
assert(renderer.getRecords().length > 0);
const initialReads = baseReads;
const initialX = renderer.getRecords()[0].endpoints[0].screenPoint.x;
matrix[12] = 0.1;
renderer.layer.render(gl, matrix);
assert.equal(baseReads, initialReads, '平移继续更新屏幕坐标，但不重新计算站点投影');
assert(Math.abs(renderer.getRecords()[0].endpoints[0].screenPoint.x - initialX - 5) < 1e-4);
frame.zoom = 13;
renderer.layer.render(gl, matrix);
assert(baseReads > initialReads, '缩放变化后重新投影');
let previousReads = baseReads;
geometry = makeGeometry();
renderer.layer.render(gl, matrix);
assert(baseReads > previousReads, '胶囊数据替换后重新投影');
frame.mode = 'performance';
frame.frozenZoom = 10;
renderer.layer.render(gl, matrix);
previousReads = baseReads;
frame.zoom = 14;
renderer.layer.render(gl, matrix);
assert.equal(baseReads, previousReads, '性能模式按冻结的几何缩放级别复用');
frame.mode = 'dynamic';
renderer.layer.render(gl, matrix);
assert(baseReads > previousReads, '恢复动态模式后按实际缩放重新投影');
renderer.layer.onRemove({}, gl);
assert.equal(renderer.getRecords().length, 0);
assert.equal(failures.length, 0);
console.log('胶囊投影复用、平移、缩放、数据替换与模式切换验证通过。');
