/**
 * 添加线路图层。
 */
export function addLinesLayer(map, linesData) {
    map.addSource('lines-source', { type: 'geojson', data: linesData });

    map.addLayer({
        id: 'lines-layer',
        type: 'line',
        source: 'lines-source',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-width': 3,
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
    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    const companyLogoMap = options.companyLogoMap || {};
    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 500;
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onPopupClose = typeof options.onPopupClose === 'function' ? options.onPopupClose : null;

    const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false
    });

    let isOverStation = false;
    let isOverPopup = false;
    let hideTimerId = null;
    let boundPopupEl = null;
    let committedInPopup = false;

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
        boundPopupEl.removeEventListener('mousedown', stopPropagation);
        boundPopupEl.removeEventListener('touchstart', stopPropagation);
        boundPopupEl.removeEventListener('wheel', stopPropagation);
        boundPopupEl = null;
    };

    const removePopupNow = ({ committed } = {}) => {
        clearHideTimer();
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

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
        clearHideTimer();
        // 给一点点缓冲，避免从圆点移到 popup 时闪一下
        hideTimerId = setTimeout(() => {
            hideTimerId = null;
            if (!isOverStation && !isOverPopup) {
                removePopupNow({ committed: committedInPopup });
            }
        }, 50);
    };

    const onPopupEnter = () => {
        isOverPopup = true;
        clearHideTimer();
    };

    const onPopupLeave = () => {
        isOverPopup = false;
        clearHoverTimer();
        hoverCandidateKey = null;
        tryHidePopup();
    };

    const stopPropagation = (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
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
        const t = getInteractiveTarget(evt);
        if (!t) {
            clearHoverTimer();
            hoverCandidateKey = null;
            return;
        }

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
            } else if (t.kind === 'company' && typeof onSelectCompany === 'function') {
                onSelectCompany(String(t.value), { source: 'popup-hover' });
            }
        }, hoverDelayMs);
    };

    const onPopupClick = (evt) => {
        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopPropagation(evt);
        committedInPopup = true;
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        if (t.kind === 'line') {
            if (typeof onSelectLine === 'function') onSelectLine(String(t.value), { source: 'popup-click' });
            // 需求：点击线路后隐藏 popup
            removePopupNow({ committed: true });
            return;
        }

        if (t.kind === 'company' && typeof onSelectCompany === 'function') {
            onSelectCompany(String(t.value), { source: 'popup-click' });
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
        boundPopupEl.addEventListener('mousedown', stopPropagation);
        boundPopupEl.addEventListener('touchstart', stopPropagation, { passive: false });
        boundPopupEl.addEventListener('wheel', stopPropagation, { passive: false });
    };

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildPopupHtml = (props = {}) => {
        const name = props.name_zh || props.name || '';
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

        const servingLinesRaw = normalizeArrayLike(props.serving_lines);
        const servingLines = servingLinesRaw.map(String).filter(Boolean);

        const nameHtml = `<div class="station-hover-name">${escapeHtml(name)}</div>`;

        if (!servingIds.length && !servingLines.length) {
            return `<div class="station-hover-popup">${nameHtml}</div>`;
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
            const logoFile = companyLogoMap?.[company]?.img?.[0] || null;
            const logoHtml = logoFile
                ? `<img class="station-hover-company-logo" src="/companyLogos/${escapeHtml(logoFile)}" alt="" />`
                : '';

            let linesHtml = '';
            for (const line of lines) {
                const style = (typeof line.color === 'string' && line.color.trim())
                    ? ` style="color:${escapeHtml(line.color.trim())}"`
                    : '';
                const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';
                linesHtml += `<div class="station-hover-line"${idAttr}${style}>${escapeHtml(line.displayName)}</div>`;
            }

            companiesHtml += `
                <div class="station-hover-company">
                    <div class="station-hover-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="station-hover-company-name">${escapeHtml(company)}</span></div>
                    <div class="station-hover-company-lines">${linesHtml}</div>
                </div>
            `;
        }

        return `<div class="station-hover-popup">${nameHtml}${companiesHtml}</div>`;
    };

    map.on('mouseenter', 'stations-layer', (e) => {
        map.getCanvas().style.cursor = 'pointer';
        isOverStation = true;
        clearHideTimer();
        committedInPopup = false;
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        const coordinates = e.features[0].geometry.coordinates.slice();
        const props = e.features[0].properties || {};
        popup.setLngLat(coordinates).setHTML(buildPopupHtml(props)).addTo(map);
        bindPopupHover();
    });

    map.on('mouseleave', 'stations-layer', () => {
        map.getCanvas().style.cursor = '';
        isOverStation = false;
        tryHidePopup();
    });
}
