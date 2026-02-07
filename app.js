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

// 左下角比例尺
map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
    'bottom-left'
);

// 2) 底图加载完成后再加载业务数据与图层
map.on('load', async () => {
    console.log('底图加载完毕，准备加载 GeoJSON...');

    let collisionController = null;
    let menu = null;
    let selectedCompany = null;
    let selectedLineId = null;
    let selectedServiceMode = 'all';
    let stationLabelMode = 'auto'; // 'off' | 'auto' | 'all'
    // 在 ES module 严格模式下，try/catch 内的 function 声明可能是块级作用域；这里预先声明避免点击时未定义
    let fitToCurrentSelection = () => {};
    let enabledLineIdsByCompany = new Map();

    // 底部居中提示条：显示当前高亮的公司/线路
    const selectionBadgeEl = document.createElement('div');
    selectionBadgeEl.className = 'selection-badge is-hidden';
    const selectionBadgeTextEl = document.createElement('span');
    selectionBadgeTextEl.className = 'selection-badge-text';
    selectionBadgeEl.appendChild(selectionBadgeTextEl);
    document.body.appendChild(selectionBadgeEl);

    const lineNameById = new Map();
    const lineColorById = new Map();

    function updateSelectionBadge() {
        if (selectedLineId) {
            const name = lineNameById.get(String(selectedLineId)) || String(selectedLineId);
            const color = lineColorById.get(String(selectedLineId)) || '#111';
            selectionBadgeTextEl.textContent = name;
            selectionBadgeTextEl.style.color = color;
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        if (selectedCompany) {
            selectionBadgeTextEl.textContent = String(selectedCompany);
            selectionBadgeTextEl.style.color = '#111';
            selectionBadgeEl.classList.remove('is-hidden');
            return;
        }

        selectionBadgeEl.classList.add('is-hidden');
    }
    const companyLogoMap = {
        JR东日本: {'img':["jreast.png"],'abb':"JR",'type':"JR铁路公司" },
        东京地下铁: {'img':["Tokyometro.png"],'abb':"东京地下铁" ,'type':"大手私铁/地下铁"},
        都营地下铁: {'img':["duyinmetro.svg"],'abb':"都营地下铁" ,'type':"地下铁"},
        都营交通: {'img':["duyinmetro.svg"],'abb':"都营交通" },
        京王电铁: {'img':["jingwang.svg", 65],'abb':"京王",'type':"大手私铁", 'order': ['京王线','新线','井之头'] },
        东武铁道: {'img':["dongwu.svg", 70],'abb':"东武",'type':"大手私铁", 'order': ['晴空塔','伊势崎','日光','东上','都市公园','龟户'] },
        东急电铁: {'img':["dongji.png"],'abb':"东急",'type':"大手私铁" },
        西武铁道: {'img':["xiwu.png"],'abb':"西武",'type':"大手私铁" ,'order': ['池袋','新宿'] },
        京急电铁: {'img':["jingji.png", 65],'abb':"京急",'type':"大手私铁", 'order': ['本线','空港'] },
        小田急电铁: {'img':["xiaotianji.png"],'abb':"小田急",'type':"大手私铁", 'order': ['小田原', '江之岛','多摩'] },
        京成电铁: {'img':["jingcheng.png", 60],'abb':"京成" ,'type':"大手私铁",'order':['本线','空港','押上']},
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
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        return [
            'interpolate',
            ['linear'],
            ['zoom'],
            6, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                0.5,
                0.5
            ],
            14, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                3.5,
                4
            ],
            22, [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                3.5,
                4
            ]
        ];
    }

    function baseStationCircleStrokeWidthExpr() {
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        return [
            'case',
            ['==', ['length', servingIdsExpr], 1],
            0,
            2
        ];
    }

    function buildStationAnyLineMatchExpr(lineIds) {
        // 判断站点是否服务于给定线路集合：
        // 优先用 platform_line_id（平台所属线路 id）来判断，避免换乘站的“另一条线路站台”被误判为命中
        // 兼容旧数据：没有 platform_line_id 时回退 serving_ids / serving_lines
        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], ['get', 'serving_ids'], ['get', 'serving_lines']];
        const ids = Array.isArray(lineIds) ? lineIds.filter(Boolean) : [];
        if (!ids.length) return ['boolean', false];
        if (ids.length === 1) return ['in', ids[0], platformIdsExpr];

        const any = ['any'];
        for (const id of ids) {
            any.push(['in', id, platformIdsExpr]);
        }
        return any;
    }

    function applyStationSelectionStyle() {
        if (!map.getLayer('stations-layer')) return;

        // 换乘站判断仍用 serving_ids（全服务线路集合）
        const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];
        // 高亮匹配用 platform_line_id（平台所属线路）
        const platformIdsExpr = ['coalesce', ['get', 'platform_line_id'], servingIdsExpr];

        // 未选择任何东西：恢复原样式
        if (!selectedLineId && !selectedCompany) {
            map.setPaintProperty('stations-layer', 'circle-radius', baseStationCircleRadiusExpr());
            map.setPaintProperty('stations-layer', 'circle-stroke-width', baseStationCircleStrokeWidthExpr());
            map.setPaintProperty('stations-layer', 'circle-color', '#fff');
            map.setPaintProperty('stations-layer', 'circle-stroke-color', '#333');
            return;
        }

        const isSelectedStation = selectedLineId
            ? ['in', selectedLineId, platformIdsExpr]
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
                    ['==', ['length', servingIdsExpr], 1],
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
                    ['==', ['length', servingIdsExpr], 1],
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
                    ['==', ['length', servingIdsExpr], 1],
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
        updateSelectionBadge();
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

    function bindClickLineToSelect() {
        if (!map.getLayer('lines-layer')) return;

        const cssEscape = (value) => {
            const s = String(value);
            // CSS.escape is supported by modern browsers; fallback for simple ids
            if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
            return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        };

        // 点击线路：高亮该线路及其站点（复用现有逻辑）
        map.on('click', 'lines-layer', (e) => {
            const f = e?.features?.[0];
            const lineId = f?.properties?.id ?? f?.id;
            if (lineId == null) return;

            const nextLineId = String(lineId);

            // 点击线路：永远选中；取消选择仅通过“点击空白处”
            selectedLineId = nextLineId;
            selectedCompany = null;
            selectedServiceMode = 'all';

            // 同步菜单高亮（如果菜单已挂载且能找到对应项）
            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applyLineSelectionStyle();
            applyStationSelectionStyle();
            if (collisionController) collisionController.scheduleUpdate();
            updateSelectionBadge();
            fitToCurrentSelection(`line:${selectedLineId}`);
        });

        // 鼠标样式提示可点击（可选但很轻量）
        map.on('mouseenter', 'lines-layer', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'lines-layer', () => {
            map.getCanvas().style.cursor = '';
        });
    }

    function mountStationLabelToggle() {
        const container = document.createElement('div');
        container.className = 'station-label-toggle';

        const text = document.createElement('span');
        text.className = 'station-label-toggle-text';
        text.textContent = '站名';

        const seg = document.createElement('div');
        seg.className = 'station-label-seg';

        const btnOff = document.createElement('button');
        btnOff.type = 'button';
        btnOff.textContent = '隐藏';

        const btnAuto = document.createElement('button');
        btnAuto.type = 'button';
        btnAuto.textContent = '自动';

        const btnAll = document.createElement('button');
        btnAll.type = 'button';
        btnAll.textContent = '全显';

        seg.appendChild(btnOff);
        seg.appendChild(btnAuto);
        seg.appendChild(btnAll);

        container.appendChild(text);
        container.appendChild(seg);
        document.body.appendChild(container);

        const setActive = () => {
            btnOff.classList.toggle('is-active', stationLabelMode === 'off');
            btnAuto.classList.toggle('is-active', stationLabelMode === 'auto');
            btnAll.classList.toggle('is-active', stationLabelMode === 'all');
        };

        const apply = (mode) => {
            stationLabelMode = mode;
            setActive();
            if (collisionController) collisionController.scheduleUpdate();
        };

        btnOff.addEventListener('click', () => apply('off'));
        btnAuto.addEventListener('click', () => apply('auto'));
        btnAll.addEventListener('click', () => apply('all'));

        apply('auto');
    }

    mountStationLabelToggle();

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

        function isFiniteNum(n) {
            return Number.isFinite(n);
        }

        function extendBBox(b, lng, lat) {
            if (!isFiniteNum(lng) || !isFiniteNum(lat)) return b;
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
                    const lng = Number(pt[0]);
                    const lat = Number(pt[1]);
                    b = extendBBox(b, lng, lat);
                }
                return b;
            }

            if (type === 'MultiLineString' && Array.isArray(coords)) {
                for (const line of coords) {
                    if (!Array.isArray(line)) continue;
                    for (const pt of line) {
                        if (!Array.isArray(pt) || pt.length < 2) continue;
                        const lng = Number(pt[0]);
                        const lat = Number(pt[1]);
                        b = extendBBox(b, lng, lat);
                    }
                }
                return b;
            }

            return null;
        }

        function unionBBox(a, b) {
            if (!a) return b;
            if (!b) return a;
            if (![a.minLng, a.minLat, a.maxLng, a.maxLat].every(isFiniteNum)) return b;
            if (![b.minLng, b.minLat, b.maxLng, b.maxLat].every(isFiniteNum)) return a;
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
                const flat = [bounds[0]?.[0], bounds[0]?.[1], bounds[1]?.[0], bounds[1]?.[1]];
                if (!flat.every(isFiniteNum)) return;

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
            const color = f?.properties?.color;

            lineNameById.set(String(lineId), String(name));
            if (typeof color === 'string' && color.trim()) lineColorById.set(String(lineId), color.trim());

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

        fitToCurrentSelection = (triggerKey) => {
            const b = getBBoxForSelected();
            if (!b) return;
            scheduleFit(triggerKey, b);
        };

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
                updateSelectionBadge();
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
                updateSelectionBadge();
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
                updateSelectionBadge();
                if (selectedLineId) fitToCurrentSelection(`mode:${selectedLineId}:${selectedServiceMode}`);
            }
        });

        menu.mount(document.body);
        menu.setWrapperStyle();
        window.addEventListener('resize', () => menu.setWrapperStyle());

        bindClickLineToSelect();

        bindClickBlankToRestore();

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        updateSelectionBadge();
    } catch (e) {
        console.error('线路加载失败，请确保运行了 python -m http.server', e);
    }

    try {
        const stationsData = await loadGeoJSON('./stations.geojson');
        addStationsLayer(map, stationsData);

        // 确保 stations-layer 创建后立即应用一次“选中线路的站点样式策略”
        applyStationSelectionStyle();

        const { stationLabels, stationCircles } = createStationMarkers(map, maplibregl, stationsData);

        // 站名碰撞：标签上移偏移在 labels.js 内按站点类型设置
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            gridCellPx: 80,
            // 线路联动：只影响站名（圆点仍按碰撞显示）
            getEnabledLineIds: getEnabledLineIdsForLabels,
            // 右上角三段开关：off/auto(碰撞)/all(无视碰撞)
            getLabelMode: () => stationLabelMode,
            // 高亮线路/公司时：圆点全部显示，避免缩小后站点消失
            getCircleMode: () => (selectedLineId || selectedCompany ? 'all' : 'collide'),
            lineFilterTarget: 'labels'
        });

        collisionController.scheduleUpdate();

        setupStationPopup(map, maplibregl);
    } catch (e) {
        console.error('站点加载失败', e);
    }
});
