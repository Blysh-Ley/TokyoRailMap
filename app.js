import { loadGeoJSON } from './data.js';
import { addLinesLayer, addStationsLayer, setupStationPopup } from './layers.js';
import { createStationMarkers } from './labels.js';
import { setupCollisions } from './collision.js';
import { Menu } from './menu.js';

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

    let collisionController = null;
    let menu = null;
    let selectedCompany = null;
    let selectedLineId = null;
    let selectedServiceMode = 'all';
    let enabledLineIdsByCompany = new Map();
    const companyLogoMap = {
        JR东日本: {'img':["jreast.png"],'abb':"JR",'type':"JR铁路公司" },
        东京地下铁: {'img':["Tokyometro.png"],'abb':"东京地下铁" ,'type':"大手私铁/地下铁"},
        都营地下铁: {'img':["duyinmetro.svg"],'abb':"都营地下铁" ,'type':"地下铁"},
        都营交通: {'img':["duyinmetro.svg"],'abb':"都营交通" },
        京王电铁: {'img':["jingwang.svg", 65],'abb':"京王",'type':"大手私铁"},
        东武铁道: {'img':["dongwu.svg", 70],'abb':"东武",'type':"大手私铁" },
        东急电铁: {'img':["dongji.png"],'abb':"东急",'type':"大手私铁" },
        西武铁道: {'img':["xiwu.png"],'abb':"西武",'type':"大手私铁" },
        京急电铁: {'img':["jingji.png", 65],'abb':"京急",'type':"大手私铁" },
        小田急电铁: {'img':["xiaotianji.png"],'abb':"小田急",'type':"大手私铁" },
        京成电铁: {'img':["jingcheng.png", 60],'abb':"京成" ,'type':"大手私铁"},
        相模铁道: {'img':["xiangmo.png"],'abb':"相铁",'type':"大手私铁" },
        北总铁道:{'img':["beizong.png", 80] },
        首都圈新都市铁道: {'img':["TsukubaExpress.png", 40] },
        东京单轨电车: {'img':["tokyoMonorail.png"] },
        东京临海高速铁道: {'img':["linhai.png",40] },
        新交通百合鸥: {'img':["yurikamome.png", 45] },
        迪士尼: {'img':["disney.png", 65],'abb':" " },
        横滨市营地下铁: {'img':["yokohamaMetro.svg"],'type':"地下铁" },
        横滨海岸线: {'img':["YokohamaSeaside.png", 45] },
        横滨高速铁道: {'img':["gangweilai.png"]},
        横滨索道: {'img':["quanyang.png"]},
        千叶都市单轨: {'img':["chibaMonorail.png", 35] },
        东叶高速铁道: {'img':["dongyegaosu.png",40] },
        流铁: {'img':["liutie.png",35] },
        山万: {'img':["shanwan.png",35] },
        埼玉新都市交通: {'img':["SaitamaNUT.png"] },
        埼玉高速铁道: {'img':["qiyugaosu.png",50] },
        多摩都市单轨: {'img':["TamaMonorail.png"] },
        湘南单轨电车: {'img':["shonanMonorail.png", 50] },
        关东铁道: {'img':["guandong.png",35]},	
        江之岛电铁:{'img':["jiangdian.png",60]},	
        宇都宫轻轨:{'img':["yudugong.png",35]},
        鹿岛临海铁道:{'img':["ludao.png",35]},
        铫子电气铁道:{'img':["yaozi.png",35]},
        夷隅铁道:{'img':["yiou.png",35]},
        富士急行:{'img':["fushi.png",40]},
        芝山铁道:{'img':["zhishan.png"]},
        小凑铁道:{'img':["xiaocou.png",35]},
        伊豆急行:{'img':["yidouji.png"]},
        伊豆箱根铁道: {'img':["yidouxianggen.png",35] },
        秩父铁道: {'img':["zhifu.svg",35] },
        上毛电气铁道: {'img':["shangmao.svg",35] },
        真冈铁道: {'img':["zhengang.svg",35] },
        上信电铁: {'img':["shangxin.svg",35] },
        渡良濑溪谷铁道: {'img':["dulianglai.png",35] }
    };

    function applyLineSelectionStyle() {
        if (!map.getLayer('lines-layer')) return;

        const baseColorExpr = ['coalesce', ['get', 'color'], '#555'];

        // 线路优先：选中线路时，忽略公司选中
        if (selectedLineId) {
            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                ['==', ['get', 'id'], selectedLineId],
                baseColorExpr,
                '#999'
            ]);

            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                ['==', ['get', 'id'], selectedLineId],
                3,
                1.2
            ]);

            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                ['==', ['get', 'id'], selectedLineId],
                1,
                0.6
            ]);

            return;
        }

        if (!selectedCompany) {
            map.setPaintProperty('lines-layer', 'line-color', baseColorExpr);
            map.setPaintProperty('lines-layer', 'line-width', 3);
            map.setPaintProperty('lines-layer', 'line-opacity', 1);
            return;
        }

        
        map.setPaintProperty('lines-layer', 'line-color', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            baseColorExpr,
            '#999'
        ]);

        map.setPaintProperty('lines-layer', 'line-width', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            3,
            1.2
        ]);

        map.setPaintProperty('lines-layer', 'line-opacity', [
            'case',
            ['==', ['get', 'company'], selectedCompany],
            1,
            0.6
        ]);
    }

    function baseStationCircleRadiusExpr() {
        return [
            'interpolate',
            ['linear'],
            ['zoom'],
            6, [
                'case',
                ['==', ['length', ['get', 'serving_lines']], 1],
                0.5,
                0.5
            ],
            14, [
                'case',
                ['==', ['length', ['get', 'serving_lines']], 1],
                3.5,
                4
            ],
            22, [
                'case',
                ['==', ['length', ['get', 'serving_lines']], 1],
                3.5,
                4
            ]
        ];
    }

    function baseStationCircleStrokeWidthExpr() {
        return [
            'case',
            ['==', ['length', ['get', 'serving_lines']], 1],
            0,
            2
        ];
    }

    function buildStationAnyLineMatchExpr(lineIds) {
        // 判断站点是否服务于给定线路集合：
        // station.properties.serving_lines 是数组，因此用：any(in(lineId, serving_lines))
        const ids = Array.isArray(lineIds) ? lineIds.filter(Boolean) : [];
        if (!ids.length) return ['boolean', false];
        if (ids.length === 1) return ['in', ids[0], ['get', 'serving_lines']];

        const any = ['any'];
        for (const id of ids) {
            any.push(['in', id, ['get', 'serving_lines']]);
        }
        return any;
    }

    function applyStationSelectionStyle() {
        if (!map.getLayer('stations-layer')) return;

        // 未选择任何东西：恢复原样式
        if (!selectedLineId && !selectedCompany) {
            map.setPaintProperty('stations-layer', 'circle-radius', baseStationCircleRadiusExpr());
            map.setPaintProperty('stations-layer', 'circle-stroke-width', baseStationCircleStrokeWidthExpr());
            map.setPaintProperty('stations-layer', 'circle-color', '#fff');
            map.setPaintProperty('stations-layer', 'circle-stroke-color', '#333');
            return;
        }

        const isSelectedStation = selectedLineId
            ? ['in', selectedLineId, ['get', 'serving_lines']]
            : buildStationAnyLineMatchExpr(Array.from(enabledLineIdsByCompany.get(selectedCompany) ?? []));

        map.setPaintProperty('stations-layer', 'circle-radius', [
            'interpolate',
            ['linear'],
            ['zoom'],

            6, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', ['get', 'serving_lines']], 1],
                    0.5,
                    0.5
                ],
                0.5
            ],

            14, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', ['get', 'serving_lines']], 1],
                    3.5,
                    4
                ],
                0.5
            ],

            22, [
                'case',
                isSelectedStation,
                [
                    'case',
                    ['==', ['length', ['get', 'serving_lines']], 1],
                    3.5,
                    4
                ],
                0.5
            ]
        ]);

        map.setPaintProperty('stations-layer', 'circle-stroke-width', [
            'case',
            isSelectedStation,
            baseStationCircleStrokeWidthExpr(),
            0
        ]);

        map.setPaintProperty('stations-layer', 'circle-color', '#fff');
        map.setPaintProperty('stations-layer', 'circle-stroke-color', '#333');
        
    }

    function getEnabledLineIdsForLabels() {
        // 需求：选择线路不变、其他线路变灰变细；且“其他线路站点不显示站点名”
        // 这里返回“当前选中线路集合”，只用于站名筛选（圆点不筛选）。
        if (selectedLineId) return new Set([selectedLineId]);

        if (selectedCompany && enabledLineIdsByCompany.has(selectedCompany)) {
            return enabledLineIdsByCompany.get(selectedCompany);
        }

        return null;
    }

    function clearSelectionsAndRestore() {
        selectedCompany = null;
        selectedLineId = null;
        selectedServiceMode = 'all';

        if (menu && typeof menu.clearActive === 'function') menu.clearActive();

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
    }

    function bindClickBlankToRestore() {
        // 点击地图空白处：恢复所有线路显示（并同步恢复站点/站名联动）
        map.on('click', (e) => {
            const layers = [];
            if (map.getLayer('lines-layer')) layers.push('lines-layer');
            if (map.getLayer('stations-layer')) layers.push('stations-layer');

            // 若没有可查询的图层，视为“空白”
            const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
            if (hits.length) return;

            // 已经是“全显示”状态就不做任何事（避免多余刷新）
            if (!selectedCompany && !selectedLineId) return;

            clearSelectionsAndRestore();
        });
    }

    try {
        const linesData = await loadGeoJSON('./lines.geojson');
        addLinesLayer(map, linesData);

        // 线路偏移（像素）：从 lines.geojson 的 properties.offset 读取；没有则默认为 0
        if (map.getLayer('lines-layer')) {
            map.setPaintProperty('lines-layer', 'line-offset', ['coalesce', ['get', 'offset'], 0]);
        }

        // 构造 RWMenuCore 所需数据：companyObj / linesObj
        const lineFeatures = Array.isArray(linesData?.features)
            ? linesData.features.filter((f) => f?.properties?.type === 'line')
            : [];

        const companyObj = {};
        const linesObj = {};
        enabledLineIdsByCompany = new Map();

        // ====== 选中后自动缩放：预计算线路 bounds（支持 LineString / MultiLineString） ======
        const lineBoundsById = new Map();
        let lastFitKey = null;
        let fitRafId = null;
        let pendingFit = null;

        function extendBBox(b, lng, lat) {
            if (!b) return { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
            if (lng < b.minLng) b.minLng = lng;
            if (lat < b.minLat) b.minLat = lat;
            if (lng > b.maxLng) b.maxLng = lng;
            if (lat > b.maxLat) b.maxLat = lat;
            return b;
        }

        function bboxFromGeometry(geom) {
            if (!geom) return null;
            const type = geom.type;
            const coords = geom.coordinates;
            let b = null;

            if (type === 'LineString' && Array.isArray(coords)) {
                for (const pt of coords) {
                    if (!Array.isArray(pt) || pt.length < 2) continue;
                    b = extendBBox(b, Number(pt[0]), Number(pt[1]));
                }
                return b;
            }

            if (type === 'MultiLineString' && Array.isArray(coords)) {
                for (const line of coords) {
                    if (!Array.isArray(line)) continue;
                    for (const pt of line) {
                        if (!Array.isArray(pt) || pt.length < 2) continue;
                        b = extendBBox(b, Number(pt[0]), Number(pt[1]));
                    }
                }
                return b;
            }

            return null;
        }

        function unionBBox(a, b) {
            if (!a) return b;
            if (!b) return a;
            return {
                minLng: Math.min(a.minLng, b.minLng),
                minLat: Math.min(a.minLat, b.minLat),
                maxLng: Math.max(a.maxLng, b.maxLng),
                maxLat: Math.max(a.maxLat, b.maxLat)
            };
        }

        function bboxToFitBounds(b) {
            if (!b) return null;
            if (![b.minLng, b.minLat, b.maxLng, b.maxLat].every(Number.isFinite)) return null;
            // MapLibre: [[west,south],[east,north]]
            return [
                [b.minLng, b.minLat],
                [b.maxLng, b.maxLat]
            ];
        }

        function scheduleFit(key, bbox) {
            if (!bbox) return;
            if (key && key === lastFitKey) return;

            pendingFit = { key, bbox };
            if (fitRafId != null) return;

            fitRafId = requestAnimationFrame(() => {
                fitRafId = null;
                const next = pendingFit;
                pendingFit = null;
                if (!next) return;

                const bounds = bboxToFitBounds(next.bbox);
                if (!bounds) return;

                lastFitKey = next.key ?? null;
                map.fitBounds(bounds, {
                    padding: 60,
                    maxZoom: 10,
                    duration: 300,
                    easing: (t) => t,
                    essential: true
                });
            });
        }

        for (const f of lineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;

            const company = f?.properties?.company ?? '未知公司';
            const name = f?.properties?.name ?? String(lineId);

            companyObj[company] = true;

            if (!enabledLineIdsByCompany.has(company)) enabledLineIdsByCompany.set(company, new Set());
            enabledLineIdsByCompany.get(company).add(String(lineId));

            linesObj[String(lineId)] = {
                company,
                simplified: name,
                // 运行模式预留：目前只提供 all
                modes: ['all']
            };

            // 预计算该线路 geometry bounds
            const bbox = bboxFromGeometry(f.geometry);
            if (bbox) lineBoundsById.set(String(lineId), bbox);
        }

        function getBBoxForSelected() {
            if (selectedLineId) {
                const b = lineBoundsById.get(String(selectedLineId));
                return b ?? null;
            }

            if (selectedCompany) {
                const ids = enabledLineIdsByCompany.get(selectedCompany);
                if (!ids || ids.size === 0) return null;
                let b = null;
                for (const id of ids) {
                    b = unionBBox(b, lineBoundsById.get(String(id)) ?? null);
                }
                return b;
            }

            return null;
        }

        function fitToCurrentSelection(triggerKey) {
            const b = getBBoxForSelected();
            if (!b) return;
            scheduleFit(triggerKey, b);
        }

        // 旧的 #controls 容器不再作为侧边栏使用，清空避免视觉干扰
        const controlsEl = document.getElementById('controls');
        if (controlsEl) controlsEl.innerHTML = '';

        menu = new Menu({
            companyObj,
            linesObj,
            companyLogoMap,
            logoBasePath: './companyLogos/',
            hoverDelayMs: 500,
            onCancelSelection: clearSelectionsAndRestore,
            onCompanyClick: (companyName, meta) => {
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;
                if (source === 'hover') {
                    selectedCompany = companyName;
                } else {
                    // click 提交预览时不做反向 toggle
                    selectedCompany = commitPreview ? companyName : (selectedCompany === companyName ? null : companyName);
                }
                selectedLineId = null;
                selectedServiceMode = 'all';
                applyLineSelectionStyle();
                applyStationSelectionStyle();
                if (collisionController) collisionController.scheduleUpdate();
                if (selectedCompany) fitToCurrentSelection(`company:${selectedCompany}`);
            },
            onLineClick: (lineId, meta) => {
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;
                // 线路点击：优先级高于公司点击
                if (source === 'hover') {
                    selectedLineId = lineId;
                } else {
                    selectedLineId = commitPreview ? lineId : (selectedLineId === lineId ? null : lineId);
                }
                if (selectedLineId) selectedCompany = null;
                selectedServiceMode = 'all';
                applyLineSelectionStyle();
                applyStationSelectionStyle();
                if (collisionController) collisionController.scheduleUpdate();
                if (selectedLineId) fitToCurrentSelection(`line:${selectedLineId}`);
            },
            onModeClick: ({ lineId, mode }, meta) => {
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;
                // 预留：目前地图高亮/站名过滤仍以 lineId 为主
                if (source === 'hover') {
                    selectedLineId = lineId;
                    selectedServiceMode = mode;
                } else {
                    selectedLineId = commitPreview
                        ? lineId
                        : (selectedLineId === lineId && selectedServiceMode === mode ? null : lineId);
                    selectedServiceMode = mode;
                }
                if (selectedLineId) selectedCompany = null;
                applyLineSelectionStyle();
                applyStationSelectionStyle();
                if (collisionController) collisionController.scheduleUpdate();
                if (selectedLineId) fitToCurrentSelection(`mode:${selectedLineId}:${selectedServiceMode}`);
            }
        });

        menu.mount(document.body);
        menu.setWrapperStyle();
        window.addEventListener('resize', () => menu.setWrapperStyle());

        bindClickBlankToRestore();

        applyLineSelectionStyle();
        applyStationSelectionStyle();
    } catch (e) {
        console.error('线路加载失败，请确保运行了 python -m http.server', e);
    }

    try {
        const stationsData = await loadGeoJSON('./stations.geojson');
        addStationsLayer(map, stationsData);

        // 确保 stations-layer 创建后立即应用一次“选中线路的站点样式策略”
        applyStationSelectionStyle();

        const { stationLabels, stationCircles } = createStationMarkers(map, maplibregl, stationsData);

        // 站名碰撞：labelDyPx 需与 CSS translateY 的像素值保持一致
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            labelDyPx: 6,
            gridCellPx: 80,
            // 线路联动：只影响站名（圆点仍按碰撞显示）
            getEnabledLineIds: getEnabledLineIdsForLabels,
            lineFilterTarget: 'labels'
        });

        collisionController.scheduleUpdate();

        setupStationPopup(map, maplibregl);
    } catch (e) {
        console.error('站点加载失败', e);
    }
});
