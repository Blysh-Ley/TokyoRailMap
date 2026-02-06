import { loadGeoJSON } from './data.js';
import { addLinesLayer, addStationsLayer, setupStationPopup } from './layers.js';
import { createStationMarkers } from './labels.js';
import { setupCollisions } from './collision.js';
import { setupLineControls } from './controls.js';

// MapLibre 通过 CDN 以全局变量方式引入
const maplibregl = window.maplibregl;

if (!maplibregl) {
    throw new Error('MapLibre GL JS 未加载：请检查 maplibre-gl.js 引入是否成功');
}

// 1) 初始化地图（底图使用 Carto raster tiles）
const map = new maplibregl.Map({
    container: 'map',
    center: [139.767, 35.681],
    zoom: 11,
    style: {
        version: 8,
        sources: {
            'carto-light-source': {
                type: 'raster',
                tiles: [
                    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
                    'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '&copy; <a href="https://carto.com/">Carto</a>'
            }
        },
        layers: [
            {
                id: 'carto-light-layer',
                type: 'raster',
                source: 'carto-light-source',
                minzoom: 0,
                maxzoom: 18,
                paint: {}
            }
        ]
    }
});

// 2) 底图加载完成后再加载业务数据与图层
map.on('load', async () => {
    console.log('底图加载完毕，准备加载 GeoJSON...');

    // 用于“线路开关 → 站点联动”的共享引用
    let lineControls = null;
    let collisionController = null;

    try {
        const linesData = await loadGeoJSON('./lines.geojson');
        addLinesLayer(map, linesData);

        // 多级图层开关（类别→公司→线路→运行模式(预留)）
        lineControls = setupLineControls(map, linesData, {
            containerId: 'controls',
            layerIds: ['lines-layer'],
            companyField: 'company',
            lineIdField: 'id',
            lineNameField: 'name',
            modeField: 'service_mode'
        });

        // 线路隐藏/显示时，主动触发一次站点可见性更新
        lineControls.onChange(() => {
            if (collisionController) {
                collisionController.scheduleUpdate();
            }
        });
    } catch (e) {
        console.error('线路加载失败，请确保运行了 python -m http.server', e);
    }

    try {
        const stationsData = await loadGeoJSON('./stations.geojson');
        addStationsLayer(map, stationsData);

        const { stationLabels, stationCircles } = createStationMarkers(map, maplibregl, stationsData);

        // 站名碰撞：labelDyPx 需与 CSS translateY 的像素值保持一致
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            labelDyPx: 6,
            gridCellPx: 80,
            // 线路联动：只显示服务于“当前启用线路集合”的站点
            getEnabledLineIds: () => (lineControls ? lineControls.getEnabledLineIds() : null)
        });

        // 如果线路控制已初始化，站点加载完成后立即按当前线路开关状态刷新一次
        if (lineControls) {
            collisionController.scheduleUpdate();
        }

        setupStationPopup(map, maplibregl);
    } catch (e) {
        console.error('站点加载失败', e);
    }
});
