import { loadRailGeoDataFromDataFolder } from './data.js';
import { addLinesLayer, addStationsLayer, setupStationPopup } from './layers.js';
import { createStationMarkers } from './labels.js';
import { setupCollisions } from './collision.js';
import { Menu } from './menu.js';
import { getGlobalTouchTapGuard } from './touchTapGuard.js';
import { createPanel } from './panel.js';

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

    // 触屏防误触：仅短按且几乎不移动才视为 tap
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    let collisionController = null;
    let menu = null;
    let selectedCompany = null;
    let selectedLineId = null;
    let selectedStationLineIds = null; // Set<string>：点击站点/站名后高亮其 serving_lines
    let selectedServiceMode = 'all';
    let isolateStationsToSelectedLine = false; // 仅用于“popup 提交线路”：隐藏非该线路站点
    let stationLabelMode = 'auto'; // 'off' | 'auto' | 'all'
    let setStationLabelMode = (_mode) => false;
    // 在 ES module 严格模式下，try/catch 内的 function 声明可能是块级作用域；这里预先声明避免点击时未定义
    // mode: 'preview' | 'commit'
    let fitToCurrentSelection = (_triggerKey, _mode = 'preview') => {};
    let enabledLineIdsByCompany = new Map();
    let stationPopup = null;
    let stationLabels = [];
    let fixedPopupStationId = null;

    // 右侧界面：站点/站名点击时弹出
    const panel = createPanel();

    const cssEscape = (value) => {
        const s = String(value);
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(s);
        return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    };

    // 底部居中提示条：显示当前高亮的公司/线路
    const selectionBadgeEl = document.createElement('div');
    selectionBadgeEl.className = 'selection-badge is-hidden';
    const selectionBadgeTextEl = document.createElement('span');
    selectionBadgeTextEl.className = 'selection-badge-text';
    selectionBadgeEl.appendChild(selectionBadgeTextEl);
    document.body.appendChild(selectionBadgeEl);

    const lineNameById = new Map();
    const lineColorById = new Map();
    const lineColorByName = new Map();
    const lineCompanyById = new Map();

    const normalizeArrayLike = (value) => {
        if (Array.isArray(value)) return value;
        if (typeof value !== 'string') return value != null ? [value] : [];

        const s = value.trim();
        if (!s) return [];

        // 兼容：某些数据源会把数组写成 JSON 字符串（例如 "[\"A\",\"B\"]"）
        if (s.startsWith('[') && s.endsWith(']')) {
            try {
                const parsed = JSON.parse(s);
                return Array.isArray(parsed) ? parsed : [value];
            } catch {
                return [value];
            }
        }
        return [s];
    };

    const getServingLineIdsFromStationProps = (props) => {
        const p = props || {};
        // 注意：stations.geojson 的 serving_lines 是“线路名称”，不一定等同于 lines.geojson 的 id。
        // 目前 lines-layer 的匹配应优先使用 serving_ids / platform_line_id（都是线路 id）。
        const servingIdsRaw = normalizeArrayLike(p.serving_ids);
        const platformLineIdsRaw = normalizeArrayLike(p.platform_line_id);
        const servingLinesRaw = normalizeArrayLike(p.serving_lines);

        let ids = (servingIdsRaw && servingIdsRaw.length ? servingIdsRaw : platformLineIdsRaw)
            .map((x) => String(x).trim())
            .filter(Boolean);

        // 兜底：若只有 serving_lines（名称），尝试用 lineNameById 反查 id
        if ((!ids || ids.length === 0) && servingLinesRaw && servingLinesRaw.length) {
            const names = servingLinesRaw.map((x) => String(x).trim()).filter(Boolean);
            if (names.length) {
                const out = [];
                for (const name of names) {
                    for (const [id, n] of lineNameById.entries()) {
                        if (String(n) === name) {
                            out.push(String(id));
                            break;
                        }
                    }
                }
                ids = out;
            }
        }

        // 去重且保持顺序
        const seen = new Set();
        const out = [];
        for (const id of ids) {
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    };

    const selectServingLinesForStation = (props) => {
        const ids = getServingLineIdsFromStationProps(props);
        if (!ids.length) return;

        selectedStationLineIds = new Set(ids);
        selectedCompany = null;
        selectedLineId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
        updateSelectionBadge();
    };

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
    'JR-East': { 'zh': 'JR东日本', 'img': ["jreast.png"], 'abb': "JR", 'type': "JR铁路公司" },
    'JR-Central': { 'zh': 'JR东海', 'img': ["jrc.svg"], 'abb': "JR东海", 'type': "JR铁路公司" },
    'TokyoMetro': { 'zh': '东京地下铁', 'img': ["Tokyometro.png", 60], 'abb': "东京地下铁", 'type': "大手私铁/地下铁" },
    'Toei': { 'zh': '都营地下铁', 'img': ["duyinmetro.svg"], 'abb': "都营地下铁", 'type': "地下铁" },
    //'Toei': { 'zh': '都营交通', 'img': ["duyinmetro.svg"],'abb':"都营交通" },
    'Keio': { 'zh': '京王电铁', 'img': ["jingwang.svg", 65], 'abb': "京王", 'type': "大手私铁", 'order': ['京王线', '新线', '井之头'] },
    'Tobu': { 'zh': '东武铁道', 'img': ["dongwu.svg", 70], 'abb': "东武", 'type': "大手私铁", 'order': ['晴空塔', '伊势崎', '日光', '东上', '都市公园', '龟户'] },
    'Tokyu': { 'zh': '东急电铁', 'img': ["dongji.png"], 'abb': "东急", 'type': "大手私铁" },
    'Seibu': { 'zh': '西武铁道', 'img': ["xiwu.png"], 'abb': "西武", 'type': "大手私铁", 'order': ['池袋', '新宿'] },
    'Keikyu': { 'zh': '京急电铁', 'img': ["jingji.png", 65], 'abb': "京急", 'type': "大手私铁", 'order': ['本线', '空港'] },
    'Odakyu': { 'zh': '小田急电铁', 'img': ["xiaotianji.png"], 'abb': "小田急", 'type': "大手私铁", 'order': ['小田原', '江之岛', '多摩'] },
    'Keisei': { 'zh': '京成电铁', 'img': ["jingcheng.png", 60], 'abb': "京成", 'type': "大手私铁", 'order': ['本线', '空港', '押上'] },
    'Sotetsu': { 'zh': '相模铁道', 'img': ["xiangmo.png"], 'abb': "相铁", 'type': "大手私铁" },
    'Hokuso': { 'zh': '北总铁道', 'img': ["beizong.png", 80] },
    'MIR': { 'zh': '首都圈新都市铁道', 'img': ["TsukubaExpress.png", 40] },
    'TokyoMonorail': { 'zh': '东京单轨电车', 'img': ["tokyoMonorail.png"] },
    'TWR': { 'zh': '东京临海高速铁道', 'img': ["linhai.png", 40] },
    'Yurikamome': { 'zh': '新交通百合鸥', 'img': ["yurikamome.png", 45] },
    'Disney': { 'zh': '迪士尼', 'img': ["disney.png", 65], 'abb': " " },
    'YokohamaMunicipal': { 'zh': '横滨市营地下铁', 'img': ["yokohamaMetro.svg"], 'type': "地下铁" },
    'YokohamaSeaside': { 'zh': '横滨海岸线', 'img': ["YokohamaSeaside.png", 45] },
    'Minatomirai': { 'zh': '横滨高速铁道', 'img': ["gangweilai.png"] },
    //'Yokohama Ropeway': { 'zh': '横滨索道', 'img': ["quanyang.png"]},
    'ChibaMonorail': { 'zh': '千叶都市单轨', 'img': ["chibaMonorail.png", 35] },
    'ToyoRapid': { 'zh': '东叶高速铁道', 'img': ["dongyegaosu.png", 40] },
    'Ryutetsu': { 'zh': '流铁', 'img': ["liutie.png", 35] },
    'Yamaman': { 'zh': '山万', 'img': ["shanwan.png", 35] },
    'SaitamaTransit': { 'zh': '埼玉新都市交通', 'img': ["SaitamaNUT.png"] },
    'SaitamaRailway': { 'zh': '埼玉高速铁道', 'img': ["qiyugaosu.png", 50] },
    'TamaMonorail': { 'zh': '多摩都市单轨', 'img': ["TamaMonorail.png"] },
    'ShonanMonorail': { 'zh': '湘南单轨电车', 'img': ["shonanMonorail.png", 50] },
    'KantoRailway': { 'zh': '关东铁道', 'img': ["guandong.png", 35] },
    'Enoden': { 'zh': '江之岛电铁', 'img': ["jiangdian.png", 60] },
    'UtsunomiyaLightRail': { 'zh': '宇都宫轻轨', 'img': ["yudugong.png", 35] },
    'KashimaRinkai': { 'zh': '鹿岛临海铁道', 'img': ["ludao.png", 35] },
    'Choshi': { 'zh': '铫子电气铁道', 'img': ["yaozi.png", 35] },
    'Isumi': { 'zh': '夷隅铁道', 'img': ["yiou.png", 35] },
    'Fujikyu': { 'zh': '富士急行', 'img': ["fushi.png", 40] },
    'Shibayama': { 'zh': '芝山铁道', 'img': ["zhishan.png"] },
    'Kominato': { 'zh': '小凑铁道', 'img': ["xiaocou.png", 35] },
    'Izukyu': { 'zh': '伊豆急行', 'img': ["yidouji.png"] },
    'Hitachinaka':{'zh':'常陆那珂海滨铁道','img':["hitachinaka.svg",35]},
    'IzuHakone': { 'zh': '伊豆箱根铁道', 'img':["yidouxianggen.png",35] },
    'OdakyuHakone': { 'zh': '箱根登山铁道', 'img':["xiaotianji.png"] },
    'Chichibu': { 'zh': '秩父铁道', 'img': ["zhifu.svg", 35] },
    //'Jōmō Electric Railway': { 'zh': '上毛电气铁道', 'img':["shangmao.svg",35] },
    'Moka': { 'zh': '真冈铁道', 'img':["zhengang.svg",35] },
    //'Jōshin Dentetsu': { 'zh': '上信电铁', 'img':["shangxin.svg",35] },
    //'Watarase Keikoku Railway': { 'zh': '渡良濑溪谷铁道', 'img':["dulianglai.png",35] }
};



    // 暴露给 search.js：复用公司 logo 元数据（避免 search.js import app.js 导致重复初始化）
    try {
        window.TokyoRailCompanyLogoMap = companyLogoMap;
        window.TokyoRailCompanyLogoBasePath = './companyLogos/';
    } catch {
        // ignore
    }

    function applyLineSelectionStyle() {
        if (!map.getLayer('lines-layer')) return;

        const baseColorExpr = ['coalesce', ['get', 'color'], '#555'];

        // 线路优先：选中线路时，忽略公司选中
        // 但如果菜单把支线合并到主线（selectedStationLineIds 里包含多条），则按集合高亮。
        if (selectedLineId) {
            const mergedIds = (selectedStationLineIds && selectedStationLineIds.size > 1)
                ? Array.from(selectedStationLineIds).map(String).filter(Boolean)
                : null;
            const hitExpr = mergedIds
                ? ['in', ['get', 'id'], ['literal', mergedIds]]
                : ['==', ['get', 'id'], selectedLineId];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);

            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]); //线宽，线路宽度

            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                0.6
            ]);

            return;
        }

        // 站点选中：高亮该站点的所有 serving_lines（不执行 fitBounds）
        if (selectedStationLineIds && selectedStationLineIds.size) {
            const ids = Array.from(selectedStationLineIds).map(String).filter(Boolean);
            const hitExpr = ids.length === 1
                ? ['==', ['get', 'id'], ids[0]]
                : ['in', ['get', 'id'], ['literal', ids]];

            map.setPaintProperty('lines-layer', 'line-color', [
                'case',
                hitExpr,
                baseColorExpr,
                '#999'
            ]);

            map.setPaintProperty('lines-layer', 'line-width', [
                'case',
                hitExpr,
                3,
                1.2
            ]);//线宽，线路宽度

            map.setPaintProperty('lines-layer', 'line-opacity', [
                'case',
                hitExpr,
                1,
                0.6
            ]);

            return;
        }

        if (!selectedCompany) {
            map.setPaintProperty('lines-layer', 'line-color', baseColorExpr);
            map.setPaintProperty('lines-layer', 'line-width', 3); //线宽
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
        if (!selectedLineId && !selectedCompany && !(selectedStationLineIds && selectedStationLineIds.size)) {
            map.setPaintProperty('stations-layer', 'circle-radius', baseStationCircleRadiusExpr());
            map.setPaintProperty('stations-layer', 'circle-stroke-width', baseStationCircleStrokeWidthExpr());
            // 重要：上一次高亮可能设置过 circle-opacity（仅影响填充，不影响描边），
            // 若不在“恢复原样式”时重置，会导致换乘站出现“空心圈/圆心透明”。
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-stroke-opacity', 1);
            map.setPaintProperty('stations-layer', 'circle-color', '#fff');
            map.setPaintProperty('stations-layer', 'circle-stroke-color', '#333');
            return;
        }

        const mergedIdsForSelectedLine = (selectedLineId && selectedStationLineIds && selectedStationLineIds.size > 1)
            ? Array.from(selectedStationLineIds).map(String).filter(Boolean)
            : null;

        const isSelectedStation = selectedLineId
            ? (mergedIdsForSelectedLine
                ? buildStationAnyLineMatchExpr(mergedIdsForSelectedLine)
                : ['in', selectedLineId, platformIdsExpr])
            : selectedCompany
                ? buildStationAnyLineMatchExpr(Array.from(enabledLineIdsByCompany.get(selectedCompany) ?? []))
                : buildStationAnyLineMatchExpr(Array.from(selectedStationLineIds ?? []));

        const shouldIsolate = Boolean(selectedLineId) && isolateStationsToSelectedLine === true;

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

        // 需求（仅对“popup 提交线路”）：隐藏其他站点
        if (shouldIsolate) {
            map.setPaintProperty('stations-layer', 'circle-opacity', [
                'case',
                isSelectedStation,
                1,
                0
            ]);
        } else {
            map.setPaintProperty('stations-layer', 'circle-opacity', 1);
        }

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
        if (selectedLineId) {
            if (selectedStationLineIds && selectedStationLineIds.size > 1) return selectedStationLineIds;
            return new Set([selectedLineId]);
        }

        if (selectedStationLineIds && selectedStationLineIds.size) {
            return selectedStationLineIds;
        }

        if (selectedCompany && enabledLineIdsByCompany.has(selectedCompany)) {
            return enabledLineIdsByCompany.get(selectedCompany);
        }

        return null;
    }

    function clearSelectionsAndRestore() {
        selectedCompany = null;
        selectedLineId = null;
        selectedStationLineIds = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;
        setStationLabelMode('auto');

        if (menu && typeof menu.clearActive === 'function') menu.clearActive();

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
        updateSelectionBadge();
    }

    const applySelectionEffects = () => {
        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
        updateSelectionBadge();
    };

    const setFixedPopupStationLabelBelow = (stationId) => {
        fixedPopupStationId = stationId != null ? String(stationId) : null;

        if (!Array.isArray(stationLabels) || !stationLabels.length) return;

        // 先恢复所有站名为默认“上移”位置
        for (const label of stationLabels) {
            label.labelPosition = null;
            label.labelBelowPadPx = null;
            const dy = Number.isFinite(label.labelDyPx) ? label.labelDyPx : 0;
            label.el.style.translate = `0 -${dy}px`;
        }

        if (!fixedPopupStationId) {
            if (collisionController) collisionController.scheduleUpdate();
            return;
        }

        const pinned = stationLabels.find((x) => x && String(x.stationId) === fixedPopupStationId);
        if (!pinned) {
            if (collisionController) collisionController.scheduleUpdate();
            return;
        }

        // 站点正下方：下移自身高度(100%)后再留一点间距
        const pad = pinned.priority > 1 ? 6 : 4;
        pinned.labelPosition = 'below';
        pinned.labelBelowPadPx = pad;
        pinned.el.style.translate = `0 calc(100% + ${pad}px)`;

        if (collisionController) collisionController.scheduleUpdate();
    };

    let popupPreviewSnapshot = null;
    let popupPreviewWasApplied = false;

    const hideStationPopupForMenuInteraction = () => {
        if (!stationPopup || typeof stationPopup.getOpenMode !== 'function') return;
        const mode = stationPopup.getOpenMode();
        if (!mode) return;

        // 菜单 hover/commit 任一交互发生时：站点 popup 应立即隐藏
        // 同时清理 popup 的预览快照，避免 popup 关闭时回滚干扰菜单预览。
        popupPreviewSnapshot = null;
        popupPreviewWasApplied = false;
        stationPopup.closePopup?.({ committed: true });
    };

    const snapshotSelectionState = () => ({
        selectedCompany,
        selectedLineId,
        selectedStationLineIds: selectedStationLineIds ? Array.from(selectedStationLineIds) : null,
        selectedServiceMode,
        stationLabelMode,
        isolateStationsToSelectedLine
    });

    const restoreSelectionState = (snapshot) => {
        if (!snapshot) return;
        selectedCompany = snapshot.selectedCompany;
        selectedLineId = snapshot.selectedLineId;
        selectedStationLineIds = Array.isArray(snapshot.selectedStationLineIds)
            ? new Set(snapshot.selectedStationLineIds.map(String).filter(Boolean))
            : null;
        selectedServiceMode = snapshot.selectedServiceMode;
        setStationLabelMode(snapshot.stationLabelMode);
        isolateStationsToSelectedLine = snapshot.isolateStationsToSelectedLine === true;
        applySelectionEffects();
    };

    // 暴露给 search.js：复用“菜单同款”的预览/提交高亮 + fitBounds
    // 注意：search.js 不能 import app.js（会重复初始化地图），因此用 window 作为桥接。
    const searchMapActions = (() => {
        try {
            if (!window.TokyoRailSearchMapActions) window.TokyoRailSearchMapActions = {};
            return window.TokyoRailSearchMapActions;
        } catch {
            return null;
        }
    })();

    const normalizeLineIdArrayLike = (value) => {
        const raw = normalizeArrayLike(value);
        const out = [];
        const seen = new Set();
        for (const x of raw) {
            const id = String(x).trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(id);
        }
        return out;
    };

    // “通过该站台的线路”：优先 platform_line_id；没有则回退 serving_ids / serving_lines
    const getPlatformLineIdsFromStationProps = (props) => {
        const p = props || {};
        const platformIds = normalizeLineIdArrayLike(p.platform_line_id);
        if (platformIds.length) return platformIds;

        const servingIds = normalizeLineIdArrayLike(p.serving_ids);
        if (servingIds.length) return servingIds;

        const servingLines = normalizeLineIdArrayLike(p.serving_lines);
        if (!servingLines.length) return [];

        // 若 serving_lines 是“名称”，尝试用 lineNameById 反查 id
        const out = [];
        for (const name of servingLines) {
            for (const [id, n] of lineNameById.entries()) {
                if (String(n) === name) {
                    out.push(String(id));
                    break;
                }
            }
        }
        return out;
    };

    const selectPlatformLinesForStation = (props) => {
        const ids = getPlatformLineIdsFromStationProps(props);
        if (!ids.length) return;

        selectedStationLineIds = new Set(ids);
        selectedCompany = null;
        selectedLineId = null;
        selectedServiceMode = 'all';
        isolateStationsToSelectedLine = false;

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        if (collisionController) collisionController.scheduleUpdate();
        updateSelectionBadge();
    };

    const fitToPointAsBounds = (coordinates, { maxZoom } = {}) => {
        if (!Array.isArray(coordinates) || coordinates.length < 2) return;
        const lng = Number(coordinates[0]);
        const lat = Number(coordinates[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

        // 点用一个很小的 bbox 来 fitBounds，实现“居中”语义
        const dLng = 0.006;
        const dLat = 0.004;
        const bounds = [
            [lng - dLng, lat - dLat],
            [lng + dLng, lat + dLat]
        ];

        const opts = {
            padding: 60,
            duration: 300,
            easing: (t) => t,
            essential: true
        };
        if (Number.isFinite(maxZoom)) opts.maxZoom = maxZoom;
        try {
            map.fitBounds(bounds, opts);
        } catch {
            // ignore
        }
    };

    const findStationLabelItemById = (stationId) => {
        const id = String(stationId ?? '').trim();
        if (!id) return null;
        if (!Array.isArray(stationLabels) || !stationLabels.length) return null;
        return (
            stationLabels.find((x) => x && String(x.stationId) === id) ||
            stationLabels.find((x) => x && String(x.props?.id ?? '') === id) ||
            null
        );
    };

    if (searchMapActions) {
        searchMapActions.isReady = false;
        searchMapActions.snapshotSelectionState = snapshotSelectionState;
        searchMapActions.restoreSelectionState = restoreSelectionState;

        searchMapActions.previewLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(id)
                : null;

            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            applySelectionEffects();
            fitToCurrentSelection(`line:${selectedLineId}`, 'preview');
        };

        searchMapActions.commitLine = (lineId) => {
            const id = String(lineId ?? '').trim();
            if (!id) return;
            hideStationPopupForMenuInteraction();

            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(id)
                : null;

            const mainLineId = String(resolved?.mainLineId ?? id);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('all');

            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applySelectionEffects();
            fitToCurrentSelection(`line:${selectedLineId}`, 'commit');
        };

        searchMapActions.previewCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            selectedStationLineIds = null;
            selectedCompany = name;
            selectedLineId = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');
            applySelectionEffects();
            fitToCurrentSelection(`company:${name}`, 'preview');
        };

        searchMapActions.commitCompany = (companyName) => {
            const name = String(companyName ?? '').trim();
            if (!name) return;
            hideStationPopupForMenuInteraction();
            selectedStationLineIds = null;
            selectedCompany = name;
            selectedLineId = null;
            selectedServiceMode = 'all';
            isolateStationsToSelectedLine = false;
            setStationLabelMode('auto');

            if (menu && typeof menu.markActive === 'function') {
                const companyEls = menu.wrapper?.querySelectorAll?.('.RW-company-content') || [];
                for (const el of companyEls) {
                    const n = el?.querySelector?.('.RW-company-name')?.textContent?.trim();
                    if (n === name) {
                        menu.markActive(el);
                        break;
                    }
                }
            }

            applySelectionEffects();
            fitToCurrentSelection(`company:${name}`, 'commit');
        };

        // station 的 popup 依赖 stationsData 加载完成后初始化的 stationPopup；这里先挂函数，内部做空值保护
        const openFixedPopupForStationId = (stationId, meta = {}) => {
            const item = findStationLabelItemById(stationId);
            if (!item) return null;

            const props = item.props || {};
            const coords = item.coordinates;
            const pt = meta?.pointerType ? String(meta.pointerType) : 'mouse';

            setFixedPopupStationLabelBelow(props.id ?? item.stationId);
            selectPlatformLinesForStation(props);
            stationPopup?.setExternalStationHover?.(true);
            stationPopup?.showPopupAt?.(coords, props, { pointerType: pt });
            fitToPointAsBounds(coords, { maxZoom: meta?.maxZoom });
            return { props, coords };
        };

        searchMapActions.previewStation = (stationId, meta) => {
            openFixedPopupForStationId(stationId, meta || {});
        };

        searchMapActions.commitStation = (stationId, meta) => {
            const opened = openFixedPopupForStationId(stationId, meta || {});
            // search 提交站点选择：弹出右侧 panel
            panel?.showForStationProps?.(opened?.props || {});
        };

        // 方便搜索预览结束时收起 popup（如果需要）
        searchMapActions.closeStationPopup = ({ committed } = {}) => {
            stationPopup?.closePopup?.({ committed: committed !== false });
            setFixedPopupStationLabelBelow(null);
        };
    }

    function bindClickBlankToRestore() {
        // 点击地图空白处：恢复所有线路显示（并同步恢复站点/站名联动）
        map.on('click', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            const layers = [];
            if (map.getLayer('lines-layer')) layers.push('lines-layer');
            if (map.getLayer('stations-layer')) layers.push('stations-layer');

            // 若没有可查询的图层，视为“空白”
            const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
            if (hits.length) return;

            // 点击空白处：隐藏右侧 panel
            panel?.hide?.();

            // 已经是“全显示”状态就不做任何事（避免多余刷新）
            if (!selectedCompany && !selectedLineId && !(selectedStationLineIds && selectedStationLineIds.size)) return;

            clearSelectionsAndRestore();
        });
    }

    function bindClickLineToSelect() {
        if (!map.getLayer('lines-layer')) return;

        // 点击线路：高亮该线路及其站点（复用现有逻辑）
        map.on('click', 'lines-layer', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            // 若点击点同时命中站点（站点覆盖在线路上），则视为“点击站点”，不高亮线路
            // 需求：点击站点（或站点与线路一起被点到）时，不应触发线路选中
            if (map.getLayer('stations-layer')) {
                const stationHits = map.queryRenderedFeatures(e.point, { layers: ['stations-layer'] }) || [];
                if (stationHits.length) return;
            }

            const f = e?.features?.[0];
            const lineId = f?.properties?.id ?? f?.id;
            if (lineId == null) return;

            const rawLineId = String(lineId);
            const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                ? menu.resolveLineSelection(rawLineId)
                : null;

            const mainLineId = String(resolved?.mainLineId ?? rawLineId);
            const merged = Array.isArray(resolved?.mergedLineIds)
                ? resolved.mergedLineIds.map(String).filter(Boolean)
                : [mainLineId];

            // 点击线路：永远选中；取消选择仅通过“点击空白处”
            selectedLineId = mainLineId;
            selectedCompany = null;
            selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
            selectedServiceMode = 'all';
            setStationLabelMode('all');

            // 同步菜单高亮（如果菜单已挂载且能找到对应项）
            if (menu && typeof menu.markActive === 'function') {
                const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                if (el) menu.markActive(el);
            }

            applyLineSelectionStyle();
            applyStationSelectionStyle();
            if (collisionController) collisionController.scheduleUpdate();
            updateSelectionBadge();
            // 点击高亮：不限制放大倍率
            fitToCurrentSelection(`line:${selectedLineId}`, 'commit');
        });

        // 鼠标样式提示可点击（可选但很轻量）
        map.on('mouseenter', 'lines-layer', () => {
            map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'lines-layer', () => {
            map.getCanvas().style.cursor = '';
        });
    }

    function bindClickStationToHighlightServingLines() {
        if (!map.getLayer('stations-layer')) return;

        // 点击站点圆点：高亮其 serving_lines（不执行 fitBounds）
        map.on('click', 'stations-layer', (e) => {
            if (!touchTapGuard.allowTap(e?.originalEvent)) return;

            const f = e?.features?.[0];
            const props = f?.properties || {};
            setFixedPopupStationLabelBelow(props.id ?? f?.id);
            selectServingLinesForStation(props);

            // 打开右侧界面 A
            panel?.showForStationProps?.(props);
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

        const setMode = (mode) => {
            stationLabelMode = mode;
            setActive();
        };

        setStationLabelMode = (mode) => {
            if (stationLabelMode === mode) return false;
            setMode(mode);
            return true;
        };

        btnOff.addEventListener('click', () => {
            setMode('off');
            if (collisionController) collisionController.scheduleUpdate();
        });
        btnAuto.addEventListener('click', () => {
            setMode('auto');
            if (collisionController) collisionController.scheduleUpdate();
        });
        btnAll.addEventListener('click', () => {
            setMode('all');
            if (collisionController) collisionController.scheduleUpdate();
        });

        setMode('auto');
    }

    mountStationLabelToggle();

    let generatedLinesData = null;
    let generatedStationsData = null;

    try {
        const { linesGeoJSON, linesGeoJSONByZoom, stationsGeoJSON, diagnostics } = await loadRailGeoDataFromDataFolder();
        generatedLinesData = linesGeoJSON;
        generatedStationsData = stationsGeoJSON;

        /*
        try {
            const items = Array.isArray(diagnostics?.largeGaps) ? diagnostics.largeGaps : [];
            if (items.length) {
                // 同一条线路可能有多个 segment 触发；按 id 取 max
                const byId = new Map();
                for (const it of items) {
                    const id = String(it?.id || '').trim();
                    if (!id) continue;
                    const prev = byId.get(id);
                    if (!prev || (it?.maxJumpMeters ?? 0) > (prev?.maxJumpMeters ?? 0)) byId.set(id, it);
                }
                const sorted = Array.from(byId.values()).sort((a, b) => (b?.maxJumpMeters ?? 0) - (a?.maxJumpMeters ?? 0));
                console.warn('[数据检查] 存在“大跨度跳跃”的线路（按最大相邻点跳跃降序）：');
                for (const it of sorted) {
                    const km = ((it?.maxJumpMeters ?? 0) / 1000).toFixed(2);
                    console.warn(`- ${it?.titleZhHans || it?.id} (${it?.id}): ${km}km`);
                }
            } else {
                console.log('[数据检查] 未发现“大跨度跳跃”的线路');
            }
        } catch {
            // ignore
        }
        */
        const linesData = (linesGeoJSONByZoom && linesGeoJSONByZoom[18]) || linesGeoJSON;
        addLinesLayer(map, linesData);

        // 需求：无视缩放比例，不做 zoom 级别切换

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
        let lastFitPaddingSig = null;

        const getFitPadding = (paddingMode = 'auto') => {
            const base = 60;
            const extraLeft = 200;

            // 默认：四周等距 padding
            const fallback = { top: base, right: base, bottom: base, left: base };

            // 提交选择：强制按全屏 fit（不扣除菜单宽度）
            if (paddingMode === 'full') return fallback;

            if (!menu?.wrapper) return fallback;

            // 需求：预览（hover）时也应扣除左侧菜单占用宽度。
            // 注意：菜单可能处于“收起但仍在左侧”的状态，此时 rect.right 可能接近 0；
            // 为保持一致，使用 max(rect.right, rect.width) 来估算需要预留的宽度。
            const rect = menu.wrapper.getBoundingClientRect?.();
            if (!rect || !Number.isFinite(rect.width)) return fallback;

            const reserve = Math.max(0, Number.isFinite(rect.right) ? rect.right : 0, rect.width);
            const leftPad = Math.max(base, Math.ceil(reserve + base + extraLeft));
            return { top: base, right: base, bottom: base, left: leftPad };
        };

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

        function scheduleFit(key, bbox, options = {}) {
            if (!bbox) return;
            const padding = getFitPadding(options?.paddingMode);
            const paddingSig = `l${padding.left}|r${padding.right}|t${padding.top}|b${padding.bottom}`;
            if (key && key === lastFitKey && paddingSig === lastFitPaddingSig) return;

            pendingFit = { key, bbox, options, padding, paddingSig };
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
                lastFitPaddingSig = next.paddingSig ?? null;
                const fitOptions = {
                    padding: next.padding || 60,
                    duration: 300,
                    easing: (t) => t,
                    essential: true
                };
                if (Number.isFinite(next.options?.maxZoom)) fitOptions.maxZoom = next.options.maxZoom;
                map.fitBounds(bounds, fitOptions);
            });
        }

        for (const f of lineFeatures) {
            const lineId = f?.properties?.id ?? f?.id;
            if (!lineId) continue;

            const company = f?.properties?.company ?? '未知公司';
            const name = f?.properties?.name ?? String(lineId);
            const color = f?.properties?.color;

            lineCompanyById.set(String(lineId), String(company));

            lineNameById.set(String(lineId), String(name));
            if (typeof color === 'string' && color.trim()) lineColorById.set(String(lineId), color.trim());
            if (typeof color === 'string' && color.trim()) lineColorByName.set(String(name), color.trim());

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
            if (bbox) {
                const key = String(lineId);
                const prev = lineBoundsById.get(key) ?? null;
                lineBoundsById.set(key, unionBBox(prev, bbox));
            }
        }

        function getBBoxForSelected() {
            if (selectedLineId) {
                if (selectedStationLineIds && selectedStationLineIds.size > 1) {
                    let b = null;
                    for (const id of selectedStationLineIds) {
                        b = unionBBox(b, lineBoundsById.get(String(id)) ?? null);
                    }
                    return b ?? null;
                }

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

        const fitToCurrentSelectionPreview = (triggerKey) => {
            const b = getBBoxForSelected();
            if (!b) return;
            scheduleFit(`preview:${triggerKey}`, b, { maxZoom: 11 });
        };

        const fitToCurrentSelectionCommit = (triggerKey) => {
            const b = getBBoxForSelected();
            if (!b) return;
            // 点击高亮：不限制放大倍率，按 bounds 实际大小 fit
            scheduleFit(`commit:${triggerKey}`, b, { maxZoom: undefined, paddingMode: 'full' });
        };

        // 对外统一入口：既支持 mode 参数，也兼容 triggerKey 前缀（commit:/preview:）
        fitToCurrentSelection = (triggerKey, mode = 'preview') => {
            const key = String(triggerKey ?? '');
            const explicitCommit = key.startsWith('commit:');
            const explicitPreview = key.startsWith('preview:');
            const cleanKey = key.replace(/^(commit:|preview:)/, '');
            const useCommit = explicitCommit || (!explicitPreview && mode === 'commit');
            if (useCommit) fitToCurrentSelectionCommit(cleanKey);
            else fitToCurrentSelectionPreview(cleanKey);
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
                hideStationPopupForMenuInteraction();
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;
                selectedStationLineIds = null;
                if (source === 'hover') {
                    selectedCompany = companyName;
                    setStationLabelMode('auto');
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
                if (selectedCompany) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`company:${selectedCompany}`);
                    else fitToCurrentSelectionCommit(`company:${selectedCompany}`);
                }
            },
            onLineClick: (lineId, meta) => {
                hideStationPopupForMenuInteraction();
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;

                // 菜单已将“支线 -> 主线”解析并给出 mergedLineIds（主线+支线）。
                // 这里统一以主线作为 selectedLineId，保证底部显示主线名。
                const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                    ? menu.resolveLineSelection(lineId)
                    : null;

                const mainLineId = String(meta?.mainLineId ?? resolved?.mainLineId ?? lineId);
                const merged = Array.isArray(meta?.mergedLineIds)
                    ? meta.mergedLineIds.map(String).filter(Boolean)
                    : (Array.isArray(resolved?.mergedLineIds) ? resolved.mergedLineIds.map(String).filter(Boolean) : [mainLineId]);

                // 线路点击：优先级高于公司点击
                if (source === 'hover') {
                    selectedLineId = mainLineId;
                    selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                    setStationLabelMode('auto');
                } else {
                    selectedLineId = commitPreview
                        ? mainLineId
                        : (selectedLineId === mainLineId ? null : mainLineId);
                }
                if (selectedLineId) selectedCompany = null;
                selectedServiceMode = 'all';

                // 菜单 Branch 合并：点击/提交时同时高亮其归并的支线
                if (source !== 'hover') {
                    selectedStationLineIds = selectedLineId && merged.length > 1 ? new Set(merged) : null;
                }

                // 需求：高亮线路时自动切换为站名全显（仅对 click/commit 生效，避免 hover 预览频繁切换）
                if (source !== 'hover' && selectedLineId) setStationLabelMode('all');
                applyLineSelectionStyle();
                applyStationSelectionStyle();
                if (collisionController) collisionController.scheduleUpdate();
                updateSelectionBadge();
                if (selectedLineId) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`line:${selectedLineId}`);
                    else fitToCurrentSelectionCommit(`line:${selectedLineId}`);
                }
            },
            onModeClick: ({ lineId, mode }, meta) => {
                hideStationPopupForMenuInteraction();
                const source = meta?.source ?? 'click';
                const commitPreview = meta?.commitPreview === true;
                selectedStationLineIds = null;
                // 预留：目前地图高亮/站名过滤仍以 lineId 为主
                if (source === 'hover') {
                    selectedLineId = lineId;
                    selectedServiceMode = mode;
                    setStationLabelMode('auto');
                } else {
                    selectedLineId = commitPreview
                        ? lineId
                        : (selectedLineId === lineId && selectedServiceMode === mode ? null : lineId);
                    selectedServiceMode = mode;
                }
                if (selectedLineId) selectedCompany = null;

                // 需求：高亮线路时自动切换为站名全显（仅对 click/commit 生效）
                if (source !== 'hover' && selectedLineId) setStationLabelMode('all');
                applyLineSelectionStyle();
                applyStationSelectionStyle();
                if (collisionController) collisionController.scheduleUpdate();
                updateSelectionBadge();
                if (selectedLineId) {
                    if (source === 'hover') fitToCurrentSelectionPreview(`mode:${selectedLineId}:${selectedServiceMode}`);
                    else fitToCurrentSelectionCommit(`mode:${selectedLineId}:${selectedServiceMode}`);
                }
            }
        });

        menu.mount(document.body);
        menu.setWrapperStyle();
        window.addEventListener('resize', () => menu.setWrapperStyle());

        // 菜单展开时：用“扣除菜单宽度后的可视区域”重新 fit 当前选中对象
        const refitForMenuOpen = () => {
            if (!selectedCompany && !selectedLineId) return;
            // 用 preview 语义，避免改变“提交态”的选择逻辑
            fitToCurrentSelection('menu-open', 'preview');
        };

        menu.wrapper?.addEventListener('mouseenter', () => {
            refitForMenuOpen();
        });

        menu.wrapper?.addEventListener(
            'pointerdown',
            (evt) => {
                const pt = evt?.pointerType;
                if (pt !== 'touch' && pt !== 'pen') return;

                // 仅在“从收起状态唤起”的那次触摸后 refit
                const leftBefore = parseFloat(getComputedStyle(menu.wrapper).left || '0');
                if (Number.isFinite(leftBefore) && leftBefore < 0) {
                    setTimeout(() => refitForMenuOpen(), 0);
                }
            },
            { passive: true }
        );

        bindClickLineToSelect();

        bindClickBlankToRestore();

        applyLineSelectionStyle();
        applyStationSelectionStyle();
        updateSelectionBadge();
    } catch (e) {
        console.error('线路加载失败，请确保运行了 python -m http.server', e);
    }

    try {
        const stationsData = generatedStationsData || (await loadRailGeoDataFromDataFolder()).stationsGeoJSON;
        addStationsLayer(map, stationsData);

        // 站点圆点点击：高亮该站点所有 serving_lines（不执行 fitBounds）
        bindClickStationToHighlightServingLines();

        // 确保 stations-layer 创建后立即应用一次“选中线路的站点样式策略”
        applyStationSelectionStyle();

        const markers = createStationMarkers(map, maplibregl, stationsData);
        stationLabels = markers.stationLabels;
        const stationCircles = markers.stationCircles;

        // 站名碰撞：标签上移偏移在 labels.js 内按站点类型设置
        collisionController = setupCollisions(map, stationLabels, stationCircles, {
            gridCellPx: 80,
            // 线路联动：只影响站名（圆点仍按碰撞显示）
            getEnabledLineIds: getEnabledLineIdsForLabels,
            // 右上角三段开关：off/auto(碰撞)/all(无视碰撞)
            getLabelMode: () => stationLabelMode,
            // 高亮线路/公司时：圆点全部显示，避免缩小后站点消失
            getCircleMode: () => (
                selectedLineId ||
                selectedCompany ||
                (selectedStationLineIds && selectedStationLineIds.size)
                    ? 'all'
                    : 'collide'
            ),
            getPinnedStationId: () => fixedPopupStationId,
            lineFilterTarget: 'labels'
        });

        collisionController.scheduleUpdate();

        stationPopup = setupStationPopup(map, maplibregl, {
            // 悬浮弹框：用 serving_ids 匹配 lines.geojson 的 meta
            getLineMeta: (lineId) => {
                const id = String(lineId);
                return {
                    company: lineCompanyById.get(id) || null,
                    name: lineNameById.get(id) || id,
                    color: lineColorById.get(id) || null
                };
            },
            companyLogoMap,
            hoverDelayMs: 50,
            onSelectCompany: (companyName, meta) => {
                const source = meta?.source;
                const name = String(companyName ?? '').trim();
                if (!name) return;

                if (source === 'popup-hover') {
                    if (!popupPreviewSnapshot) popupPreviewSnapshot = snapshotSelectionState();
                    popupPreviewWasApplied = true;
                    // 需求调整：hover 公司时，不再显示“公司所有线路”，而是显示“通过该站点且属于该公司的线路”
                    const stationLineIds = Array.isArray(meta?.stationLineIds) ? meta.stationLineIds.map(String).filter(Boolean) : [];
                    const subset = stationLineIds.filter((id) => String(lineCompanyById.get(String(id)) || '') === name);

                    selectedCompany = null;
                    selectedLineId = null;
                    selectedStationLineIds = new Set((subset.length ? subset : stationLineIds).map(String).filter(Boolean));
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                if (source === 'popup-click') {
                    // 修复：点击 popup 公司时，只高亮“通过该站点且属于该公司”的线路集合
                    popupPreviewSnapshot = null;
                    popupPreviewWasApplied = false;

                    const stationLineIds = Array.isArray(meta?.stationLineIds)
                        ? meta.stationLineIds.map(String).filter(Boolean)
                        : [];
                    const subset = stationLineIds.filter((id) => String(lineCompanyById.get(String(id)) || '') === name);

                    selectedCompany = null;
                    selectedLineId = null;
                    selectedStationLineIds = new Set((subset.length ? subset : stationLineIds).map(String).filter(Boolean));
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                // 其它来源（例如菜单 click）：保持原逻辑，高亮该公司所有线路
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                selectedCompany = name;
                selectedLineId = null;
                selectedStationLineIds = null;
                selectedServiceMode = 'all';
                isolateStationsToSelectedLine = false;
                applySelectionEffects();
            },
            onSelectLine: (lineId, meta) => {
                const source = meta?.source;
                const id = String(lineId ?? '').trim();
                if (!id) return;

                const resolved = (menu && typeof menu.resolveLineSelection === 'function')
                    ? menu.resolveLineSelection(id)
                    : null;
                const mainLineId = String(resolved?.mainLineId ?? id);
                const merged = Array.isArray(resolved?.mergedLineIds)
                    ? resolved.mergedLineIds.map(String).filter(Boolean)
                    : [mainLineId];

                if (source === 'popup-hover') {
                    if (!popupPreviewSnapshot) popupPreviewSnapshot = snapshotSelectionState();
                    popupPreviewWasApplied = true;
                    selectedLineId = mainLineId;
                    selectedCompany = null;
                    selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                    selectedServiceMode = 'all';
                    isolateStationsToSelectedLine = false;
                    setStationLabelMode('auto');
                    applySelectionEffects();
                    return;
                }

                // popup click：提交高亮（同“点击线路”效果），但不执行 fitBounds
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                selectedLineId = mainLineId;
                selectedCompany = null;
                selectedStationLineIds = merged.length > 1 ? new Set(merged) : null;
                selectedServiceMode = 'all';
                setStationLabelMode('all');
                isolateStationsToSelectedLine = meta?.isolateStations === true;

                // 同步菜单高亮（若菜单存在）
                if (menu && typeof menu.markActive === 'function') {
                    const el = menu.wrapper?.querySelector(`.RW-line-content[data-line-id="${cssEscape(selectedLineId)}"]`);
                    if (el) menu.markActive(el);
                }

                applySelectionEffects();
            },
            onRestoreStationLines: (lineIds) => {
                // popup 内 hover 预览离开：恢复为“该站点所有线路”
                selectedLineId = null;
                selectedCompany = null;
                isolateStationsToSelectedLine = false;
                selectedServiceMode = 'all';

                if (Array.isArray(lineIds) && lineIds.length) {
                    selectedStationLineIds = new Set(lineIds.map(String).filter(Boolean));
                }

                applySelectionEffects();
            },
            onFixedPopupBlankClick: () => {
                // 固定 popup：点击空白处直接恢复“全显示”，且不触发预览快照回滚
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                clearSelectionsAndRestore();
            },
            onPopupClose: ({ committed }) => {
                if (!committed && popupPreviewSnapshot && popupPreviewWasApplied) {
                    restoreSelectionState(popupPreviewSnapshot);
                }
                popupPreviewSnapshot = null;
                popupPreviewWasApplied = false;
                setFixedPopupStationLabelBelow(null);
            }
        });

        // search.js bridge：stations/popup 已可用
        try {
            if (window.TokyoRailSearchMapActions) {
                window.TokyoRailSearchMapActions.isReady = true;
            }
        } catch {
            // ignore
        }

        // 站名标签：鼠标点击/触屏点击也弹出 popup（等同 hover 站点圆点）
        if (stationPopup && typeof stationPopup.showPopupAt === 'function') {
            const isTouchLike = (pt) => pt === 'touch' || pt === 'pen';
            const readPointerType = (evt) => {
                const pt = evt?.pointerType;
                if (pt) return pt;
                const t = evt?.type;
                if (t && String(t).startsWith('touch')) return 'touch';
                return 'mouse';
            };
            const stop = (evt) => {
                evt?.preventDefault?.();
                evt?.stopPropagation?.();
            };

            const fireStationLabelTap = (item, pt) => {
                setFixedPopupStationLabelBelow(item.props?.id ?? item.stationId);
                selectServingLinesForStation(item.props || {});
                stationPopup.setExternalStationHover?.(true);
                stationPopup.showPopupAt(item.coordinates, item.props || {}, { pointerType: pt });

                // 打开右侧界面 A
                panel?.showForStationProps?.(item.props || {});
            };

            stationLabels.forEach((item) => {
                const el = item?.el;
                if (!el) return;

                // 用于 popup 自动隐藏的“是否在站点上方”判断
                el.addEventListener('mouseenter', () => stationPopup.setExternalStationHover?.(true));
                el.addEventListener('mouseleave', () => stationPopup.setExternalStationHover?.(false));

                // 触屏/笔：按下时只阻止穿透；抬起时满足“短按+小位移”才触发
                el.addEventListener(
                    'pointerdown',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stop(evt);
                    },
                    { passive: false }
                );

                el.addEventListener(
                    'pointerup',
                    (evt) => {
                        const pt = readPointerType(evt);
                        if (!isTouchLike(pt)) return;
                        stop(evt);
                        if (!touchTapGuard.allowTap(evt)) return;
                        fireStationLabelTap(item, pt);
                    },
                    { passive: false }
                );

                // 鼠标：click 弹出 popup
                el.addEventListener('click', (evt) => {
                    const pt = readPointerType(evt);
                    if (isTouchLike(pt)) {
                        stop(evt);
                        return;
                    }
                    stop(evt);
                    fireStationLabelTap(item, pt);
                });
            });
        }
    } catch (e) {
        console.error('站点加载失败', e);
    }
});
