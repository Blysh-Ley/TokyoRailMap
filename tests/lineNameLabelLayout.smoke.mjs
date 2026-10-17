import assert from 'node:assert/strict';
import { readRenderedStationLabelBounds } from '../src/services/stationLabelBounds.js';
import { readLineNameLabelLayout } from '../src/ui/lineNameLabelLayout.js';

const nativeMap = {
    getLayoutProperty: () => 'visible',
    style: { placement: {
        retainedQueryData: {
            1: { bucketIndex: 0, featureIndex: { bucketLayerIDs: [['station-labels-layer']] } },
            2: { bucketIndex: 0, featureIndex: { bucketLayerIDs: [['osm-place-label-layer']] } }
        },
        collisionIndex: { transform: { width: 500, height: 400 }, grid: {
            width: 700, height: 600,
            boxKeys: [{ bucketInstanceId: 1, featureIndex: 0 }, { bucketInstanceId: 1, featureIndex: 0 }, { bucketInstanceId: 2, featureIndex: 0 }],
            bboxes: [110, 120, 130, 140, 108, 118, 132, 142, 0, 0, 500, 500]
        } }
    } }
};
assert.deepEqual(readRenderedStationLabelBounds({ map: nativeMap }), [
    { id: '1:0', minX: 8, minY: 18, maxX: 32, maxY: 42 }
], '原生回退应合并已放置的文字和背景框，排除底图文字并去掉碰撞网格留白');
const frameRecords = [{ properties: { id: '当前站名' }, screenPoint: { x: 110, y: 90 }, bounds: { left: -20, right: 20, top: -22, bottom: -4 } }];
assert.deepEqual(readRenderedStationLabelBounds({ map: nativeMap, frameRecords }), [
    { id: '当前站名', minX: 90, maxX: 130, minY: 68, maxY: 86 }
], '当前帧移动后的真实锚点应优先于保留的原生碰撞位置');
assert.deepEqual(readRenderedStationLabelBounds({ map: nativeMap, frameRecords: [] }), [], '当前没有可见站名时不恢复过期框');
assert.deepEqual(readRenderedStationLabelBounds({ map: nativeMap, frameRecords: [{ ...frameRecords[0], perspectiveRatio: 1.5 }] }), [
    { id: '当前站名', minX: 80, maxX: 140, minY: 57, maxY: 84 }
], '倾斜视角使用与原生绘制一致的透视文字尺寸');

const element = (rect, hidden = false) => ({ isConnected: true, hidden,
    classList: { contains: () => false }, getBoundingClientRect: () => rect });
const canvas = { clientWidth: 500, clientHeight: 400, getBoundingClientRect: () => ({ left: 10, top: 20 }) };
const domLabel = element({ left: 100, right: 150, top: 80, bottom: 100 });
const options = { canvas, mapEngine: { getRenderedStationLabelBounds: () => [] },
    stationLabels: [{ stationId: '固定站名', marker: {}, el: domLabel }],
    win: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) } };
const desktop = readLineNameLabelLayout({ ...options, overlays: [
    { edge: 'right', element: element({ left: 310, right: 510, top: 20, bottom: 420 }) }
] });
assert.deepEqual(desktop.viewport, { minX: 0, minY: 0, maxX: 300, maxY: 400 });
assert.deepEqual(desktop.obstacles, [{ id: '固定站名', minX: 90, maxX: 140, minY: 60, maxY: 80 }]);
const mobile = readLineNameLabelLayout({ ...options, overlays: [
    { edge: 'bottom', element: element({ left: 10, right: 510, top: 300, bottom: 420 }) },
    { edge: 'right', element: element({ left: 50, right: 510, top: 20, bottom: 420 }, true) }
] });
assert.deepEqual(mobile.viewport, { minX: 0, minY: 0, maxX: 500, maxY: 280 }, '移动抽屉只保留其上方可见地图，隐藏面板不占位置');
const hiddenMenu = element({ left: 10, right: 510, top: 100, bottom: 420 });
hiddenMenu.parentElement = { hidden: false, classList: { contains: name => name === 'is-hidden' } };
assert.deepEqual(readLineNameLabelLayout({ ...options, overlays: [{ edge: 'bottom', element: hiddenMenu }] }).viewport,
    { minX: 0, minY: 0, maxX: 500, maxY: 400 }, '移动菜单父容器隐藏时，其子面板不占用地图');
assert.deepEqual(readLineNameLabelLayout({ ...options, overlays: [
    { edge: 'bottom', element: element({ left: 10, right: 260, top: 80, bottom: 420 }) }
] }).viewport, { minX: 0, minY: 0, maxX: 500, maxY: 400,
    occlusions: [{ minX: 0, minY: 60, maxX: 250, maxY: 400 }] }, '半屏抽屉保留右侧全高和左上方地图');
assert.equal(readLineNameLabelLayout({ ...options, overlays: [] }).signature,
    readLineNameLabelLayout({ ...options, overlays: [] }).signature, '同一实际布局的签名保持稳定');
console.log('线路名布局测试通过：真实站名框、原生回退、DOM 标签、桌面侧栏、移动抽屉和布局去重。');
