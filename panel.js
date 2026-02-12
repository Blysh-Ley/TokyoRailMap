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
    return isNextDaySegment ? `+${s}` : s;
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
            ? `<img class="panel-company-logo" src="${escapeHtml(logoSrc)}" alt="" />`
            : '';

        let linesHtml = '';
        for (const line of lines) {
            const style = typeof line.color === 'string' && line.color.trim() ? ` style="color:${escapeHtml(line.color.trim())}"` : '';
            const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';

            // 线路条目：标题行 + 折叠按钮 + 班次列表容器（初始为空，showForStationProps 后异步填充）
            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-header">
                        <span class="panel-line-name">${escapeHtml(line.displayName)}</span>
                        <span class="panel-line-toggle" data-line-toggle="1" aria-hidden="true">▸</span>
                    </div>
                    <div class="panel-timetable is-collapsed" data-timetable-root="1"></div>
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
    header.appendChild(dayToggle);

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

    // per-line expand state within current station view
    let expandedLineIds = new Set();
    let mouseArmedKey = null;
    let timetableRenderToken = 0;

    const setLineExpanded = (lineId, expanded) => {
        const id = toText(lineId);
        if (!id) return;
        if (expanded) expandedLineIds.add(id);
        else expandedLineIds.delete(id);

        const el = body.querySelector(`[data-line-id="${escapeHtml(id)}"]`);
        if (!el) return;
        const toggle = el.querySelector('[data-line-toggle]');
        const tt = el.querySelector('[data-timetable-root]');
        if (toggle) toggle.textContent = expanded ? '▾' : '▸';
        if (tt) {
            tt.classList.toggle('is-expanded', expanded);
            tt.classList.toggle('is-collapsed', !expanded);
        }
    };

    const getLineExpanded = (lineId) => expandedLineIds.has(toText(lineId));

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

    const buildTimetableRowsHtml = async ({ lineId, stationId, limit, showAll = false }) => {
        const stationKey = toText(stationId);
        if (!stationKey) return '';

        const [stationsIndex, trainTypesIndex, data] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            loadTimetableForLineId(lineId)
        ]);

        const list = Array.isArray(data) ? data : [];
        if (!list.length) return '';

        const now = Date.now();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));
        const rows = [];

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

            const arr = toText(stop?.a);
            const dep = toText(stop?.d);
            const timeStr = dep || arr;
            const parsed = parseHHMMToServiceDayMs(timeStr, serviceDayStartMs);
            if (!timeStr || !parsed) continue;
            const timeMs = parsed.ms;

            const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
            const destId = toText(ds?.[0]);
            const destName = destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '';

            const typeId = toText(trip?.y);
            const typeName = typeId ? (trainTypesIndex.get(typeId) || typeId) : '';

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
                typeName
            });
        }

        if (!rows.length) return '';
        rows.sort((a, b) => a.timeMs - b.timeMs);

        let selected = rows;
        if (!showAll) {
            const future = rows.filter((r) => !r.isPast);
            const n = Number.isFinite(limit) && limit > 0 ? limit : 3;
            selected = future.slice(0, n);
        }

        const renderTime = (r) => {
            const a = toText(r.arr);
            const d = toText(r.dep);
            if (!a && !d) return '';
            if (!a) return `<span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
            if (!d) return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span>`;
            if (a === d) return `<span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
            return `<span class="panel-time-arrive">${escapeHtml(formatTimeWithPlus(a, r.arrPlus))}</span> <span class="panel-time-depart">${escapeHtml(formatTimeWithPlus(d, r.depPlus))}</span>`;
        };

        let html = '';
        for (const r of selected) {
            const klass = r.isPast ? 'panel-timetable-row is-past' : 'panel-timetable-row';
            html += `
                <div class="${klass}">
                    <div class="panel-timetable-dest">to ${escapeHtml(r.destName || '')}</div>
                    <div class="panel-timetable-time">${renderTime(r)}</div>
                    <div class="panel-timetable-type">${escapeHtml(r.typeName || '')}</div>
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

        const expanded = getLineExpanded(lineId);
        const limit = expanded ? 0 : 3;

        // collapsed: strictly future-only; expanded: allow filling with past if future不足（灰色）
        const html = await buildTimetableRowsHtml({
            lineId,
            stationId: resolvedStationId || stationId,
            limit,
            showAll: expanded
        });

        if (token !== timetableRenderToken) return;
        ttEl.innerHTML = html;

        // 展开态：默认把可视区域滚到“最后一条已过班次”处，使窗口呈现 1 条已过 + 后面 9 条未来。
        if (expanded) {
            try {
                const rows = Array.from(ttEl.querySelectorAll('.panel-timetable-row'));
                if (rows.length) {
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
                        const maxScroll = Math.max(0, (ttEl.scrollHeight || 0) - (ttEl.clientHeight || 0));
                        ttEl.scrollTop = Math.max(0, Math.min(desired, maxScroll));
                    } else {
                        ttEl.scrollTop = 0;
                    }
                }
            } catch {
                // ignore
            }
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

        // Clicking/scrolling inside timetable list should not trigger line/company selection.
        const insideTimetable = target.closest?.('[data-timetable-root]');
        if (insideTimetable && body.contains(insideTimetable)) return null;

        const toggleEl = target.closest?.('[data-line-toggle]');
        if (toggleEl && body.contains(toggleEl)) {
            const lineEl = toggleEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            return lineId ? { kind: 'line-toggle', value: String(lineId) } : null;
        }

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
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        const key = `${t.kind}:${t.value}`;

        if (t.kind === 'line-toggle') {
            setLineExpanded(String(t.value), !getLineExpanded(String(t.value)));
            // async refresh just this line
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(t.value))}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);

            // First tap: expand timetable + preview
            if (!getLineExpanded(lineId)) {
                setLineExpanded(lineId, true);
                const lineEl = body.querySelector(`[data-line-id="${escapeHtml(lineId)}"]`);
                const token = ++timetableRenderToken;
                renderTimetableForLineEl(lineEl, currentStationId, token);
                tapArmedKey = key;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
                return;
            }

            // Second tap: commit selection (keep existing two-step behavior)
            if (tapArmedKey !== key) {
                tapArmedKey = key;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
                return;
            }

            tapArmedKey = null;
            if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
            // 收回展开列表
            setLineExpanded(lineId, false);
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

        if (t.kind === 'line-toggle') {
            const lineId = String(t.value);
            setLineExpanded(lineId, !getLineExpanded(lineId));
            const lineEl = body.querySelector(`[data-line-id="${escapeHtml(lineId)}"]`);
            const token = ++timetableRenderToken;
            renderTimetableForLineEl(lineEl, currentStationId, token);
            return;
        }

        if (t.kind === 'line') {
            const lineId = String(t.value);
            const key = `line:${lineId}`;

            // First click: expand + preview
            if (!getLineExpanded(lineId)) {
                setLineExpanded(lineId, true);
                const lineEl = body.querySelector(`[data-line-id="${escapeHtml(lineId)}"]`);
                const token = ++timetableRenderToken;
                renderTimetableForLineEl(lineEl, currentStationId, token);
                mouseArmedKey = key;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-hover' });
                return;
            }

            // Second click on same line: commit selection
            if (mouseArmedKey === key) {
                mouseArmedKey = null;
                if (onSelectLine) onSelectLine(lineId, { source: 'panel-click', isolateStations: true });
                // 收回展开列表
                setLineExpanded(lineId, false);
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

    const onBodyLeave = () => {
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        tapArmedKey = null;
        mouseArmedKey = null;
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
        root.style.transform = 'translateX(calc(100% + 24px))';
    };

    const setTitle = (text) => {
        title.textContent = toText(text);
    };

    const showForStationProps = (props) => {
        const name = readStationName(props);
        setTitle(name);

        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);

        // 用 serving_ids 驱动交互恢复/公司过滤
        const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
        currentStationServingIds = servingIdsRaw.map(String).filter(Boolean);
        expandedLineIds = new Set();
        mouseArmedKey = null;
        lastAppliedHoverKey = null;
        tapArmedKey = null;
        clearHoverTimer();
        clearRestoreTimer();

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
