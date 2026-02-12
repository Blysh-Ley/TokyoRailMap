/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；尽量复用 index.html 中 search-results 的视觉样式。
 */

const toText = (v) => String(v ?? '').trim();

const nowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

const isTouchLikePointer = (pt) => pt === 'touch' || pt === 'pen';

const readPointerType = (evt) => {
    const pt = evt?.pointerType;
    if (pt) return String(pt);
    const t = evt?.type;
    if (t && String(t).startsWith('touch')) return 'touch';
    return 'mouse';
};

function readStationName(props) {
    const p = props || {};
    return toText(p.name_zh || p['name:zh'] || p.name || p.name_ja || p['name:ja'] || '');
}

function stopEvent(evt) {
    evt?.preventDefault?.();
    evt?.stopPropagation?.();
}

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const normalizeArrayLike = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value ? [value] : [];

    const s = value.trim();
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

function buildCompaniesHtml(props = {}, { getLineMeta, companyLogoMap } = {}) {
    const servingIdsRaw = normalizeArrayLike(props.serving_ids);
    const servingIds = servingIdsRaw.map(String).filter(Boolean);
    const servingLinesRaw = normalizeArrayLike(props.serving_lines);
    const servingLines = servingLinesRaw.map(String).filter(Boolean);

    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const logoMap = companyLogoMap || {};

    const groups = new Map(); // company -> [{ lineId, displayName, color }]
    const seenLineIds = new Set();

    for (const lineId of servingIds) {
        const id = String(lineId);
        if (!id || seenLineIds.has(id)) continue;
        seenLineIds.add(id);

        const meta = safeGetLineMeta(id);
        const company = (meta?.company ? String(meta.company) : '未知公司').trim() || '未知公司';
        const color = meta?.color || null;
        const abb = logoMap?.[company]?.abb || company;

        let displayName = String(meta?.name || '').trim();
        if (!displayName) {
            displayName = servingLines.find((s) => typeof s === 'string' && s.includes(abb)) || servingLines[0] || id;
            displayName = String(displayName).trim();
        }

        const isSpecial = displayName === `${abb}线` || displayName === `${abb}本线` || displayName === `${abb}新线`;
        if (!isSpecial && abb) displayName = displayName.replace(abb, '').trim();

        if (!groups.has(company)) groups.set(company, []);
        groups.get(company).push({ lineId: id, displayName, color });
    }

    if (!groups.size && servingLines.length) {
        const company = '未知公司';
        const lines = servingLines.map((s) => ({ displayName: String(s).trim(), color: null }));
        groups.set(company, lines);
    }

    let companiesHtml = '';
    for (const [company, lines] of groups) {
        const companyZh = logoMap?.[company]?.zh || null;
        const companyDisplay = String(companyZh || company);

        const logoFile = logoMap?.[company]?.img?.[0] || null;
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
            const style = typeof line.color === 'string' && line.color.trim() ? ` style="color:${escapeHtml(line.color.trim())}"` : '';
            const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';
            linesHtml += `<div class="station-hover-line"${idAttr}${style}>${escapeHtml(line.displayName)}</div>`;
        }

        companiesHtml += `
            <div class="station-hover-company">
                <div class="station-hover-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="station-hover-company-name">${escapeHtml(companyDisplay)}</span></div>
                <div class="station-hover-company-lines">${linesHtml}</div>
            </div>
        `;
    }

    return `<div class="station-hover-popup is-interactive">${companiesHtml}</div>`;
}

export function createPanel(options = {}) {
    const widthPx = Number.isFinite(options.widthPx) ? options.widthPx : 320;
    const rightPx = Number.isFinite(options.rightPx) ? options.rightPx : 20;
    const zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 9999;

    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 50;
    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    const companyLogoMap = options.companyLogoMap || {};
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;

    const root = document.createElement('div');
    root.setAttribute('data-panel-root', '');
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = String(zIndex);
    root.style.width = `${widthPx}px`;
    root.style.maxWidth = 'calc(100vw - 20px)';

    // 从右侧滑入/滑出
    root.style.transform = 'translateX(calc(100% + 24px))';
    root.style.transition = 'transform 0.2s ease';

    // 面板主体：复用 search-results 的圆角/边框/阴影等
    const panel = document.createElement('div');
    panel.className = 'search-results';
    panel.style.marginTop = '0';
    panel.style.maxHeight = 'none';
    panel.style.height = '100%';
    panel.style.opacity = '1';
    panel.style.overflow = 'hidden';
    panel.style.display = 'flex';
    panel.style.flexDirection = 'column';

    // 标题栏
    const header = document.createElement('div');
    header.setAttribute('data-panel-header', '');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'flex-start';
    header.style.gap = '8px';
    header.style.padding = '10px 12px';
    header.style.borderBottom = '1px solid #e3e5e7';

    const title = document.createElement('div');
    title.setAttribute('data-panel-title', '');
    title.style.fontSize = '30px';
    title.style.lineHeight = '1.2';
    title.style.fontWeight = '700';
    title.style.color = '#111';
    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    header.appendChild(title);

    // 内容区：承载 popup 同结构的公司/线路列表
    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'search-results-list';
    body.style.flex = '1 1 auto';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';

    panel.appendChild(header);
    panel.appendChild(body);
    root.appendChild(panel);

    // 防止点击面板穿透到地图（触发“点击空白处恢复/收起搜索”等）
    root.addEventListener('pointerdown', (e) => stopEvent(e), { passive: false, capture: true });
    root.addEventListener('click', (e) => stopEvent(e), { passive: false, capture: true });

    document.body.appendChild(root);

    // ===== 交互状态（对齐 popup 的逻辑） =====
    let lastPointerType = 'mouse';
    let suppressMouseEventsUntilMs = 0;

    let tapArmedKey = null; // 触屏：线路两段式点击

    let hoverTimerId = null;
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;

    let lastAppliedHoverKey = null;
    let restoreTimerId = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    let currentStationServingIds = [];

    const clearHoverTimer = () => {
        if (hoverTimerId != null) {
            clearTimeout(hoverTimerId);
            hoverTimerId = null;
        }
    };

    const clearRestoreTimer = () => {
        if (restoreTimerId != null) {
            clearTimeout(restoreTimerId);
            restoreTimerId = null;
        }
    };

    const restoreStationLinesIfNeeded = () => {
        if (!lastAppliedHoverKey) return;
        if (!onRestoreStationLines) {
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
        if (!lastAppliedHoverKey) return;
        if (!onRestoreStationLines) {
            lastAppliedHoverKey = null;
            return;
        }
        clearRestoreTimer();
        restoreTimerId = setTimeout(() => {
            restoreTimerId = null;
            restoreStationLinesIfNeeded();
        }, restoreDelayMs);
    };

    const getInteractiveTarget = (evt) => {
        const target = evt?.target;
        if (!target || !(target instanceof Element)) return null;

        const lineEl = target.closest?.('[data-line-id]');
        if (lineEl && body.contains(lineEl)) {
            const lineId = lineEl.getAttribute('data-line-id');
            return lineId ? { kind: 'line', value: String(lineId) } : null;
        }

        const companyEl = target.closest?.('[data-company]');
        if (companyEl && body.contains(companyEl)) {
            const company = companyEl.getAttribute('data-company');
            return company ? { kind: 'company', value: String(company) } : null;
        }

        return null;
    };

    const onBodyPointerDown = (evt) => {
        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (isTouchLikePointer(pt)) {
            suppressMouseEventsUntilMs = nowMs() + 800;
        }

        if (!isTouchLikePointer(pt)) return;

        const t = getInteractiveTarget(evt);
        if (!t) {
            stopEvent(evt);
            return;
        }

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        if (t.kind === 'line') {
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                if (onSelectLine) onSelectLine(String(t.value), { source: 'panel-hover' });
                return;
            }

            tapArmedKey = null;
            if (onSelectLine) onSelectLine(String(t.value), { source: 'panel-click', isolateStations: true });
            return;
        }

        tapArmedKey = null;
        if (t.kind === 'company' && onSelectCompany) {
            onSelectCompany(String(t.value), {
                source: 'panel-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
        }
    };

    const onBodyMove = (evt) => {
        if (isTouchLikePointer(lastPointerType)) return;

        const t = getInteractiveTarget(evt);
        if (!t) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }

        clearRestoreTimer();

        const key = `${t.kind}:${t.value}`;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;
        tapArmedKey = null;

        if (key === lastFiredHoverKey) return;

        hoverTimerId = setTimeout(() => {
            hoverTimerId = null;
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (t.kind === 'line' && onSelectLine) {
                onSelectLine(String(t.value), { source: 'panel-hover' });
                lastAppliedHoverKey = `line:${String(t.value)}`;
            } else if (t.kind === 'company' && onSelectCompany) {
                onSelectCompany(String(t.value), {
                    source: 'panel-hover',
                    stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
                });
                lastAppliedHoverKey = `company:${String(t.value)}`;
            }
        }, hoverDelayMs);
    };

    const onBodyClick = (evt) => {
        // 触屏：由 pointerdown 接管两段式逻辑
        if (isTouchLikePointer(lastPointerType) || nowMs() < suppressMouseEventsUntilMs) {
            stopEvent(evt);
            return;
        }

        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;

        if (t.kind === 'line') {
            if (onSelectLine) onSelectLine(String(t.value), { source: 'panel-click', isolateStations: true });
            return;
        }

        if (t.kind === 'company' && onSelectCompany) {
            onSelectCompany(String(t.value), {
                source: 'panel-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
        }
    };

    const onBodyLeave = () => {
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        restoreStationLinesIfNeeded();
    };

    body.addEventListener('pointerdown', onBodyPointerDown, { passive: false });
    body.addEventListener('mousemove', onBodyMove);
    body.addEventListener('mouseleave', onBodyLeave);
    body.addEventListener('click', onBodyClick, { passive: false });

    // 布局：高度与 menu 一致（80% 屏高），top 为 10% 屏高
    const layout = () => {
        const h = window.innerHeight;
        const top = Math.round(h * 0.1);
        const height = Math.round(h * 0.8);

        root.style.top = `${top}px`;
        root.style.height = `${height}px`;

        // 复用 search-results 的圆角半径（若能读到）
        try {
            const br = window.getComputedStyle(panel).borderRadius;
            if (br) {
                panel.style.borderRadius = br;
            }
        } catch {
            // ignore
        }
    };

    layout();
    window.addEventListener('resize', layout);

    const show = () => {
        layout();
        root.style.transform = 'translateX(0)';
    };

    const hide = () => {
        root.style.transform = 'translateX(calc(100% + 24px))';
    };

    const setTitle = (text) => {
        title.textContent = toText(text);
    };

    const showForStationProps = (props) => {
        const name = readStationName(props);
        setTitle(name);

        // 用 serving_ids 驱动交互恢复/公司过滤
        const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
        currentStationServingIds = servingIdsRaw.map(String).filter(Boolean);
        lastAppliedHoverKey = null;
        tapArmedKey = null;
        clearHoverTimer();
        clearRestoreTimer();

        // 渲染 popup 同结构的内容（公司分组 + 线路）
        body.innerHTML = buildCompaniesHtml(props || {}, { getLineMeta, companyLogoMap });

        show();
    };

    return {
        el: root,
        show,
        hide,
        setTitle,
        showForStationProps,
        layout
    };
}
