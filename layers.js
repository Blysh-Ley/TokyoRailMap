/**
 * 添加线路图层。
 */
import { getGlobalTouchTapGuard } from './touchTapGuard.js';

export function addLinesLayer(map, linesData) {
    map.addSource('lines-source', { type: 'geojson', data: linesData });

    map.addLayer({
        id: 'lines-layer',
        type: 'line',
        source: 'lines-source',
        filter: ['!=', ['get', 'hidden_by_opacity_zero'], 1],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-width': 3, //线宽
            'line-color': ['coalesce', ['get', 'color'], '#555']
        }
    });
}

/**
 * 添加站点圆点图层。
 * - 换乘站：随缩放变化，最大半径 4
 * - 非换乘站：更小的白点（描边为 0）
 */
export function addStationsLayer(map, stationsData) {
    map.addSource('stations-source', { type: 'geojson', data: stationsData });

    const servingIdsExpr = ['coalesce', ['get', 'serving_ids'], ['get', 'serving_lines']];

    map.addLayer({
        id: 'stations-layer',
        type: 'circle',
        source: 'stations-source',
        filter: ['!=', ['get', 'hidden_by_opacity_zero'], 1],
        paint: {
            // 随缩放等级变化：最大 4，缩小时线性变小
            // 注意：MapLibre 里 zoom 表达式只能作为顶层 step/interpolate 的输入
            'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],

                // zoom = 6
                6, [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    0.5,
                    0.5
                ],

                // zoom = 14
                14, [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    3.5,
                    4
                ],

                // zoom = 22
                22, [
                    'case',
                    ['==', ['length', servingIdsExpr], 1],
                    3.5,
                    4
                ]
            ],
            'circle-color': '#fff',
            'circle-stroke-width': [
                'case',
                ['==', ['length', servingIdsExpr], 1],
                2,
                2
            ],
            'circle-stroke-color': '#333'
        }
    });
}

/**
 * 给站点圆点添加 hover 弹窗。
 */
export function setupStationPopup(map, maplibregl, options = {}) {
    const touchTapGuard = getGlobalTouchTapGuard({ maxDurationMs: 500, maxMovePx: 12 });

    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    const companyLogoMap = options.companyLogoMap || {};
    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 500;
    const hoverMinZoom = Number.isFinite(options.hoverMinZoom) ? options.hoverMinZoom : 11;
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onPopupClose = typeof options.onPopupClose === 'function' ? options.onPopupClose : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;
    const onFixedPopupBlankClick = typeof options.onFixedPopupBlankClick === 'function' ? options.onFixedPopupBlankClick : null;

    let stationsIndexPromise = null;
    const getStationsIndex = async () => {
        if (stationsIndexPromise) return stationsIndexPromise;
        stationsIndexPromise = (async () => {
            try {
                const resp = await fetch('./data/stations.json');
                if (!resp.ok) return { idToNameZh: new Map() };
                const list = await resp.json();
                const idToNameZh = new Map();
                for (const s of Array.isArray(list) ? list : []) {
                    const id = String(s?.id ?? '').trim();
                    if (!id) continue;
                    const t = s?.title || {};
                    const name = String(t['zh-Hans'] || t.zh || t.ja || t.en || '').trim();
                    if (name) idToNameZh.set(id, name);
                }
                return { idToNameZh };
            } catch {
                return { idToNameZh: new Map() };
            }
        })();
        return stationsIndexPromise;
    };

    let stationGroupsIndexPromise = null;
    const getStationGroupsIndex = async () => {
        if (stationGroupsIndexPromise) return stationGroupsIndexPromise;
        stationGroupsIndexPromise = (async () => {
            try {
                const resp = await fetch('./data/station-groups.json');
                if (!resp.ok) return new Map();
                const groups = await resp.json();
                const map = new Map();
                for (const g of Array.isArray(groups) ? groups : []) {
                    if (!Array.isArray(g)) continue;
                    const ids = [];
                    const seen = new Set();
                    for (const chunk of g) {
                        if (!Array.isArray(chunk)) continue;
                        for (const sid of chunk) {
                            const id = String(sid ?? '').trim();
                            if (!id || seen.has(id)) continue;
                            seen.add(id);
                            ids.push(id);
                        }
                    }
                    if (!ids.length) continue;
                    for (const id of ids) map.set(id, ids);
                }
                return map;
            } catch {
                return new Map();
            }
        })();
        return stationGroupsIndexPromise;
    };

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    // 触屏适配：单击站点 = hover（只显示 popup），避免触屏触发 hover 预览导致“直接选中线路”
    let lastPointerType = 'mouse';
    let suppressMouseEventsUntilMs = 0;
    const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
    const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';
    const readPointerType = (evt) => {
        const pt = evt?.pointerType;
        if (pt) return pt;
        const t = evt?.type;
        if (t && String(t).startsWith('touch')) return 'touch';
        return 'mouse';
    };

    const canvas = map.getCanvas?.();
    if (canvas && canvas.addEventListener) {
        canvas.addEventListener(
            'pointerdown',
            (evt) => {
                lastPointerType = readPointerType(evt);
                if (isTouchLikePointer(lastPointerType)) {
                    suppressMouseEventsUntilMs = nowMs() + 800;
                }
            },
            { passive: true }
        );
    }

    let isOverStation = false;
    let isOverPopup = false;
    let hideTimerId = null;
    let boundPopupEl = null;
    let committedInPopup = false;

    // popup 打开模式：
    // - hover：鼠标悬浮站点弹出（只读，禁止交互），离开站点/弹框后自动关闭
    // - fixed：鼠标/触屏点击站点弹出（可交互），固定在地图上，点击空白处才关闭
    let popupOpenMode = null; // 'hover' | 'fixed' | null

    // 触屏：固定 popup 内两段式点击（第一次 = 预览；第二次同一线路 = 提交并关闭）
    let tapArmedKey = null;

    // 当前 popup 所属站点的 serving_ids（用于离开单条线路 hover 时恢复）
    let currentStationServingIds = [];

    // 当前已应用的 hover 预览对象（line:/company:）
    let lastAppliedHoverKey = null;

    // 线路 hover 预览离开后的“恢复站点线路”延迟（避免在两条线路之间移动时闪烁）
    let restoreTimerId = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeout(restoreTimerId);
            restoreTimerId = null;
        }
    };

    let hoverTimerId = null;
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeout(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearHideTimer = () => {
        if (hideTimerId != null) {
            clearTimeout(hideTimerId);
            hideTimerId = null;
        }
    };

    const unbindPopupEl = () => {
        if (!boundPopupEl) return;
        boundPopupEl.removeEventListener('mouseenter', onPopupEnter);
        boundPopupEl.removeEventListener('mouseleave', onPopupLeave);
        boundPopupEl.removeEventListener('mousemove', onPopupMove);
        boundPopupEl.removeEventListener('click', onPopupClick);
        boundPopupEl.removeEventListener('pointerdown', onPopupPointerDown);
        boundPopupEl.removeEventListener('mousedown', stopPropagation);
        boundPopupEl.removeEventListener('wheel', stopPropagation);
        boundPopupEl = null;
    };

    const restoreStationLinesIfNeeded = () => {
        if (popupOpenMode !== 'fixed') return;
        if (!lastAppliedHoverKey) return;
        if (typeof onRestoreStationLines !== 'function') {
            lastAppliedHoverKey = null;
            return;
        }

        try {
            onRestoreStationLines(Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []);
        } catch {
            // ignore
        }
        lastAppliedHoverKey = null;
    };

    const scheduleRestoreStationLines = () => {
        if (popupOpenMode !== 'fixed') return;
        if (!lastAppliedHoverKey) return;
        if (typeof onRestoreStationLines !== 'function') {
            lastAppliedHoverKey = null;
            return;
        }

        clearRestoreTimer();
        restoreTimerId = setTimeout(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const removePopupNow = ({ committed } = {}) => {
        clearHideTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        popupOpenMode = null;
        currentStationServingIds = [];
        lastAppliedHoverKey = null;

        popup.remove();

        if (typeof onPopupClose === 'function') {
            try {
                onPopupClose({ committed: committed === true });
            } catch {
                // ignore
            }
        }

        unbindPopupEl();
    };

    const tryHidePopup = () => {
        if (popupOpenMode !== 'hover') return;
        clearHideTimer();
        // 需求调整：hover popup 不应因鼠标移入 popup 而保持；只要移出站点就隐藏
        hideTimerId = setTimeout(() => {
            hideTimerId = null;
            if (!isOverStation) {
                removePopupNow({ committed: committedInPopup });
            }
        }, 50);
    };

    const onPopupEnter = () => {
        // hover 打开的弹框：移入 popup 不应阻止隐藏
        if (popupOpenMode === 'hover') return;
        isOverPopup = true;
        clearHideTimer();
        clearRestoreTimer();
    };

    const onPopupLeave = () => {
        isOverPopup = false;
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        restoreStationLinesIfNeeded();
        if (popupOpenMode === 'hover') tryHidePopup();
    };

    const stopPropagation = (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    };

    const onPopupPointerDown = (evt) => {
        const pt = readPointerType(evt);
        if (!isTouchLikePointer(pt)) return;

        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') {
            stopPropagation(evt);
            return;
        }

        lastPointerType = pt;
        suppressMouseEventsUntilMs = nowMs() + 800;

        const t = getInteractiveTarget(evt);
        if (!t) {
            // 仍然要阻止事件穿透到地图（避免拖拽/缩放）
            stopPropagation(evt);
            return;
        }

        stopPropagation(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        // 触屏：线路需要双击提交
        if (t.kind === 'line') {
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                committedInPopup = false;
                // 第一次：当作预览
                if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-hover' });
                return;
            }

            // 第二次：提交并关闭
            tapArmedKey = null;
            committedInPopup = true;
            if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-click', isolateStations: true });
            removePopupNow({ committed: true });
            return;
        }

        // 公司：单击提交（不关闭）
        tapArmedKey = null;
        committedInPopup = true;
        if (t.kind === 'company') {
            if (typeof onSelectCompany === 'function') {
                onSelectCompany(String(t.value), {
                    source: 'popup-click',
                    stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
                });
            }
            // 需求：点击公司后也关闭 popup
            removePopupNow({ committed: true });
        }
    };

    const getInteractiveTarget = (evt) => {
        const target = evt?.target;
        if (!target || !boundPopupEl) return null;

        const lineEl = target.closest?.('[data-line-id]');
        if (lineEl && boundPopupEl.contains(lineEl)) {
            const lineId = lineEl.getAttribute('data-line-id');
            return lineId ? { kind: 'line', value: String(lineId) } : null;
        }

        const companyEl = target.closest?.('[data-company]');
        if (companyEl && boundPopupEl.contains(companyEl)) {
            const company = companyEl.getAttribute('data-company');
            return company ? { kind: 'company', value: String(company) } : null;
        }

        return null;
    };

    const onPopupMove = (evt) => {
        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') return;

        // 触屏：不做 hover 预览（避免手指抬起时的合成 mousemove 导致“自动选中线路”）
        if (isTouchLikePointer(lastPointerType)) return;

        const t = getInteractiveTarget(evt);
        if (!t) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        // 两条线路之间移动时，鼠标可能短暂落在容器上：这里用延迟恢复避免闪烁
        if (t.kind !== 'line' && t.kind !== 'company') {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        // 进入其他类型元素后再回来时，允许重新触发 hover
        if (lastFiredHoverKey && !String(lastFiredHoverKey).startsWith(`${t.kind}:`)) {
            lastFiredHoverKey = null;
        }

        // 进入可交互元素：取消待恢复
        clearRestoreTimer();

        const key = `${t.kind}:${t.value}`;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;

        if (key === lastFiredHoverKey) return;

        hoverTimerId = setTimeout(() => {
            hoverTimerId = null;
            if (!boundPopupEl || !isOverPopup) return;
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (t.kind === 'line' && typeof onSelectLine === 'function') {
                onSelectLine(String(t.value), { source: 'popup-hover' });
                lastAppliedHoverKey = `line:${String(t.value)}`;
            } else if (t.kind === 'company' && typeof onSelectCompany === 'function') {
                onSelectCompany(String(t.value), { source: 'popup-hover', stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [] });
                lastAppliedHoverKey = `company:${String(t.value)}`;
            }
        }, hoverDelayMs);
    };

    const onPopupClick = (evt) => {
        // hover 打开的弹框：禁止交互
        if (popupOpenMode !== 'fixed') {
            // 仍然阻止事件穿透到地图，避免点击弹框文本触发“点击空白处”逻辑
            stopPropagation(evt);
            return;
        }

        // 触屏/笔：由 pointerdown 完整接管两段式交互；忽略 click，避免第一下就被当成“第二下提交”
        if (isTouchLikePointer(lastPointerType)) {
            stopPropagation(evt);
            return;
        }

        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopPropagation(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        committedInPopup = true;

        if (t.kind === 'line') {
            if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-click', isolateStations: true });
            // 需求：点击弹出的 popup 中，鼠标单击线路后关闭 popup
            removePopupNow({ committed: true });
            return;
        }

        if (t.kind === 'company' && typeof onSelectCompany === 'function') {
            onSelectCompany(String(t.value), {
                source: 'popup-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
            // 需求：点击公司后也关闭 popup
            removePopupNow({ committed: true });
        }
    };

    const bindPopupHover = () => {
        const el = popup.getElement?.();
        if (!el || el === boundPopupEl) return;

        unbindPopupEl();

        boundPopupEl = el;
        boundPopupEl.addEventListener('mouseenter', onPopupEnter);
        boundPopupEl.addEventListener('mouseleave', onPopupLeave);
        boundPopupEl.addEventListener('mousemove', onPopupMove);
        boundPopupEl.addEventListener('click', onPopupClick);
        boundPopupEl.addEventListener('pointerdown', onPopupPointerDown, { passive: false });
        boundPopupEl.addEventListener('mousedown', stopPropagation);
        boundPopupEl.addEventListener('wheel', stopPropagation, { passive: false });
    };

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildPopupHtml = async (props = {}, meta = {}) => {
        const name = props.name_zh || props.name || '';
        const interactive = meta?.interactive === true;
        const normalizeArrayLike = (value) => {
            if (Array.isArray(value)) return value;
            if (typeof value !== 'string') return value ? [value] : [];

            const s = value.trim();
            // 兼容：某些数据源会把数组写成 JSON 字符串（例如 "[\"A\",\"B\"]"）
            if (s.startsWith('[') && s.endsWith(']')) {
                try {
                    const parsed = JSON.parse(s);
                    return Array.isArray(parsed) ? parsed : [value];
                } catch {
                    return [value];
                }
            }
            return s ? [s] : [];
        };

        const servingIdsRaw = normalizeArrayLike(props.serving_ids);
        const servingIds = servingIdsRaw.map(String).filter(Boolean);

        const stationId = String(props?.id ?? '').trim();
        const currentStationNameZh = String(props?.name_zh || props?.['name:zh'] || name || '').trim();
        const platformLineIdsRaw = normalizeArrayLike(props?.platform_line_id);
        const currentPlatformLineId = String(platformLineIdsRaw?.[0] ?? '').trim();

        const lineStationNameByLineId = new Map();
        if (stationId) {
            try {
                const [groupsIndex, stationsIndex] = await Promise.all([getStationGroupsIndex(), getStationsIndex()]);
                const groupIds = groupsIndex.get(stationId) || [stationId];
                for (const lineIdRaw of servingIds) {
                    const lineId = String(lineIdRaw ?? '').trim();
                    if (!lineId) continue;
                    const candidateId = groupIds.find((sid) => {
                        const id = String(sid ?? '').trim();
                        return id && (id === lineId || id.startsWith(`${lineId}.`));
                    });
                    if (!candidateId) continue;
                    const n = String(stationsIndex?.idToNameZh?.get?.(candidateId) || '').trim();
                    if (n) lineStationNameByLineId.set(lineId, n);
                }
            } catch {
                // ignore
            }
        }

        currentStationServingIds = servingIds.slice();

        const servingLinesRaw = normalizeArrayLike(props.serving_lines);
        const servingLines = servingLinesRaw.map(String).filter(Boolean);

        const nameHtml = `<div class="station-hover-name">${escapeHtml(name)}</div>`;

        const rootClass = interactive ? 'station-hover-popup is-interactive' : 'station-hover-popup';

        if (!servingIds.length && !servingLines.length) {
            return `<div class="${rootClass}">${nameHtml}</div>`;
        }

        // 需求：
        // 1) 用 serving_ids 匹配 lines.geojson 里的 company/name/color
        // 2) 按 company 分组显示，公司单独一行（含 logo）
        // 3) abb 从 companyLogoMap 取，缺失则用公司全名
        // 4) 线路名去掉 abb（除非仅由 abb+线/本线/新线 构成）

        const groups = new Map(); // company -> [{ lineId, displayName, color }]
        const seenLineIds = new Set();

        // 以 serving_ids 为准：company/name/color 都来自 lines.geojson，避免 serving_lines 与 serving_ids 不对齐
        for (const lineId of servingIds) {
            const id = String(lineId);
            if (!id || seenLineIds.has(id)) continue;
            seenLineIds.add(id);

            const meta = getLineMeta(id);
            const company = (meta?.company ? String(meta.company) : '未知公司').trim() || '未知公司';
            const color = meta?.color || null;
            const abb = companyLogoMap?.[company]?.abb || company;

            // 显示名：优先用 meta.name（更可靠），serving_lines 仅作兜底
            let displayName = String(meta?.name || '').trim();
            if (!displayName) {
                // 尝试从 serving_lines 找一个包含 abb 的名称，否则取第一个
                displayName = servingLines.find((s) => typeof s === 'string' && s.includes(abb)) || servingLines[0] || id;
                displayName = String(displayName).trim();
            }

            const isSpecial = (displayName === `${abb}线` || displayName === `${abb}本线` || displayName === `${abb}新线`);
            if (!isSpecial && abb) displayName = displayName.replace(abb, '').trim();

            if (!groups.has(company)) groups.set(company, []);
            groups.get(company).push({ lineId: id, displayName, color });
        }

        // 如果没有 serving_ids（或全部无法解析），回退：按 serving_lines 显示，但无法可靠分公司/颜色
        if (!groups.size && servingLines.length) {
            const company = '未知公司';
            const lines = servingLines.map((s) => ({ displayName: String(s).trim(), color: null }));
            groups.set(company, lines);
        }

        let companiesHtml = '';
        for (const [company, lines] of groups) {
            const companyZh = companyLogoMap?.[company]?.zh || null;
            const companyDisplay = String(companyZh || company);

            const logoFile = companyLogoMap?.[company]?.img?.[0] || null;
            const logoBase = (() => {
                try {
                    return window.TokyoRailCompanyLogoBasePath || './companyLogos/';
                } catch {
                    return './companyLogos/';
                }
            })();
            const logoSrc = logoFile
                ? (String(logoBase).endsWith('/') ? `${logoBase}${logoFile}` : `${logoBase}/${logoFile}`)
                : null;
            const logoHtml = logoSrc
                ? `<img class="station-hover-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
                : '';

            let linesHtml = '';
            for (const line of lines) {
                const style = (typeof line.color === 'string' && line.color.trim())
                    ? ` style="color:${escapeHtml(line.color.trim())}"`
                    : '';
                const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';
                const lineId = String(line.lineId ?? '').trim();
                const isTransferStation = servingIds.length > 1;
                const isCurrentLine = !!lineId && !!currentPlatformLineId && lineId === currentPlatformLineId;
                const transferStationName = String(lineStationNameByLineId.get(lineId) || '').trim();
                const showTransferNameSuffix = !!transferStationName && !!currentStationNameZh && transferStationName !== currentStationNameZh;

                const suffixParts = [];
                if (isTransferStation && isCurrentLine) {
                    suffixParts.push('（当前）');
                }
                if (showTransferNameSuffix) {
                    suffixParts.push(`（${transferStationName}站）`);
                }
                const suffixHtml = suffixParts.length
                    ? `<span class="station-hover-line-suffix">${escapeHtml(suffixParts.join(''))}</span>`
                    : '';

                linesHtml += `<div class="station-hover-line"${idAttr}${style}>${escapeHtml(line.displayName)}${suffixHtml}</div>`;
            }

            companiesHtml += `
                <div class="station-hover-company">
                    <div class="station-hover-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="station-hover-company-name">${escapeHtml(companyDisplay)}</span></div>
                    <div class="station-hover-company-lines">${linesHtml}</div>
                </div>
            `;
        }

        return `<div class="${rootClass}">${nameHtml}${companiesHtml}</div>`;
    };

    map.on('mouseenter', 'stations-layer', async (e) => {
        // 触屏会产生合成 mouseenter：这里直接忽略，改用 click 来显示 popup
        if (nowMs() < suppressMouseEventsUntilMs || isTouchLikePointer(lastPointerType)) return;

        // 固定弹框存在时，不响应 hover
        if (popupOpenMode === 'fixed') return;

        // 缩放过小：禁用“鼠标 hover 站点弹窗”
        const z = typeof map.getZoom === 'function' ? map.getZoom() : null;
        if (typeof z === 'number' && z < hoverMinZoom) {
            map.getCanvas().style.cursor = '';
            return;
        }

        map.getCanvas().style.cursor = 'pointer';
        isOverStation = true;
        clearHideTimer();
        committedInPopup = false;
        popupOpenMode = 'hover';
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties || {};
        const html = await buildPopupHtml(props, { interactive: false });
        popup.setLngLat(coordinates).setHTML(html).addTo(map);
        bindPopupHover();
    });

    map.on('mouseleave', 'stations-layer', () => {
        if (nowMs() < suppressMouseEventsUntilMs || isTouchLikePointer(lastPointerType)) return;
        map.getCanvas().style.cursor = '';
        isOverStation = false;
        if (popupOpenMode === 'hover') tryHidePopup();
    });

    // 点击站点/空白处不再打开/固定 popup：交互迁移到右侧 panel。

    // 外部触发（例如：站名 DOM 标签点击）
    const showPopupAt = async (coordinates, props = {}, meta = {}) => {
        if (!coordinates) return;

        const pt = meta?.pointerType;
        if (pt) {
            lastPointerType = String(pt);
            if (isTouchLikePointer(lastPointerType)) {
                suppressMouseEventsUntilMs = nowMs() + 800;
            }
        }

        popupOpenMode = 'fixed';
        committedInPopup = false;
        clearHideTimer();
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const html = await buildPopupHtml(props, { interactive: true });
        popup.setLngLat(coordinates).setHTML(html).addTo(map);
        bindPopupHover();
    };

    const setExternalStationHover = (over) => {
        if (popupOpenMode !== 'hover') return;
        isOverStation = over === true;
        if (isOverStation) {
            clearHideTimer();
            return;
        }
        tryHidePopup();
    };

    return {
        showPopupAt,
        setExternalStationHover,
        getOpenMode: () => popupOpenMode,
        closePopup: ({ committed } = {}) => {
            // 用于：外部 UI（例如菜单）切换选择时，关闭固定 popup 并清理其内部选中/预览状态。
            removePopupNow({ committed: committed !== false });
        }
    };
}
