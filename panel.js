/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；panel 样式使用 panel-* 前缀与 search/popup/menu 隔离。
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

function stopPropagationOnly(evt) {
    evt?.stopPropagation?.();
}

const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const SERVICE_DAY_BOUNDARY_HOUR = 3;

const getServiceDayStartMs = (now = new Date()) => {
    const d = new Date(now.getTime());
    // service day starts at 03:00
    const candidate = new Date(d.getTime());
    candidate.setHours(SERVICE_DAY_BOUNDARY_HOUR, 0, 0, 0);
    // If it's before 03:00, service day started yesterday at 03:00
    if (d.getTime() < candidate.getTime()) {
        candidate.setDate(candidate.getDate() - 1);
    }
    return candidate.getTime();
};

const parseHHMMToServiceDayMs = (hhmm, serviceDayStartMs) => {
    const s = toText(hhmm);
    const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);

    const d = new Date(serviceDayStartMs);
    d.setHours(h, min, 0, 0);

    // Times between 00:00–02:59 belong to the next calendar day segment of the same service day.
    const isNextDaySegment = h < SERVICE_DAY_BOUNDARY_HOUR;
    if (isNextDaySegment) d.setDate(d.getDate() + 1);

    return { ms: d.getTime(), isNextDaySegment };
};

const formatTimeWithPlus = (hhmm, isNextDaySegment) => {
    const s = toText(hhmm);
    if (!s) return '';
    return isNextDaySegment ? `${s}` : s;
};

const pickTitleZhHans = (titleObj) => {
    const t = titleObj || {};
    return toText(t['zh-Hans'] || t.zh || t.ja || t.en || '');
};

let stationsIndexPromise = null;
const getStationsIndex = async () => {
    if (stationsIndexPromise) return stationsIndexPromise;
    stationsIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/stations.json');
            if (!resp.ok) return { idToNameZh: new Map(), stationIdByRailwayAndNameZh: new Map() };
            const list = await resp.json();
            const idToNameZh = new Map();
            const stationIdByRailwayAndNameZh = new Map();
            for (const s of Array.isArray(list) ? list : []) {
                const id = toText(s?.id);
                if (!id) continue;
                const railway = toText(s?.railway);
                const name = pickTitleZhHans(s?.title) || id;
                idToNameZh.set(id, name);

                if (railway && name) {
                    const k = `${railway}||${name}`;
                    if (!stationIdByRailwayAndNameZh.has(k)) {
                        stationIdByRailwayAndNameZh.set(k, id);
                    }
                }
            }
            return { idToNameZh, stationIdByRailwayAndNameZh };
        } catch {
            return { idToNameZh: new Map(), stationIdByRailwayAndNameZh: new Map() };
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
            const map = new Map(); // stationId -> string[] (all ids in same group)

            for (const g of Array.isArray(groups) ? groups : []) {
                if (!Array.isArray(g)) continue;
                const ids = [];
                for (const chunk of g) {
                    if (!Array.isArray(chunk)) continue;
                    for (const sid of chunk) {
                        const id = toText(sid);
                        if (id) ids.push(id);
                    }
                }
                if (!ids.length) continue;

                // de-dup while preserving order
                const seen = new Set();
                const unique = [];
                for (const id of ids) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                    unique.push(id);
                }

                for (const id of unique) {
                    const existing = map.get(id);
                    if (!existing) {
                        map.set(id, unique);
                        continue;
                    }
                    // merge (just in case a station appears in multiple groups)
                    const mergedSeen = new Set(existing);
                    const merged = existing.slice();
                    for (const x of unique) {
                        if (mergedSeen.has(x)) continue;
                        mergedSeen.add(x);
                        merged.push(x);
                    }
                    map.set(id, merged);
                }
            }

            return map;
        } catch {
            return new Map();
        }
    })();
    return stationGroupsIndexPromise;
};

let trainTypesIndexPromise = null;
const getTrainTypesIndex = async () => {
    if (trainTypesIndexPromise) return trainTypesIndexPromise;
    trainTypesIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                const name = pickTitleZhHans(t?.title) || id;
                map.set(id, name);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypesIndexPromise;
};

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
        const abb = logoMap?.[company]?.abb || logoMap?.[company]?.zh || company;

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
            ? `<img class="panel-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
            : '';

        let linesHtml = '';
        for (const line of lines) {
            const style = typeof line.color === 'string' && line.color.trim() ? ` style="color:${escapeHtml(line.color.trim())}"` : '';
            const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';

            // 线路条目：标题行 + 班次容器（内部按方向 d 分组；方向可展开/收回）
            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-header">
                        <span class="panel-line-name">${escapeHtml(line.displayName)}</span>
                    </div>
                    <div class="panel-timetable-root" data-timetable-root="1"></div>
                </div>
            `;
        }

        companiesHtml += `
            <div class="panel-company">
                <div class="panel-company-header" data-company="${escapeHtml(company)}">${logoHtml}<span class="panel-company-name">${escapeHtml(companyDisplay)}</span></div>
                <div class="panel-company-lines">${linesHtml}</div>
            </div>
        `;
    }

    return `<div class="panel-popup is-interactive">${companiesHtml}</div>`;
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
    const onTripPreview = typeof options.onTripPreview === 'function' ? options.onTripPreview : null;
    const onTripClear = typeof options.onTripClear === 'function' ? options.onTripClear : null;

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

    // 面板主体：视觉同 search-results，但 class 使用 panel-* 隔离
    const panel = document.createElement('div');
    panel.className = 'panel-container';
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
    title.style.flex = '1 1 auto';
    title.style.fontSize = '30px';
    title.style.lineHeight = '1.2';
    title.style.fontWeight = '700';
    title.style.color = '#111';
    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'hidden';
    title.style.textOverflow = 'ellipsis';
    header.appendChild(title);

    // 右侧控件区：工作日/休息日 + 时间
    const controls = document.createElement('div');
    controls.className = 'panel-controls';

    // 工作日/休息日切换（两段式圆角滑块）
    const dayToggle = document.createElement('div');
    dayToggle.className = 'panel-day-toggle';

    const daySeg = document.createElement('div');
    daySeg.className = 'panel-day-seg';

    const btnWeekday = document.createElement('button');
    btnWeekday.type = 'button';
    btnWeekday.textContent = '工作日';
    btnWeekday.setAttribute('data-day', 'Weekday');

    const btnHoliday = document.createElement('button');
    btnHoliday.type = 'button';
    btnHoliday.textContent = '休息日';
    btnHoliday.setAttribute('data-day', 'SaturdayHoliday');

    daySeg.appendChild(btnWeekday);
    daySeg.appendChild(btnHoliday);
    dayToggle.appendChild(daySeg);

    // 时间控件：覆盖 panel 中的“当前时间”（用于判断已过/未来与默认定位）
    const timeControl = document.createElement('div');
    timeControl.className = 'panel-time-control';

    const timeLabel = document.createElement('span');
    timeLabel.className = 'panel-time-control-label';
    timeLabel.textContent = '时间';

    const timeInput = document.createElement('input');
    timeInput.className = 'panel-time-input';
    timeInput.type = 'time';
    timeInput.step = '60';
    timeInput.value = '';

    timeControl.appendChild(timeLabel);
    timeControl.appendChild(timeInput);

    controls.appendChild(dayToggle);
    controls.appendChild(timeControl);
    header.appendChild(controls);

    // 内容区：承载 popup 同结构的公司/线路列表
    const body = document.createElement('div');
    body.setAttribute('data-panel-body', '');
    body.className = 'panel-list';
    body.style.flex = '1 1 auto';
    body.style.paddingLeft = '10px';
    body.style.paddingRight = '10px';
    body.style.overflowY = 'auto';
    body.style.overflowX = 'hidden';

    panel.appendChild(header);
    panel.appendChild(body);
    root.appendChild(panel);

    // 防止点击面板穿透到地图（触发“点击空白处恢复/收起搜索”等）
    // 用 bubble 阶段拦截，避免阻断面板内部的点击/触屏事件处理
    root.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    root.addEventListener('click', (e) => stopEvent(e), { passive: false });

    document.body.appendChild(root);

    // 右侧 panel 左侧弹出的班次详情面板
    const tripDetailRoot = document.createElement('div');
    tripDetailRoot.className = 'panel-trip-detail is-hidden';
    tripDetailRoot.setAttribute('data-panel-trip-detail', '');
    tripDetailRoot.style.position = 'fixed';
    tripDetailRoot.style.zIndex = String(zIndex + 1);

    const tripDetailHeader = document.createElement('div');
    tripDetailHeader.className = 'panel-trip-detail-header';

    const tripDetailTitle = document.createElement('div');
    tripDetailTitle.className = 'panel-trip-detail-title';
    tripDetailHeader.appendChild(tripDetailTitle);

    const tripDetailBody = document.createElement('div');
    tripDetailBody.className = 'panel-trip-detail-body';

    tripDetailRoot.appendChild(tripDetailHeader);
    tripDetailRoot.appendChild(tripDetailBody);
    document.body.appendChild(tripDetailRoot);

    tripDetailRoot.addEventListener('pointerdown', (e) => {
        tripDetailPinned = true;
        clearTripDetailHideTimer();
        stopPropagationOnly(e);
    }, { passive: true });
    tripDetailRoot.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    tripDetailRoot.addEventListener('mouseenter', () => {
        if (isTouchLikePointer(lastPointerType)) return;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    });
    tripDetailRoot.addEventListener('mouseleave', () => {
        if (isTouchLikePointer(lastPointerType)) return;
        if (tripLocked) {
            tripDetailPinned = true;
            clearTripDetailHideTimer();
            return;
        }
        tripDetailPinned = false;
        scheduleTripDetailHide();
    });

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
    let currentStationId = null;
    let currentStationNameZh = '';

    // 时刻表日类型过滤
    let currentServiceDay = 'Weekday'; // 'Weekday' | 'SaturdayHoliday'

    // 可选：覆盖显示的“当前时间”（HH:MM）；为空则使用真实时间
    let currentNowOverrideHHMM = '';
    const getDisplayNowMs = () => {
        const baseNowMs = Date.now();
        const hhmm = toText(currentNowOverrideHHMM);
        if (!hhmm) return baseNowMs;
        const serviceDayStartMs = getServiceDayStartMs(new Date(baseNowMs));
        const parsed = parseHHMMToServiceDayMs(hhmm, serviceDayStartMs);
        return parsed?.ms || baseNowMs;
    };

    let mouseArmedKey = null;
    let timetableRenderToken = 0;
    let lastTripDetailKey = null;
    let tripArmedKey = null;
    let tripLocked = false;
    let lockedTripKey = null;
    const tripHighlightDelayMs = 500;
    let tripHighlightTimerId = null;
    let tripHighlightCandidateKey = null;
    let tripHighlightAppliedKey = null;

    let tripDetailToken = 0;
    let tripDetailPinned = false;
    let tripDetailHideTimer = null;

    const clearTripDetailHideTimer = () => {
        if (tripDetailHideTimer != null) {
            clearTimeout(tripDetailHideTimer);
            tripDetailHideTimer = null;
        }
    };

    const clearTripHighlightTimer = () => {
        if (tripHighlightTimerId != null) {
            clearTimeout(tripHighlightTimerId);
            tripHighlightTimerId = null;
        }
        tripHighlightCandidateKey = null;
    };

    const dispatchTripPreview = (previewKey, payload) => {
        if (!onTripPreview) return;
        try {
            tripHighlightAppliedKey = toText(previewKey) || null;
            onTripPreview(payload);
        } catch {
            // ignore
        }
    };

    const scheduleTripPreview = ({ previewKey, payload, immediate }) => {
        if (!onTripPreview) return;

        if (immediate) {
            clearTripHighlightTimer();
            dispatchTripPreview(previewKey, payload);
            return;
        }

        clearTripHighlightTimer();
        tripHighlightCandidateKey = toText(previewKey);
        const key = tripHighlightCandidateKey;
        tripHighlightTimerId = setTimeout(() => {
            tripHighlightTimerId = null;
            if (tripHighlightCandidateKey !== key) return;
            tripHighlightCandidateKey = null;
            dispatchTripPreview(previewKey, payload);
        }, tripHighlightDelayMs);
    };

    const scheduleTripDetailHide = (delayMs = 220) => {
        clearTripDetailHideTimer();
        tripDetailHideTimer = setTimeout(() => {
            tripDetailHideTimer = null;
            if (!tripDetailPinned) {
                hideTripDetail();
                lastTripDetailKey = null;
            }
        }, delayMs);
    };

    const lockTripPreview = (tripKey) => {
        tripLocked = true;
        lockedTripKey = toText(tripKey) || null;
        tripDetailPinned = true;
        clearTripDetailHideTimer();
    };

    const unlockTripPreview = () => {
        tripLocked = false;
        lockedTripKey = null;
        tripArmedKey = null;
        tripDetailPinned = false;
    };

    // expanded state per (lineId, direction)
    let expandedDirKeys = new Set();
    const dirKeyOf = (lineId, dir) => `${toText(lineId)}||${toText(dir) || 'Unknown'}`;
    const isDirExpanded = (lineId, dir) => expandedDirKeys.has(dirKeyOf(lineId, dir));
    const setDirExpanded = (lineId, dir, expanded) => {
        const k = dirKeyOf(lineId, dir);
        if (!k) return;
        if (expanded) expandedDirKeys.add(k);
        else expandedDirKeys.delete(k);
    };

    const applyDayToggleUi = () => {
        const day = currentServiceDay;
        btnWeekday.classList.toggle('is-active', day === 'Weekday');
        btnHoliday.classList.toggle('is-active', day === 'SaturdayHoliday');
    };

    const setServiceDay = (day) => {
        const v = String(day || '').trim();
        if (v !== 'Weekday' && v !== 'SaturdayHoliday') return;
        if (currentServiceDay === v) return;
        currentServiceDay = v;
        applyDayToggleUi();
        renderAllTimetables();
    };

    btnWeekday.addEventListener('click', (e) => {
        stopEvent(e);
        setServiceDay('Weekday');
    });
    btnHoliday.addEventListener('click', (e) => {
        stopEvent(e);
        setServiceDay('SaturdayHoliday');
    });
    applyDayToggleUi();

    timeInput.addEventListener('input', (e) => {
        stopEvent(e);
        currentNowOverrideHHMM = toText(timeInput.value) || '';
        renderAllTimetables();
    });
    timeInput.addEventListener('click', (e) => stopEvent(e), { passive: false });

    const loadTimetableForLineId = async (lineId) => {
        const id = toText(lineId);
        if (!id) return null;
        try {
            // Use the global timetable cache instance created in app.js
            const cache = window?.TokyoRailTimetableCache;
            if (!cache) return null;
            const existing = cache.get(id);
            if (existing) return existing;
            await cache.preloadByLineIds([id]);
            return cache.get(id);
        } catch {
            return null;
        }
    };

    const refTripCache = new Map(); // refId -> trip|null
    const getRefLineId = (refId) => {
        const s = toText(refId);
        if (!s) return null;
        const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        return `${parts[0]}.${parts[1]}`;
    };
    const loadTripByRefId = async (refId) => {
        const key = toText(refId);
        if (!key) return null;
        if (refTripCache.has(key)) return refTripCache.get(key);

        const refLineId = getRefLineId(key);
        if (!refLineId) {
            refTripCache.set(key, null);
            return null;
        }

        const data = await loadTimetableForLineId(refLineId);
        const list = Array.isArray(data) ? data : [];
        let hit = list.find((t) => toText(t?.id) === key) || null;
        if (!hit) {
            const parts = key.split('.').map((x) => x.trim()).filter(Boolean);
            const maybeNoDay = parts.length >= 2 ? parts.slice(0, -1).join('.') : key;
            hit =
                list.find((t) => toText(t?.t) === maybeNoDay) ||
                list.find((t) => toText(t?.id) === maybeNoDay) ||
                list.find((t) => {
                    const id = toText(t?.id);
                    return id ? id.startsWith(`${maybeNoDay}.`) : false;
                }) ||
                null;
        }

        refTripCache.set(key, hit);
        return hit;
    };
    const getNtFirstDepartTime = async (refId) => {
        const trip = await loadTripByRefId(refId);
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const first = tt.length ? tt[0] : null;
        return toText(first?.d) || toText(first?.a) || null;
    };
    const getPtLastArriveTime = async (refId) => {
        const trip = await loadTripByRefId(refId);
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const last = tt.length ? tt[tt.length - 1] : null;
        return toText(last?.a) || toText(last?.d) || null;
    };

    const findTripByKey = async (lineId, tripKey) => {
        const key = toText(tripKey);
        if (!key) return null;
        const data = await loadTimetableForLineId(lineId);
        const list = Array.isArray(data) ? data : [];
        if (!list.length) return null;

        const candidates = list.filter((t) => {
            const id = toText(t?.id);
            const tkey = toText(t?.t);
            if (id === key || tkey === key) return true;
            return id ? id.startsWith(`${key}.`) : false;
        });

        if (!candidates.length) return null;
        const withDay = candidates.find((t) => {
            const id = toText(t?.id);
            return id.endsWith(`.${currentServiceDay}`);
        });
        return withDay || candidates[0] || null;
    };

    const resolveStationIdForLine = async (lineId) => {
        const rid = toText(lineId);
        if (!rid) return null;

        // 如果当前站点 id 本身就是该线路的站点 id，则直接用
        const sid = toText(currentStationId);
        if (sid && (sid === rid || sid.startsWith(`${rid}.`))) return sid;

        // 优先：用 station-groups.json 反查换乘组内“该线路对应的 station id”
        try {
            const groupsIndex = await getStationGroupsIndex();
            const groupIds = sid ? groupsIndex.get(sid) : null;
            if (Array.isArray(groupIds) && groupIds.length) {
                for (const candidate of groupIds) {
                    const c = toText(candidate);
                    if (!c) continue;
                    if (c === rid || c.startsWith(`${rid}.`)) return c;
                }
            }
        } catch {
            // ignore
        }

        // 换乘站：用 (railwayId + stationName.zh-Hans) 反查该线路对应的 station id
        const name = toText(currentStationNameZh);
        if (!name) return sid || null;

        const idx = await getStationsIndex();
        const hit = idx?.stationIdByRailwayAndNameZh?.get?.(`${rid}||${name}`);
        return hit || sid || null;
    };

    const buildTimetableRowsHtml = async ({ lineId, stationId }) => {
        const stationKey = toText(stationId);
        if (!stationKey) return '';

        const [stationsIndex, trainTypesIndex, data] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            loadTimetableForLineId(lineId)
        ]);

        const list = Array.isArray(data) ? data : [];
        if (!list.length) return '';

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));
        const rows = [];

        // Resolve pt/nt refs to get missing arrival/departure times.

        for (const trip of list) {
            // 按 timetables 的 id 最后一段区分工作日/休息日
            const tripId = toText(trip?.id);
            if (tripId) {
                const parts = tripId.split('.').map((x) => x.trim()).filter(Boolean);
                const day = parts.length ? parts[parts.length - 1] : '';
                if (day === 'Weekday' || day === 'SaturdayHoliday') {
                    if (day !== currentServiceDay) continue;
                }
            }

            const tt = Array.isArray(trip?.tt) ? trip.tt : [];
            if (!tt.length) continue;
            const stop = tt.find((x) => toText(x?.s) === stationKey);
            if (!stop) continue;

            let arr = toText(stop?.a);
            let dep = toText(stop?.d);

            const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
            const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
            const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
            const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
            const hasPt = ptRefs.some((x) => !!toText(x));
            const hasNt = ntRefs.some((x) => !!toText(x));

            const isOriginStation = os.some((x) => toText(x) === stationKey);
            const isTerminalStation = ds.some((x) => toText(x) === stationKey);

            // 真始发/真终点：没有 pt/nt 的端点站，不补全时间
            const showOriginLabel = isOriginStation && !hasPt;
            const showTerminalLabel = isTerminalStation && !hasNt;
            const allowMirrorFill = !(showOriginLabel || showTerminalLabel);

            // (2) If dep missing but has nt, take nt's first stop time as dep.
            if (!dep) {
                const ntRefId = toText(ntRefs?.[0]);
                if (ntRefId) dep = await getNtFirstDepartTime(ntRefId);
            }

            // (2) If arr missing but has pt, take pt's last stop time as arr.
            if (!arr) {
                const ptRefId = toText(ptRefs?.[0]);
                if (ptRefId) arr = await getPtLastArriveTime(ptRefId);
            }

            // (1) If only one side exists, mirror it (except true endpoints)
            if (allowMirrorFill) {
                if (!arr && dep) arr = dep;
                if (!dep && arr) dep = arr;
            }

            const timeStr = dep || arr;
            const parsed = parseHHMMToServiceDayMs(timeStr, serviceDayStartMs);
            if (!timeStr || !parsed) continue;
            const timeMs = parsed.ms;

            const destId = toText(ds?.[0]);

            const dir = toText(trip?.d);
            const loopDest = (dir === 'InnerLoop' ? '内环' : (dir === 'OuterLoop' ? '外环' : ''));
            const destName = loopDest || (destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '');

            const destNamesForDir = (() => {
                if (loopDest) return [loopDest];
                const out = [];
                for (const x of ds) {
                    const id = toText(x);
                    if (!id) continue;
                    out.push(stationsIndex?.idToNameZh?.get?.(id) || id);
                }
                return out.length ? out : (destName ? [destName] : []);
            })();

            const typeId = toText(trip?.y);
            const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';

            const tripKey = tripId || toText(trip?.t) || '';

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;

            rows.push({
                destName,
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs,
                isPast: timeMs < now,
                typeName,
                dir,
                destNamesForDir,
                showOriginLabel,
                showTerminalLabel,
                tripKey
            });
        }

        if (!rows.length) return '';
        rows.sort((a, b) => a.timeMs - b.timeMs);

        // 统计每条线路的所有方向 d，并聚合/计数该方向下所有对应 ds 的中文名
        const DEST_NAME_MIN_COUNT = 0; // 方向下目的地名称至少出现x次才显示
        const dirToDestNames = new Map(); // dir -> Set<string>
        const dirToDestCounts = new Map(); // dir -> Map<string, number>
        for (const r of rows) {
            const k = toText(r.dir) || 'Unknown';
            if (!dirToDestNames.has(k)) dirToDestNames.set(k, new Set());
            if (!dirToDestCounts.has(k)) dirToDestCounts.set(k, new Map());
            const set = dirToDestNames.get(k);
            const counts = dirToDestCounts.get(k);
            const names = Array.isArray(r.destNamesForDir) ? r.destNamesForDir : [];
            for (const n of names) {
                const s = toText(n);
                if (!s) continue;
                set.add(s);
                counts.set(s, (counts.get(s) || 0) + 1);
            }
        }

        const renderTime = (r) => {
            const a = toText(r.arr);
            const d = toText(r.dep);
            if (!a && !d) return '';

            const base = (() => {
                if (!a) return `<span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
                if (!d) return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span>`;
                // 到达/发车时间相同也统一显示两者
                return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span> <span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
            })();

            const originCls = `panel-time-label panel-time-label-origin${r.isPast ? ' is-past' : ''}`;
            const terminalCls = `panel-time-label panel-time-label-terminal${r.isPast ? ' is-past' : ''}`;
            if (r.showOriginLabel && r.showTerminalLabel) {
                return `<span class="${originCls}">始发站</span> ${base} <span class="${terminalCls}">终点站</span>`;
            }
            if (r.showOriginLabel) return `<span class="${originCls}">始发站</span> ${base}`;
            if (r.showTerminalLabel) return `${base} <span class="${terminalCls}">终点站</span>`;
            return base;
        };

        // 分组显示：默认显示所有方向；方向内默认展示 3 条未来班次
        // Build direction order: collect unique dirs
        const dirOrder = [];
        const dirSeen = new Set();
        for (const r of rows) {
            const k = toText(r.dir) || 'Unknown';
            if (dirSeen.has(k)) continue;
            dirSeen.add(k);
            dirOrder.push(k);
        }

        // Determine if any destination across all directions meets the threshold
        let anyDestAboveThreshold = false;
        for (const [dkey, counts] of dirToDestCounts) {
            for (const [, c] of counts) {
                if (Number(c) >= DEST_NAME_MIN_COUNT) {
                    anyDestAboveThreshold = true;
                    break;
                }
            }
            if (anyDestAboveThreshold) break;
        }

        // Compute ranking metrics per direction: max dest count (primary), total trips (secondary)
        const dirMetrics = new Map();
        for (const dirKey of dirOrder) {
            const counts = dirToDestCounts.get(dirKey) || new Map();
            let maxCount = 0;
            let sumCount = 0;
            for (const [, c] of counts) {
                const n = Number(c) || 0;
                sumCount += n;
                if (n > maxCount) maxCount = n;
            }
            // Fallback: if counts map is empty, use rowsForDir length as estimate
            const rowsForDirLen = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey).length;
            if (!sumCount) sumCount = rowsForDirLen;
            if (!maxCount) maxCount = rowsForDirLen ? Math.max(1, Math.floor(rowsForDirLen / 2)) : 0;
            dirMetrics.set(dirKey, { maxCount, sumCount });
        }

        // Sort directions by maxCount desc, then sumCount desc, then dirKey
        dirOrder.sort((a, b) => {
            const ma = dirMetrics.get(a) || { maxCount: 0, sumCount: 0 };
            const mb = dirMetrics.get(b) || { maxCount: 0, sumCount: 0 };
            if (mb.maxCount !== ma.maxCount) return mb.maxCount - ma.maxCount;
            if (mb.sumCount !== ma.sumCount) return mb.sumCount - ma.sumCount;
            return String(a).localeCompare(String(b));
        });

        let html = '';
        for (const dirKey of dirOrder) {
            const counts = dirToDestCounts.get(dirKey) || new Map();
            // If no destination anywhere met threshold, show all destinations sorted by frequency
            const useAllIfBelowThreshold = !anyDestAboveThreshold;
            const entries = Array.from(counts.entries());
            const filteredNames = entries
                .filter(([name, c]) => useAllIfBelowThreshold ? true : Number(c) >= DEST_NAME_MIN_COUNT)
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => name);
            const label = filteredNames.length ? filteredNames.join('，') : dirKey;
            const expanded = isDirExpanded(lineId, dirKey);
            const tri = expanded ? '▾' : '▸';

            const rowsForDir = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const future = rowsForDir.filter((r) => !r.isPast);
            const visible = expanded ? rowsForDir : future.slice(0, 3);

            html += `
                <div class="panel-dir">
                    <div class="panel-dir-header" data-dir-toggle="1" data-dir-key="${escapeHtml(dirKey)}">
                        <span class="panel-dir-title">
                            <span class="panel-dir-prefix" aria-hidden="true">往</span>
                            <span class="panel-dir-marquee" aria-label="往 ${escapeHtml(label)} 方向">
                                <span class="panel-dir-marquee-inner">${escapeHtml(label)}</span>
                            </span>
                            <span class="panel-dir-suffix" aria-hidden="true">方向</span>
                        </span>
                        <span class="panel-dir-triangle" aria-hidden="true">${tri}</span>
                    </div>
                    <div class="panel-timetable ${expanded ? 'is-expanded' : 'is-collapsed'}" data-dir-body="1" data-dir-key="${escapeHtml(dirKey)}">
                        ${visible
                            .map((r) => {
                                const klass = r.isPast ? 'panel-timetable-row is-past' : 'panel-timetable-row';
                                const tripAttr = r.tripKey ? ` data-trip-key="${escapeHtml(r.tripKey)}"` : '';
                                return `
                                    <div class="${klass}"${tripAttr}>
                                        <div class="panel-timetable-dest">
                                            <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                                            <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(r.destName || '')}">
                                                <span class="panel-timetable-dest-marquee-inner">${escapeHtml(r.destName || '')}</span>
                                            </span>
                                        </div>
                                        <div class="panel-timetable-time">${renderTime(r)}</div>
                                        <div class="panel-timetable-type">${escapeHtml(r.typeName || '')}</div>
                                    </div>
                                `;
                            })
                            .join('')}
                    </div>
                </div>
            `;
        }

        return html;
    };

    const renderTimetableForLineEl = async (lineEl, stationId, token) => {
        if (!lineEl || !(lineEl instanceof Element)) return;
        if (token !== timetableRenderToken) return;

        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!lineId) return;

        const ttEl = lineEl.querySelector('[data-timetable-root]');
        if (!ttEl) return;

        const resolvedStationId = await resolveStationIdForLine(lineId);
        if (token !== timetableRenderToken) return;

        const html = await buildTimetableRowsHtml({
            lineId,
            stationId: resolvedStationId || stationId
        });

        if (token !== timetableRenderToken) return;
        ttEl.innerHTML = html;

        // 方向展开态：默认把各方向可视区域滚到“最后一条已过班次”处（1 past + 9 future 的视觉效果）
        try {
            const expandedBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of expandedBodies) {
                const rows = Array.from(bodyEl.querySelectorAll('.panel-timetable-row'));
                if (!rows.length) continue;

                let lastPastIndex = -1;
                for (let i = rows.length - 1; i >= 0; i -= 1) {
                    if (rows[i]?.classList?.contains('is-past')) {
                        lastPastIndex = i;
                        break;
                    }
                }

                if (lastPastIndex > 0) {
                    const rowH = rows[0]?.offsetHeight || 18;
                    const desired = lastPastIndex * rowH;
                    const maxScroll = Math.max(0, (bodyEl.scrollHeight || 0) - (bodyEl.clientHeight || 0));
                    bodyEl.scrollTop = Math.max(0, Math.min(desired, maxScroll));
                } else {
                    bodyEl.scrollTop = 0;
                }
            }
        } catch {
            // ignore
        }

        // 超长方向标题/班次终点站：自动滚动（等待布局稳定 + 已完成默认定位滚动后再测量）
        scheduleMarqueeApply(ttEl);
    };

    const buildTripStops = (trip, stationsIndex, serviceDayStartMs) => {
        const tt = Array.isArray(trip?.tt) ? trip.tt : [];
        const out = [];
        for (const stop of tt) {
            const sid = toText(stop?.s);
            if (!sid) continue;
            const name = stationsIndex?.idToNameZh?.get?.(sid) || sid;
            const arr = toText(stop?.a);
            const dep = toText(stop?.d);
            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = (depParsed?.ms || arrParsed?.ms || null);

            out.push({
                stationId: sid,
                stationName: name,
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs
            });
        }
        return out;
    };

    const normalizeTripStops = (stops, serviceDayStartMs, { originIds, terminalIds, showOriginLabel, showTerminalLabel }) => {
        const out = [];
        for (const s of Array.isArray(stops) ? stops : []) {
            let arr = toText(s?.arr) || '';
            let dep = toText(s?.dep) || '';

            const isOriginStop = showOriginLabel && originIds?.has?.(toText(s?.stationId));
            const isTerminalStop = showTerminalLabel && terminalIds?.has?.(toText(s?.stationId));
            const allowMirrorFill = !(isOriginStop || isTerminalStop);

            if (allowMirrorFill) {
                if (!arr && dep) arr = dep;
                if (!dep && arr) dep = arr;
            }

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = depParsed?.ms || arrParsed?.ms || null;

            out.push({
                stationId: toText(s?.stationId),
                stationName: toText(s?.stationName),
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs,
                isPast: false,
                showOriginLabel: isOriginStop,
                showTerminalLabel: isTerminalStop
            });
        }
        return out;
    };

    const mergeStops = (base, next) => {
        const out = Array.isArray(base) ? base.slice() : [];
        const arr = Array.isArray(next) ? next : [];
        if (!arr.length) return out;
        if (!out.length) return arr.slice();

        const last = out[out.length - 1];
        const first = arr[0];
        const sameStation = last?.stationId && first?.stationId && last.stationId === first.stationId;
        const sameTime = toText(last?.arr) === toText(first?.arr) && toText(last?.dep) === toText(first?.dep);
        if (sameStation && sameTime) {
            return out.concat(arr.slice(1));
        }
        return out.concat(arr);
    };

    const sameStopTime = (a, b) => {
        if (!a || !b) return false;
        return toText(a.stationId) === toText(b.stationId)
            && toText(a.arr) === toText(b.arr)
            && toText(a.dep) === toText(b.dep);
    };

    const getStationAKey = (stationId) => {
        const s = toText(stationId);
        if (!s) return '';
        const parts = s.split('.').map((x) => x.trim()).filter(Boolean);
        return parts.length ? parts[parts.length - 1] : '';
    };

    const getTripLineId = (trip) => {
        const rid = toText(trip?.r);
        if (rid) return rid;
        const id = toText(trip?.id) || toText(trip?.t);
        if (!id) return '';
        const parts = id.split('.').map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) return '';
        return `${parts[0]}.${parts[1]}`;
    };

    const buildLineDescriptor = (lineIdRaw) => {
        const lineId = toText(lineIdRaw);
        if (!lineId) return null;
        const meta = getLineMeta(lineId) || {};
        const company = toText(meta?.company);
        const abb = toText(companyLogoMap?.[company]?.abb || companyLogoMap?.[company]?.zh || company);
        let lineName = toText(meta?.name || lineId);
        if (abb && lineName.startsWith(abb)) {
            lineName = lineName.slice(abb.length).trim();
        }
        const text = `${abb}${lineName}`.trim() || lineId;
        const color = toText(meta?.color);
        return {
            lineId,
            text,
            color: color || null
        };
    };

    const isSameLineName = (lineIdA, lineIdB) => {
        const a = buildLineDescriptor(lineIdA);
        const b = buildLineDescriptor(lineIdB);
        const an = toText(a?.text || lineIdA);
        const bn = toText(b?.text || lineIdB);
        return !!an && !!bn && an === bn;
    };

    const buildRefLineDescriptor = (refId) => {
        const lineId = getRefLineId(refId);
        return buildLineDescriptor(lineId);
    };

    const collectRefChainTrips = async (startTrip, key, token) => {
        const out = [];
        const seenRefs = new Set();
        const seenTrips = new Set();
        let cursor = startTrip;

        for (let i = 0; i < 24; i += 1) {
            const refs = Array.isArray(cursor?.[key]) ? cursor[key] : (cursor?.[key] ? [cursor[key]] : []);
            const refId = toText(refs?.[0]);
            if (!refId) break;
            if (seenRefs.has(refId)) break;
            seenRefs.add(refId);

            const refTrip = await loadTripByRefId(refId);
            if (token !== tripDetailToken) return null;
            if (!refTrip) break;

            const sid = toText(refTrip?.id) || toText(refTrip?.t);
            if (sid && seenTrips.has(sid)) break;

            out.push(refTrip);

            if (sid) seenTrips.add(sid);

            cursor = refTrip;
        }

        return out;
    };

    const getTripDestName = (trip, stationsIndex) => {
        const dir = toText(trip?.d);
        if (dir === 'InnerLoop') return '内环';
        if (dir === 'OuterLoop') return '外环';
        const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
        const destId = toText(ds?.[0]);
        return destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '';
    };

    const renderTripDetail = async ({ lineId, tripKey, clientX, clientY, pinned }) => {
        const token = ++tripDetailToken;
        tripDetailPinned = !!pinned;
        clearTripDetailHideTimer();

        const trip = await findTripByKey(lineId, tripKey);
        if (token !== tripDetailToken) return;
        if (!trip) {
            tripDetailRoot.classList.add('is-hidden');
            return;
        }

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));

        const [stationsIndex, trainTypesIndex] = await Promise.all([getStationsIndex(), getTrainTypesIndex()]);
        if (token !== tripDetailToken) return;

        const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
        const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
        const hasPt = ptRefs.some((x) => !!toText(x));
        const hasNt = ntRefs.some((x) => !!toText(x));
        const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
        const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
        const originIds = new Set(os.map((x) => toText(x)).filter(Boolean));
        const terminalIds = new Set(ds.map((x) => toText(x)).filter(Boolean));
        const showOriginLabel = !!originIds.size && !hasPt;
        const showTerminalLabel = !!terminalIds.size && !hasNt;

        const ptChain = await collectRefChainTrips(trip, 'pt', token);
        if (token !== tripDetailToken) return;
        const ntChain = await collectRefChainTrips(trip, 'nt', token);
        if (token !== tripDetailToken) return;

        const segments = [];

        for (const ptTrip of (Array.isArray(ptChain) ? ptChain.slice().reverse() : [])) {
            const rows = normalizeTripStops(buildTripStops(ptTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                originIds,
                terminalIds,
                showOriginLabel,
                showTerminalLabel
            }).map((s) => ({ ...s, seg: 'pt', isMain: false }));
            segments.push({ kind: 'pt', lineId: getTripLineId(ptTrip), rows });
        }

        const mainRowsRaw = normalizeTripStops(buildTripStops(trip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
            originIds,
            terminalIds,
            showOriginLabel,
            showTerminalLabel
        }).map((s) => ({ ...s, seg: 'main', isMain: true }));
        segments.push({ kind: 'main', lineId: getTripLineId(trip), rows: mainRowsRaw });

        for (const ntTrip of (Array.isArray(ntChain) ? ntChain : [])) {
            const rows = normalizeTripStops(buildTripStops(ntTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                originIds,
                terminalIds,
                showOriginLabel,
                showTerminalLabel
            }).map((s) => ({ ...s, seg: 'nt', isMain: false }));
            segments.push({ kind: 'nt', lineId: getTripLineId(ntTrip), rows });
        }

        for (let i = 1; i < segments.length; i += 1) {
            const prevSeg = segments[i - 1] || null;
            const currSeg = segments[i] || null;
            const prevRows = prevSeg?.rows || [];
            const currRows = currSeg?.rows || [];
            if (!prevRows.length || !currRows.length) continue;

            const prevLast = prevRows[prevRows.length - 1];
            const currFirst = currRows[0];
            const prevSid = toText(prevLast?.stationId);
            const currSid = toText(currFirst?.stationId);
            const sameById = prevSid && prevSid === currSid;
            const prevA = getStationAKey(prevSid);
            const currA = getStationAKey(currSid);
            const sameByA = prevA && currA && prevA === currA;
            const sameStation = sameById || sameByA;
            if (!sameStation) continue;

            // pt 边界：视为同一站，使用当前段站名，时间采用“pt 到站 + 当前发车”。
            if (prevSeg?.kind === 'pt') {
                const merged = {
                    ...currFirst,
                    stationName: toText(currFirst?.stationName) || toText(prevLast?.stationName),
                    arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
                    arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
                    dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
                    depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus
                };
                currRows[0] = merged;
                prevRows.pop();
                continue;
            }

            // nt 边界：视为同一站，使用当前段(上一段)站名，时间采用“当前到站 + nt 发车”。
            currRows.shift();
            const merged = {
                ...prevLast,
                stationName: toText(prevLast?.stationName) || toText(currFirst?.stationName),
                arr: toText(prevLast?.arr) || toText(currFirst?.arr) || null,
                arrPlus: toText(prevLast?.arr) ? !!prevLast?.arrPlus : !!currFirst?.arrPlus,
                dep: toText(currFirst?.dep) || toText(prevLast?.dep) || null,
                depPlus: toText(currFirst?.dep) ? !!currFirst?.depPlus : !!prevLast?.depPlus
            };
            prevRows[prevRows.length - 1] = merged;
        }

        const normalizedStops = segments.flatMap((x) => x.rows || []);

        const stationIdForLine = await resolveStationIdForLine(lineId);
        if (token !== tripDetailToken) return;
        const currentIdx = normalizedStops.findIndex((s) => toText(s.stationId) === toText(stationIdForLine) && !!s.isMain);
        const stopsWithPast = normalizedStops.map((s, idx) => ({
            ...s,
            isPast: currentIdx >= 0 ? idx < currentIdx : false
        }));

        let cursor = 0;
        const segmentsWithPast = segments.map((seg) => {
            const len = (seg.rows || []).length;
            const rows = stopsWithPast.slice(cursor, cursor + len);
            cursor += len;
            return { ...seg, rows };
        });

        const destName = getTripDestName(trip, stationsIndex) || '未知方向';
        const typeId = toText(trip?.y);
        const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';
        tripDetailTitle.textContent = `往 ${destName}  ${typeName}`.trim();
        const currentLineDesc = buildLineDescriptor(getTripLineId(trip) || lineId);

        const renderStopRow = (s) => {
                const rowCls = s.isPast ? 'panel-trip-detail-row is-past' : 'panel-trip-detail-row';
                const arrText = s.arr ? formatTimeWithPlus(s.arr, s.arrPlus) : '';
                const depText = s.dep ? formatTimeWithPlus(s.dep, s.depPlus) : '';
                const originCls = `panel-time-label panel-time-label-origin${s.isPast ? ' is-past' : ''}`;
                const terminalCls = `panel-time-label panel-time-label-terminal${s.isPast ? ' is-past' : ''}`;
                const arrivalLabel = s.showOriginLabel ? `<span class=\"${originCls}\">始发站</span> ` : '';
                const departLabel = s.showTerminalLabel ? `<span class=\"${terminalCls}\">终点站</span> ` : '';

                return `
                    <div class="${rowCls}">
                        <div class="panel-trip-detail-station">${escapeHtml(s.stationName || '')}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-arrive">${arrivalLabel}${arrText ? `<span class=\"panel-time-arrive\">${escapeHtml(arrText)}</span>` : ''}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-depart">${departLabel}${depText ? `<span class=\"panel-time-depart\">${escapeHtml(depText)}</span>` : ''}</div>
                    </div>
                `;
            };

        const renderNoteRow = (prefix, descriptor) => {
            if (!descriptor?.text) return '';
            const colorStyle = descriptor.color ? ` style="color:${escapeHtml(descriptor.color)}"` : '';
            const dotStyle = descriptor.color ? ` style="background:${escapeHtml(descriptor.color)}"` : '';
            const prefixHtml = toText(prefix)
                ? `<span class="panel-trip-detail-note-prefix">${escapeHtml(prefix)}</span>`
                : '';
            return `
                <div class="panel-trip-detail-note-row">
                    ${prefixHtml}
                    <span class="panel-trip-detail-note-dot"${dotStyle}></span>
                    <span class="panel-trip-detail-note-line"${colorStyle}>${escapeHtml(descriptor.text)}</span>
                </div>
            `;
        };

        let rowsHtml = '';
        for (let i = 0; i < segmentsWithPast.length; i += 1) {
            const seg = segmentsWithPast[i];
            const prev = i > 0 ? segmentsWithPast[i - 1] : null;
            const next = i + 1 < segmentsWithPast.length ? segmentsWithPast[i + 1] : null;
            const sameAdjacentLineName = prev ? isSameLineName(prev.lineId, seg.lineId) : false;

            if (prev?.kind === 'pt' && !sameAdjacentLineName) {
                const desc = buildLineDescriptor(prev.lineId);
                rowsHtml += renderNoteRow('经由', desc);
            }

            if (seg.kind === 'nt' && prev && !sameAdjacentLineName) {
                const desc = buildLineDescriptor(seg.lineId);
                rowsHtml += renderNoteRow('直通', desc);
            }

            if (seg.kind === 'main' && prev && currentLineDesc?.text) {
                rowsHtml += renderNoteRow('', currentLineDesc);
            }

            rowsHtml += (seg.rows || []).map(renderStopRow).join('');

            const isNtSameLineAsMain = seg.kind === 'main'
                && next?.kind === 'nt'
                && isSameLineName(seg.lineId, next.lineId);

            if (seg.kind === 'main' && next && currentLineDesc?.text && !isNtSameLineAsMain) {
                rowsHtml += renderNoteRow('', currentLineDesc);
            }
        }

        try {
            const payloadSegments = segmentsWithPast.map((seg) => ({
                kind: seg.kind,
                lineId: toText(seg.lineId),
                stationIds: (seg.rows || []).map((r) => toText(r.stationId)).filter(Boolean)
            }));
            const mainSeg = segmentsWithPast.find((s) => s.kind === 'main') || null;
            const mainRows = Array.isArray(mainSeg?.rows) ? mainSeg.rows : [];
            const mainTerminalStationId = mainRows.length ? toText(mainRows[mainRows.length - 1]?.stationId) : '';
            const payload = {
                tripKey: toText(tripKey),
                selectedLineId: toText(lineId),
                mainLineId: toText(getTripLineId(trip) || lineId),
                mainTerminalStationId,
                hasNt,
                segments: payloadSegments
            };
            scheduleTripPreview({
                previewKey: `${toText(lineId)}||${toText(tripKey)}`,
                payload,
                immediate: !!pinned || tripLocked
            });
        } catch {
            // ignore
        }

        tripDetailBody.innerHTML = `
            <div class="panel-trip-detail-table">
                <div class="panel-trip-detail-head">
                    <div class="panel-trip-detail-station">车站</div>
                    <div class="panel-trip-detail-time panel-trip-detail-arrive">到站时间</div>
                    <div class="panel-trip-detail-time panel-trip-detail-depart">发车时间</div>
                </div>
                ${rowsHtml}
                <div class="panel-trip-detail-spacer"></div>
            </div>
        `;

        tripDetailRoot.classList.remove('is-hidden');

        const panelW = tripDetailRoot.offsetWidth || 280;
        const panelH = tripDetailRoot.offsetHeight || 240;
        const pad = 12;
        const panelRect = root.getBoundingClientRect?.();
        const panelLeft = panelRect?.left ?? (window.innerWidth - panelW - pad);
        const x = Math.max(pad, Math.min(panelLeft - panelW - pad + 10, window.innerWidth - panelW - pad + 10));
        const y = Math.max(pad, Math.min((clientY || 0) - 20, window.innerHeight - panelH - pad));
        tripDetailRoot.style.left = `${x}px`;
        tripDetailRoot.style.top = `${y}px`;
    };

    const hideTripDetail = () => {
        clearTripHighlightTimer();
        tripHighlightAppliedKey = null;
        unlockTripPreview();
        tripDetailToken += 1;
        clearTripDetailHideTimer();
        tripDetailRoot.classList.add('is-hidden');
        try {
            onTripClear?.();
        } catch {
            // ignore
        }
    };

    const MAX_PANEL_MARQUEE_ANIMS = 30;

    const scheduleMarqueeApply = (rootEl) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            const raf = window.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            if (rootEl.__panelMarqueeRafId) {
                try {
                    window.cancelAnimationFrame?.(rootEl.__panelMarqueeRafId);
                } catch {
                    // ignore
                }
                rootEl.__panelMarqueeRafId = 0;
            }

            // One/two RAFs help ensure scrollWidth is correct for flex layouts.
            rootEl.__panelMarqueeRafId = raf(() => {
                rootEl.__panelMarqueeRafId = raf(() => {
                    rootEl.__panelMarqueeRafId = 0;
                    const used = applyDirHeaderMarquees(rootEl, MAX_PANEL_MARQUEE_ANIMS);
                    const remain = Math.max(0, MAX_PANEL_MARQUEE_ANIMS - used);
                    applyTimetableDestMarquees(rootEl, remain);
                    hookTimetableScrollMarquee(rootEl);
                });
            });
        } catch {
            // ignore
        }
    };

    const applyDirHeaderMarquees = (rootEl, maxAnims = Number.POSITIVE_INFINITY) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            if (!('animate' in Element.prototype)) return;

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            if (reduceMotion) return 0;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-dir-marquee'));
            let started = 0;
            for (const marqueeEl of marquees) {
                if (started >= maxAnims) break;
                const innerEl = marqueeEl.querySelector('.panel-dir-marquee-inner');
                if (!innerEl) continue;

                // cancel previous animation on this element (if any)
                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }

                // reset
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                const viewportW = marqueeEl.clientWidth || 0;
                const contentW = innerEl.scrollWidth || 0;
                if (!viewportW || contentW <= viewportW + 1) continue;

                const distancePx = Math.max(0, contentW - viewportW);
                if (!distancePx) continue;

                const holdMs = 2000;
                const speedPxPerSec = 35; // readable pace
                const travelMs = Math.max(1500, Math.round((distancePx / speedPxPerSec) * 1000));
                const totalMs = holdMs + travelMs + holdMs + holdMs;

                const startHoldOffset = holdMs / totalMs;
                const endMoveOffset = (holdMs + travelMs) / totalMs;
                const endHoldOffset = (holdMs + travelMs + holdMs) / totalMs;
                const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

                const anim = innerEl.animate(
                    [
                        { transform: 'translateX(0px)', offset: 0 },
                        { transform: 'translateX(0px)', offset: startHoldOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endMoveOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endHoldOffset },
                        { transform: 'translateX(0px)', offset: resetOffset },
                        { transform: 'translateX(0px)', offset: 1 }
                    ],
                    {
                        duration: totalMs,
                        iterations: Infinity,
                        easing: 'linear'
                    }
                );

                marqueeEl.__panelMarqueeAnim = anim;
                started += 1;
            }
            return started;
        } catch {
            // ignore
            return 0;
        }
    };

    const applyTimetableDestMarquees = (rootEl, maxAnims = MAX_PANEL_MARQUEE_ANIMS) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            if (!('animate' in Element.prototype)) return;

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            if (reduceMotion) return;

            const marquees = Array.from(rootEl.querySelectorAll('.panel-timetable-dest-marquee'));
            const candidates = [];

            for (const marqueeEl of marquees) {
                const innerEl = marqueeEl.querySelector('.panel-timetable-dest-marquee-inner');
                if (!innerEl) continue;

                // cancel previous animation on this element (if any)
                try {
                    marqueeEl.__panelMarqueeAnim?.cancel?.();
                } catch {
                    // ignore
                }

                // reset
                innerEl.style.transform = '';
                marqueeEl.__panelMarqueeAnim = null;

                const viewportW = marqueeEl.clientWidth || 0;
                const contentW = innerEl.scrollWidth || 0;
                if (!viewportW || contentW <= viewportW + 1) continue;

                // Prefer visible rows (within the nearest timetable scroller) to get marquee first.
                const rowEl = marqueeEl.closest?.('.panel-timetable-row');
                const containerEl = marqueeEl.closest?.('.panel-timetable');
                let score = 1e9;
                if (rowEl && containerEl) {
                    const rr = rowEl.getBoundingClientRect?.();
                    const cr = containerEl.getBoundingClientRect?.();
                    if (rr && cr) {
                        const visible = rr.bottom > cr.top && rr.top < cr.bottom;
                        if (visible) score = 0;
                        else score = Math.min(Math.abs(rr.top - cr.bottom), Math.abs(rr.bottom - cr.top));
                    }
                }

                candidates.push({ marqueeEl, innerEl, viewportW, contentW, score });
            }

            candidates.sort((a, b) => a.score - b.score);

            let started = 0;
            for (const c of candidates) {
                if (started >= maxAnims) break;
                started += 1;

                const distancePx = Math.max(0, c.contentW - c.viewportW);
                if (!distancePx) continue;

                const holdMs = 3000;
                const speedPxPerSec = 30;
                const travelMs = Math.max(1200, Math.round((distancePx / speedPxPerSec) * 1000));
                const totalMs = holdMs + travelMs + holdMs + holdMs;

                const startHoldOffset = holdMs / totalMs;
                const endMoveOffset = (holdMs + travelMs) / totalMs;
                const endHoldOffset = (holdMs + travelMs + holdMs) / totalMs;
                const resetOffset = Math.min(0.999, endHoldOffset + 0.001);

                const anim = c.innerEl.animate(
                    [
                        { transform: 'translateX(0px)', offset: 0 },
                        { transform: 'translateX(0px)', offset: startHoldOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endMoveOffset },
                        { transform: `translateX(${-distancePx}px)`, offset: endHoldOffset },
                        { transform: 'translateX(0px)', offset: resetOffset },
                        { transform: 'translateX(0px)', offset: 1 }
                    ],
                    {
                        duration: totalMs,
                        iterations: Infinity,
                        easing: 'linear'
                    }
                );

                c.marqueeEl.__panelMarqueeAnim = anim;
            }
        } catch {
            // ignore
        }
    };

    const hookTimetableScrollMarquee = (rootEl) => {
        try {
            if (!rootEl || !(rootEl instanceof Element)) return;
            if (typeof window === 'undefined') return;
            const raf = window.requestAnimationFrame;
            if (typeof raf !== 'function') return;

            const bodies = Array.from(rootEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of bodies) {
                if (bodyEl.__panelDestMarqueeHooked) continue;
                bodyEl.__panelDestMarqueeHooked = true;

                let pending = false;
                bodyEl.addEventListener(
                    'scroll',
                    () => {
                        if (pending) return;
                        pending = true;
                        raf(() => {
                            pending = false;
                            const remain = Math.max(0, MAX_PANEL_MARQUEE_ANIMS - applyDirHeaderMarquees(bodyEl, MAX_PANEL_MARQUEE_ANIMS));
                            applyTimetableDestMarquees(bodyEl, remain);
                        });
                    },
                    { passive: true }
                );
            }
        } catch {
            // ignore
        }
    };

    const renderAllTimetables = async () => {
        const token = ++timetableRenderToken;
        const stationId = currentStationId;
        const lineEls = Array.from(body.querySelectorAll('[data-line-id]'));
        for (const el of lineEls) {
            await renderTimetableForLineEl(el, stationId, token);
        }
    };

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

        const dirEl = target.closest?.('[data-dir-toggle]');
        if (dirEl && body.contains(dirEl)) {
            const lineEl = dirEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const dirKey = dirEl.getAttribute?.('data-dir-key');
            return lineId && dirKey ? { kind: 'dir-toggle', value: `${String(lineId)}||${String(dirKey)}` } : null;
        }

        // Clicking/scrolling inside timetable list should not trigger line/company selection.
        const insideTimetable = target.closest?.('.panel-timetable');
        if (insideTimetable && body.contains(insideTimetable)) return null;

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

        if (tripLocked) {
            const t = evt?.target;
            const rowEl = t?.closest?.('.panel-timetable-row');
            const lineEl = rowEl?.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl?.getAttribute?.('data-trip-key');
            const rowKey = lineId && tripKey ? `${String(lineId)}||${String(tripKey)}` : null;
            if (rowKey && rowKey === lockedTripKey) {
                clearTripDetailHideTimer();
            } else if (!(t && tripDetailRoot.contains(t))) {
                hideTripDetail();
                lastTripDetailKey = null;
                // 点到其他位置即取消固定；本次触摸不继续触发其他车次预览
                if (rowKey && rowKey !== lockedTripKey) {
                    stopPropagationOnly(evt);
                    return;
                }
            }
        }

        if (!isTouchLikePointer(pt)) return;

        const rowEl = evt?.target?.closest?.('.panel-timetable-row');
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                const key = `${String(lineId)}||${String(tripKey)}`;
                if (tripLocked && key !== lockedTripKey) {
                    hideTripDetail();
                    lastTripDetailKey = null;
                    stopPropagationOnly(evt);
                    return;
                }
                stopPropagationOnly(evt);
                if (tripArmedKey !== key) {
                    tripArmedKey = key;
                    renderTripDetail({
                        lineId: String(lineId),
                        tripKey: String(tripKey),
                        clientX: evt?.clientX || 0,
                        clientY: evt?.clientY || 0,
                        pinned: tripLocked && key === lockedTripKey
                    });
                    lastTripDetailKey = key;
                    return;
                }

                tripArmedKey = null;
                lockTripPreview(key);
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true
                });
                lastTripDetailKey = key;
                return;
            }
        }

        const t = getInteractiveTarget(evt);
        if (!t) {
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        if (t.kind === 'dir-toggle') {
            const [lineId, dirKey] = String(t.value).split('||');
            tapArmedKey = null;
            mouseArmedKey = null;
            setDirExpanded(lineId, dirKey, !isDirExpanded(lineId, dirKey));
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
                return;
            }

            tapArmedKey = null;
            if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
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
        if (tripLocked) return;
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

        const rowEl = evt?.target?.closest?.('.panel-timetable-row');
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                const key = `${String(lineId)}||${String(tripKey)}`;
                stopEvent(evt);
                if (tripLocked && key !== lockedTripKey) {
                    hideTripDetail();
                    lastTripDetailKey = null;
                    return;
                }

                tripArmedKey = null;
                lockTripPreview(key);
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true
                });
                lastTripDetailKey = key;
                return;
            }
        }

        if (tripLocked) {
            const t = evt?.target;
            if (!(t && tripDetailRoot.contains(t))) {
                hideTripDetail();
                lastTripDetailKey = null;
            }
        }

        const t = getInteractiveTarget(evt);
        if (!t) return;

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;

        if (t.kind === 'dir-toggle') {
            const [lineId, dirKey] = String(t.value).split('||');
            mouseArmedKey = null;
            setDirExpanded(lineId, dirKey, !isDirExpanded(lineId, dirKey));
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);
            const key = `line:${lineId}`;
            if (mouseArmedKey === key) {
                mouseArmedKey = null;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
                return;
            }

            mouseArmedKey = key;
            if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
            return;
        }

        if (t.kind === 'company' && onSelectCompany) {
            onSelectCompany(String(t.value), {
                source: 'panel-click',
                stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
            });
        }
    };

    const onBodyLeave = (evt) => {
        clearTripHighlightTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        mouseArmedKey = null;
        restoreStationLinesIfNeeded();
        if (tripLocked) return;
        const toEl = evt?.relatedTarget;
        if (toEl && tripDetailRoot.contains(toEl)) return;
        if (!tripDetailPinned) scheduleTripDetailHide();
    };

    body.addEventListener('pointerdown', onBodyPointerDown, { passive: false });
    body.addEventListener('mousemove', onBodyMove);
    body.addEventListener('mouseleave', onBodyLeave);
    body.addEventListener('click', onBodyClick, { passive: false });

    body.addEventListener('mouseover', (evt) => {
        if (isTouchLikePointer(lastPointerType)) return;
        const rowEl = evt?.target?.closest?.('.panel-timetable-row');
        if (!rowEl || !body.contains(rowEl)) return;
        const lineEl = rowEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const tripKey = rowEl.getAttribute?.('data-trip-key');
        if (!lineId || !tripKey) return;
        const key = `${lineId}||${tripKey}`;
        if (tripLocked && key !== lockedTripKey) return;
        if (key === lastTripDetailKey && !tripDetailPinned) {
            const pendingSame = tripHighlightCandidateKey === key;
            const appliedSame = tripHighlightAppliedKey === key;
            if (pendingSame || appliedSame) return;
        }

        clearTripDetailHideTimer();
        clearTripHighlightTimer();
        renderTripDetail({
            lineId: String(lineId),
            tripKey: String(tripKey),
            clientX: evt?.clientX || 0,
            clientY: evt?.clientY || 0,
            pinned: false
        });
        lastTripDetailKey = key;
    });

    body.addEventListener('mouseout', (evt) => {
        clearTripHighlightTimer();
        if (tripLocked) return;
        if (tripDetailPinned) return;
        const rowEl = evt?.target?.closest?.('.panel-timetable-row');
        if (!rowEl || !body.contains(rowEl)) return;
        const toEl = evt?.relatedTarget;
        if (toEl && (rowEl.contains(toEl) || tripDetailRoot.contains(toEl))) return;
        scheduleTripDetailHide();
    });

    document.addEventListener('click', (evt) => {
        const target = evt?.target;
        if (!tripDetailPinned && !tripLocked) return;
        if (target && tripDetailRoot.contains(target)) return;
        if (target && root.contains(target)) {
            const rowEl = target.closest?.('.panel-timetable-row');
            const lineEl = rowEl?.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl?.getAttribute?.('data-trip-key');
            const key = lineId && tripKey ? `${String(lineId)}||${String(tripKey)}` : null;
            if (tripLocked && key && key === lockedTripKey) return;
            // panel 内除“已锁定同一车次”外，其他位置都取消固定
            hideTripDetail();
            lastTripDetailKey = null;
            return;
        }
        hideTripDetail();
        lastTripDetailKey = null;
    });

    // 布局：高度与 menu 一致（80% 屏高），top 为 10% 屏高
    const layout = () => {
        const h = window.innerHeight;
        const top = Math.round(h * 0.1);
        const height = Math.round(h * 0.8);

        root.style.top = `${top}px`;
        root.style.height = `${height}px`;

        // 保持可配置：允许通过 CSS 调整圆角
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
        hideTripDetail();
        root.style.transform = 'translateX(calc(100% + 24px))';
    };

    const setTitle = (text) => {
        title.textContent = toText(text);
        try {
            adjustPanelTitleFit(title);
        } catch {
            // ignore
        }
    };

    const adjustPanelTitleFit = (el) => {
        if (!el || !(el instanceof Element)) return;
        // Reset to single-line nowrap to test fitting
        el.classList.remove('is-multiline');
        el.style.whiteSpace = 'nowrap';
        // Start from configured 30px down to 20px
        const maxFs = 30;
        const minFs = 25;
        let fitted = false;
        for (let fs = maxFs; fs >= minFs; fs -= 1) {
            el.style.fontSize = `${fs}px`;
            // Force layout
            const fits = (el.scrollWidth || 0) <= (el.clientWidth || 0) + 1;
            if (fits) {
                fitted = true;
                break;
            }
        }

        if (!fitted) {
            // Set min font size and allow two lines with clamp
            el.style.fontSize = `${minFs}px`;
            el.style.whiteSpace = 'normal';
            el.classList.add('is-multiline');
        }
    };

    const showForStationProps = (props) => {
        const name = readStationName(props);
        setTitle(name);

        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);

        // 用 serving_ids 驱动交互恢复/公司过滤
        const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
        currentStationServingIds = servingIdsRaw.map(String).filter(Boolean);
        expandedDirKeys = new Set();
        mouseArmedKey = null;
        lastAppliedHoverKey = null;
        tapArmedKey = null;
        clearHoverTimer();
        clearRestoreTimer();
        clearTripHighlightTimer();
        hideTripDetail();
        lastTripDetailKey = null;

        // 渲染 popup 同结构的内容（公司分组 + 线路）
        body.innerHTML = buildCompaniesHtml(props || {}, { getLineMeta, companyLogoMap });

        // 默认折叠态：填充每条线路的“未来最近 3 条”班次
        renderAllTimetables();

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
