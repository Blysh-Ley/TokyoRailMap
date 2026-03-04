/**
 * 右侧弹出界面：点击站点/站名时展示站名标题。
 * 约束：不引入新配色/主题；panel 样式使用 panel-* 前缀与 search/popup/menu 隔离。
 */

import { sortTypeNamesByBaseAndStopCount } from './train-type-sort.js';

const toText = (v) => String(v ?? '').trim();

const panelIsDarkThemeActive = () => {
    try {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
        return false;
    }
};

const panelParseCssColorToRgb = (input) => {
    const s = String(input || '').trim();
    if (!s) return null;

    const hex = s.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        const raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            const r = parseInt(raw[0] + raw[0], 16);
            const g = parseInt(raw[1] + raw[1], 16);
            const b = parseInt(raw[2] + raw[2], 16);
            return { r, g, b };
        }
        if (raw.length === 6 || raw.length === 8) {
            const r = parseInt(raw.slice(0, 2), 16);
            const g = parseInt(raw.slice(2, 4), 16);
            const b = parseInt(raw.slice(4, 6), 16);
            return { r, g, b };
        }
    }

    const rgb = s.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
    if (rgb) {
        const r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
        const g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
        const b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
        return { r, g, b };
    }

    return null;
};

const panelRgbToHex = ({ r, g, b }) => {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

const panelRelativeLuminance = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const PANEL_DARK_INVERT_TRIGGER_LUMINANCE = (() => {
    const ref = panelParseCssColorToRgb('#005AAA');
    return ref ? panelRelativeLuminance(ref) : 0.102;
})();

const panelAdjustColorForDarkThemeIfNeeded = (color) => {
    const parsed = panelParseCssColorToRgb(color);
    if (!parsed) return toText(color);

    const lum = panelRelativeLuminance(parsed);
    if (!(lum < PANEL_DARK_INVERT_TRIGGER_LUMINANCE)) return toText(color);

    const inverted = {
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    };
    return panelRgbToHex(inverted);
};

const resolveTrainTypeColorForTheme = (color) => {
    const raw = toText(color);
    if (!raw) return raw;
    if (!panelIsDarkThemeActive()) return raw;
    return panelAdjustColorForDarkThemeIfNeeded(raw);
};

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

const parseTripServiceDayFromId = (tripId) => {
    const id = toText(tripId);
    if (!id) return '';
    const m = id.match(/\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    if (m?.[1]) return m[1];
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

let html2canvasPromise = null;
const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
        return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.html2canvasLib = src;
    s.addEventListener('load', () => {
        s.dataset.loaded = '1';
        resolve();
    }, { once: true });
    s.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
    document.head.appendChild(s);
});

const ensureHtml2canvas = async () => {
    if (html2canvasPromise) return html2canvasPromise;
    html2canvasPromise = (async () => {
        await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        if (!window.html2canvas) throw new Error('html2canvas 未加载');
        return window.html2canvas;
    })();
    return html2canvasPromise;
};

const nowIsoCompact = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return [
        d.getFullYear(),
        pad(d.getMonth() + 1),
        pad(d.getDate()),
        '-',
        pad(d.getHours()),
        pad(d.getMinutes()),
        pad(d.getSeconds())
    ].join('');
};

const sanitizeFilePart = (s) => String(s || '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
    .slice(0, 120);

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const canvasToBlobPng = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob 返回空结果'));
        }, 'image/png');
    } catch (err) {
        reject(err);
    }
});

const collectScrollableState = (rootEl) => {
    const states = [];
    if (!(rootEl instanceof HTMLElement)) return states;
    const nodes = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];
    for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const cs = window.getComputedStyle(node);
        const overflowY = toText(cs.overflowY || cs.overflow).toLowerCase();
        const overflowX = toText(cs.overflowX || cs.overflow).toLowerCase();
        const canScrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
        const canScrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
        const needsExpand = (canScrollY && node.scrollHeight > node.clientHeight + 1)
            || (canScrollX && node.scrollWidth > node.clientWidth + 1)
            || node === rootEl;
        if (!needsExpand) continue;

        states.push({
            node,
            height: node.style.height,
            maxHeight: node.style.maxHeight,
            overflowY: node.style.overflowY,
            overflowX: node.style.overflowX,
            scrollTop: node.scrollTop,
            scrollLeft: node.scrollLeft
        });

        if (node === rootEl) {
            node.style.height = 'auto';
            node.style.maxHeight = 'none';
        }
        if (canScrollY && node.scrollHeight > node.clientHeight + 1) {
            node.style.overflowY = 'visible';
            node.style.maxHeight = 'none';
            node.style.height = `${node.scrollHeight}px`;
        }
        if (canScrollX && node.scrollWidth > node.clientWidth + 1) {
            node.style.overflowX = 'visible';
        }
    }
    return states;
};

const restoreScrollableState = (states) => {
    for (const s of Array.isArray(states) ? states : []) {
        const node = s?.node;
        if (!(node instanceof HTMLElement)) continue;
        node.style.height = s.height;
        node.style.maxHeight = s.maxHeight;
        node.style.overflowY = s.overflowY;
        node.style.overflowX = s.overflowX;
        node.scrollTop = Number(s.scrollTop) || 0;
        node.scrollLeft = Number(s.scrollLeft) || 0;
    }
};

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportElementToPng = async (element, filenameBase, buttonEl) => {
    if (!(element instanceof HTMLElement)) return;
    const btn = buttonEl instanceof HTMLButtonElement ? buttonEl : null;
    const prevDisabled = btn?.disabled;
    const EXPORT_CLASS = 'is-panel-trip-detail-exporting';
    let exportStyleEl = null;
    try {
        if (btn) btn.disabled = true;
        const html2canvas = await ensureHtml2canvas();
        const states = collectScrollableState(element);
        await nextFrame();
        await nextFrame();
        let blob = null;
        try {
            document.documentElement.classList.add(EXPORT_CLASS);
            if (!document.querySelector('style[data-panel-trip-detail-export-style="1"]')) {
                exportStyleEl = document.createElement('style');
                exportStyleEl.setAttribute('data-panel-trip-detail-export-style', '1');
                exportStyleEl.textContent = `
                    html.${EXPORT_CLASS} .panel-trip-detail {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                    html.${EXPORT_CLASS} .panel-trip-detail .panel-trip-detail-capture-btn {
                        display: none !important;
                    }
                `;
                document.head.appendChild(exportStyleEl);
            }

            const canvas = await html2canvas(element, {
                useCORS: true,
                backgroundColor: '#fff',
                logging: false,
                scale: Math.max(2, Math.ceil(window.devicePixelRatio || 1))
            });
            blob = await canvasToBlobPng(canvas);
        } finally {
            document.documentElement.classList.remove(EXPORT_CLASS);
            if (exportStyleEl) {
                try { exportStyleEl.remove(); } catch { /* ignore */ }
                exportStyleEl = null;
            }
            restoreScrollableState(states);
        }
        const base = sanitizeFilePart(filenameBase) || 'panel';
        downloadBlob(blob, `${base}-${nowIsoCompact()}.png`);
    } catch (err) {
        console.error('[panel] export png failed', err);
    } finally {
        if (btn) btn.disabled = !!prevDisabled;
    }
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

let trainTypeColorIndexPromise = null;
const getTrainTypeColorIndex = async () => {
    if (trainTypeColorIndexPromise) return trainTypeColorIndexPromise;
    trainTypeColorIndexPromise = (async () => {
        try {
            const resp = await fetch('./data/train-types.json');
            if (!resp.ok) return new Map();
            const list = await resp.json();
            const map = new Map();
            for (const t of Array.isArray(list) ? list : []) {
                const id = toText(t?.id);
                if (!id) continue;
                const color = toText(t?.title?.color);
                if (!color) continue;
                map.set(id, color);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return trainTypeColorIndexPromise;
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

function buildCompaniesHtml(props = {}, { getLineMeta, companyLogoMap, lineStationNameByLineId, railwaysOrderIndex } = {}) {
    const servingIdsRaw = normalizeArrayLike(props.serving_ids);
    const servingIds = servingIdsRaw.map(String).filter(Boolean);
    const servingLinesRaw = normalizeArrayLike(props.serving_lines);
    const servingLines = servingLinesRaw.map(String).filter(Boolean);

    const safeGetLineMeta = typeof getLineMeta === 'function' ? getLineMeta : (() => null);
    const logoMap = companyLogoMap || {};
    const orderIndex = railwaysOrderIndex instanceof Map ? railwaysOrderIndex : null;

    const toRailwaysOrderKey = (lineId) => {
        const raw = String(lineId ?? '').trim();
        if (!raw) return '';
        const parts = raw.split('.');
        const company = String(parts[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = String(parts.slice(1).join('') ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!company || !name) return '';
        return `${company}-${name}`;
    };

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
        // 同公司内线路排序：按 /data/railways-order.json 的顺序（若传入）
        const sortedLines = (() => {
            if (!orderIndex || !orderIndex.size) return Array.isArray(lines) ? lines : [];
            const src = Array.isArray(lines) ? lines : [];
            const decorated = src.map((line, idx) => {
                const k = toRailwaysOrderKey(line?.lineId);
                const r = k ? orderIndex.get(k) : undefined;
                const rank = (typeof r === 'number' && Number.isFinite(r)) ? r : Number.POSITIVE_INFINITY;
                return { line, idx, rank };
            });
            decorated.sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                return a.idx - b.idx;
            });
            return decorated.map((x) => x.line);
        })();

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
        for (const line of sortedLines) {
            const style = typeof line.color === 'string' && line.color.trim() ? ` style="color:${escapeHtml(line.color.trim())}"` : '';
            const idAttr = line.lineId ? ` data-line-id="${escapeHtml(String(line.lineId))}"` : '';
            const transferStationName = line.lineId
                ? toText(lineStationNameByLineId?.get?.(line.lineId) || lineStationNameByLineId?.[line.lineId])
                : '';
            const suffixHtml = transferStationName
                ? `<span class="panel-line-name-suffix">（${escapeHtml(transferStationName)}站）</span>`
                : '';

            // 线路条目：标题行 + 班次容器（内部按方向 d 分组；方向可展开/收回）
            linesHtml += `
                <div class="panel-line"${idAttr}${style}>
                    <div class="panel-line-header">
                        <span class="panel-line-name">${escapeHtml(line.displayName)}${suffixHtml}</span>
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
    const TIMETABLE_PRINT_EVENT = '__TokyoRailPrintTimetableRequested';
    const TIMETABLE_PRINT_ALL_EVENT = '__TokyoRailPrintAllTimetablesRequested';
    const widthPx = Number.isFinite(options.widthPx) ? options.widthPx : 320;
    const rightPx = Number.isFinite(options.rightPx) ? options.rightPx : 20;
    const zIndex = Number.isFinite(options.zIndex) ? options.zIndex : 9999;

    const hoverDelayMs = Number.isFinite(options.hoverDelayMs) ? options.hoverDelayMs : 50;
    const primaryHoverDelayMs = 500;
    const getLineMeta = typeof options.getLineMeta === 'function' ? options.getLineMeta : (() => null);
    const companyLogoMap = options.companyLogoMap || {};
    const railwaysOrderIndex = options.railwaysOrderIndex instanceof Map ? options.railwaysOrderIndex : null;
    const onSelectCompany = typeof options.onSelectCompany === 'function' ? options.onSelectCompany : null;
    const onSelectLine = typeof options.onSelectLine === 'function' ? options.onSelectLine : null;
    const onRestoreStationLines = typeof options.onRestoreStationLines === 'function' ? options.onRestoreStationLines : null;
    const onTripPreview = typeof options.onTripPreview === 'function' ? options.onTripPreview : null;
    const onTripClear = typeof options.onTripClear === 'function' ? options.onTripClear : null;
    const onTripCurrentStationShow = typeof options.onTripCurrentStationShow === 'function' ? options.onTripCurrentStationShow : null;
    const onTripCurrentStationHide = typeof options.onTripCurrentStationHide === 'function' ? options.onTripCurrentStationHide : null;
    const onTripDetailStationIndicator = typeof options.onTripDetailStationIndicator === 'function' ? options.onTripDetailStationIndicator : null;
    const onTripDetailStationIndicatorClear = typeof options.onTripDetailStationIndicatorClear === 'function' ? options.onTripDetailStationIndicatorClear : null;
    const onDirPreviewEnter = typeof options.onDirPreviewEnter === 'function' ? options.onDirPreviewEnter : null;
    const onDirPreviewLeave = typeof options.onDirPreviewLeave === 'function' ? options.onDirPreviewLeave : null;
    const settingsContentEl = options.settingsContentEl && options.settingsContentEl.appendChild ? options.settingsContentEl : null;
    const getTimetableViewMode = typeof options.getTimetableViewMode === 'function' ? options.getTimetableViewMode : null;
    const getHoverPreviewEnabled = typeof options.getHoverPreviewEnabled === 'function' ? options.getHoverPreviewEnabled : null;
    const getMultiSelectModeEnabled = typeof options.getMultiSelectModeEnabled === 'function' ? options.getMultiSelectModeEnabled : null;
    let hoverPreviewEnabled = getHoverPreviewEnabled ? getHoverPreviewEnabled() !== false : true;
    const isHoverPreviewEnabled = () => hoverPreviewEnabled !== false;
    const isMultiSelectModeEnabled = () => getMultiSelectModeEnabled ? getMultiSelectModeEnabled() === true : false;

    const buildTransferLineStationNameMap = async ({ stationId, stationNameZh, servingLineIds }) => {
        const sid = toText(stationId);
        const clickedName = toText(stationNameZh);
        const lineIds = Array.isArray(servingLineIds) ? servingLineIds.map((x) => toText(x)).filter(Boolean) : [];
        const out = new Map();
        if (!sid || !lineIds.length) return out;

        try {
            const [groupsIndex, stationsIndex] = await Promise.all([getStationGroupsIndex(), getStationsIndex()]);
            const groupIdsRaw = groupsIndex?.get?.(sid);
            const groupIds = Array.isArray(groupIdsRaw) && groupIdsRaw.length
                ? groupIdsRaw.map((x) => toText(x)).filter(Boolean)
                : [sid];

            for (const lineId of lineIds) {
                const candidateId = groupIds.find((gid) => gid === lineId || gid.startsWith(`${lineId}.`));
                if (!candidateId) continue;
                const transferName = toText(stationsIndex?.idToNameZh?.get?.(candidateId) || '');
                if (!transferName) continue;
                if (clickedName && transferName === clickedName) continue;
                out.set(lineId, transferName);
            }
        } catch {
            return out;
        }

        return out;
    };

    const root = document.createElement('div');
    root.setAttribute('data-panel-root', '');
    root.style.position = 'fixed';
    root.style.right = `${rightPx}px`;
    root.style.zIndex = 9000;
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
    header.style.borderBottom = '1px solid var(--ui-border, #e3e5e7)';

    const title = document.createElement('div');
    title.setAttribute('data-panel-title', '');
    title.style.flex = '1 1 auto';
    title.style.fontSize = '30px';
    title.style.lineHeight = '1.2';
    title.style.fontWeight = '700';
    title.style.color = 'var(--ui-text, #111)';
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

    const dayPrintBtn = document.createElement('button');
    dayPrintBtn.type = 'button';
    dayPrintBtn.className = 'panel-day-print-btn is-hidden';
    dayPrintBtn.setAttribute('data-day-print-btn', '1');
    dayPrintBtn.setAttribute('aria-label', '打印本站全部方向时刻表');
    const dayPrintIcon = document.createElement('img');
    dayPrintIcon.className = 'panel-day-print-icon';
    dayPrintIcon.alt = '';
    {
        const candidates = ['./icons/print.svg', '/icons/print.svg'];
        let idx = 0;
        dayPrintIcon.src = candidates[idx];
        dayPrintIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) dayPrintIcon.src = candidates[idx];
        });
    }
    dayPrintBtn.appendChild(dayPrintIcon);
    dayToggle.appendChild(dayPrintBtn);

    // 时间控件：覆盖 panel 中的“当前时间”（用于判断已过/未来与默认定位）
    const timeControl = document.createElement('div');
    timeControl.className = 'settings-item-control settings-time-control';

    const timeInput = document.createElement('input');
    timeInput.className = 'settings-time-input';
    timeInput.type = 'text';
    timeInput.inputMode = 'numeric';
    timeInput.placeholder = 'HH:MM';
    timeInput.maxLength = 5;
    timeInput.value = '';

    const btnAutoNow = document.createElement('button');
    btnAutoNow.type = 'button';
    btnAutoNow.className = 'settings-time-reset';
    btnAutoNow.title = '恢复自动时间';
    btnAutoNow.setAttribute('aria-label', '恢复自动时间');
    const autoNowIcon = document.createElement('img');
    autoNowIcon.className = 'settings-time-reset-icon';
    autoNowIcon.alt = '';
    {
        const candidates = ['./icons/clockwise.svg', '/icons/clockwise.svg'];
        let idx = 0;
        autoNowIcon.src = candidates[idx];
        autoNowIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) autoNowIcon.src = candidates[idx];
        });
    }
    btnAutoNow.appendChild(autoNowIcon);

    const timeOps = document.createElement('div');
    timeOps.className = 'settings-time-ops';
    timeOps.appendChild(timeInput);
    timeOps.appendChild(btnAutoNow);

    const timePicker = document.createElement('div');
    timePicker.className = 'settings-time-picker is-hidden';
    timePicker.style.position = 'fixed';
    timePicker.style.zIndex = String(zIndex + 3);

    const timePickerHourCol = document.createElement('div');
    timePickerHourCol.className = 'settings-time-picker-col';
    const timePickerHourList = document.createElement('div');
    timePickerHourList.className = 'settings-time-picker-list';
    timePickerHourCol.appendChild(timePickerHourList);

    const timePickerMinuteCol = document.createElement('div');
    timePickerMinuteCol.className = 'settings-time-picker-col';
    const timePickerMinuteList = document.createElement('div');
    timePickerMinuteList.className = 'settings-time-picker-list';
    timePickerMinuteCol.appendChild(timePickerMinuteList);

    const timePickerState = {
        open: false,
        hour: null,
        minute: null,
        hourButtons: [],
        minuteButtons: []
    };

    const setTimePickerOpenState = (open) => {
        try {
            window.__TokyoRailTimePickerOpen = !!open;
        } catch {
            // ignore
        }
    };

    const formatTwoDigits = (v) => String(Number(v)).padStart(2, '0');
    const normalizeHHMM = (value) => {
        const s = toText(value);
        const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return '';
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
        return `${formatTwoDigits(hh)}:${formatTwoDigits(mm)}`;
    };

    const parsePickerSeed = () => {
        const normalized = normalizeHHMM(timeInput.value);
        if (normalized) {
            const [h, m] = normalized.split(':').map((x) => Number(x));
            return { hour: h, minute: m };
        }

        const now = new Date();
        return { hour: now.getHours(), minute: now.getMinutes() };
    };

    const applyPickerSelectionUi = () => {
        for (const btn of timePickerState.hourButtons) {
            const selected = Number(btn?.dataset?.value) === timePickerState.hour;
            btn.classList.toggle('is-selected', selected);
        }
        for (const btn of timePickerState.minuteButtons) {
            const selected = Number(btn?.dataset?.value) === timePickerState.minute;
            btn.classList.toggle('is-selected', selected);
        }
    };

    const scrollPickerSelectionIntoView = () => {
        const hourBtn = timePickerState.hourButtons.find((x) => Number(x?.dataset?.value) === timePickerState.hour);
        const minuteBtn = timePickerState.minuteButtons.find((x) => Number(x?.dataset?.value) === timePickerState.minute);
        hourBtn?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        minuteBtn?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    };

    const applyPickerValueToInput = () => {
        if (!Number.isFinite(timePickerState.hour) || !Number.isFinite(timePickerState.minute)) return;
        const value = `${formatTwoDigits(timePickerState.hour)}:${formatTwoDigits(timePickerState.minute)}`;
        if (toText(timeInput.value) !== value) {
            timeInput.value = value;
            timeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    };

    const positionTimePicker = () => {
        if (!timePickerState.open) return;
        const rect = timeInput.getBoundingClientRect();
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const pickerRect = timePicker.getBoundingClientRect();
        const pickerW = Math.max(168, Math.ceil(pickerRect.width || 168));
        const pickerH = Math.max(120, Math.ceil(pickerRect.height || 196));
        const gap = 6;

        let left = rect.right - pickerW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - pickerW - 8)));

        const canShowBelow = rect.bottom + gap + pickerH <= viewportH - 8;
        const top = canShowBelow
            ? Math.min(viewportH - pickerH - 8, rect.bottom + gap)
            : Math.max(8, rect.top - gap - pickerH);

        timePicker.style.left = `${Math.round(left)}px`;
        timePicker.style.top = `${Math.round(top)}px`;
    };

    const closeTimePicker = () => {
        if (!timePickerState.open) return;
        timePickerState.open = false;
        timePicker.classList.add('is-hidden');
        setTimePickerOpenState(false);
    };

    const openTimePicker = () => {
        const seed = parsePickerSeed();
        timePickerState.hour = seed.hour;
        timePickerState.minute = seed.minute;
        applyPickerSelectionUi();
        timePicker.classList.remove('is-hidden');
        timePickerState.open = true;
        setTimePickerOpenState(true);
        scrollPickerSelectionIntoView();
        positionTimePicker();
    };

    const confirmTimePickerSelection = () => {
        applyPickerValueToInput();
        closeTimePicker();
    };

    const buildPickerOptionButton = (value, type) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-time-picker-option';
        btn.textContent = formatTwoDigits(value);
        btn.dataset.value = String(value);
        btn.dataset.type = type;
        btn.addEventListener('click', (evt) => {
            stopEvent(evt);
            if (type === 'hour') timePickerState.hour = value;
            else timePickerState.minute = value;
            applyPickerSelectionUi();
            scrollPickerSelectionIntoView();
        }, { passive: false });
        return btn;
    };

    const timePickerActions = document.createElement('div');
    timePickerActions.className = 'settings-time-picker-actions';

    const timePickerCancelBtn = document.createElement('button');
    timePickerCancelBtn.type = 'button';
    timePickerCancelBtn.className = 'settings-time-picker-btn settings-time-picker-btn-cancel';
    timePickerCancelBtn.textContent = '取消';
    timePickerCancelBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        closeTimePicker();
    }, { passive: false });

    const timePickerConfirmBtn = document.createElement('button');
    timePickerConfirmBtn.type = 'button';
    timePickerConfirmBtn.className = 'settings-time-picker-btn settings-time-picker-btn-confirm';
    timePickerConfirmBtn.textContent = '确认';
    timePickerConfirmBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        confirmTimePickerSelection();
    }, { passive: false });

    timePickerActions.appendChild(timePickerCancelBtn);
    timePickerActions.appendChild(timePickerConfirmBtn);

    for (let h = 0; h < 24; h += 1) {
        const btn = buildPickerOptionButton(h, 'hour');
        timePickerState.hourButtons.push(btn);
        timePickerHourList.appendChild(btn);
    }
    for (let m = 0; m < 60; m += 1) {
        const btn = buildPickerOptionButton(m, 'minute');
        timePickerState.minuteButtons.push(btn);
        timePickerMinuteList.appendChild(btn);
    }

    timePicker.appendChild(timePickerHourCol);
    timePicker.appendChild(timePickerMinuteCol);
    timePicker.appendChild(timePickerActions);
    timePicker.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    timePicker.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    timePicker.addEventListener('click', (e) => stopEvent(e), { passive: false });
    document.body.appendChild(timePicker);

    timeControl.appendChild(timeOps);

    controls.appendChild(dayToggle);
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

    // 地图右上：站名开关下方的时间控件浮层（z-index 高于 panel）
    const timeOverlay = document.createElement('div');
    timeOverlay.className = 'settings-top-timebar';
    timeOverlay.style.display = 'flex';
    timeOverlay.appendChild(daySeg);
    timeOverlay.appendChild(timeControl);
    timeOverlay.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('pointermove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('touchmove', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('wheel', (e) => stopPropagationOnly(e), { passive: true });
    timeOverlay.addEventListener('click', (e) => stopEvent(e), { passive: false });
    timeOverlay.style.position = 'fixed';
    timeOverlay.style.zIndex = 8000;
    document.body.appendChild(timeOverlay);

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

    const tripDetailCaptureBtn = document.createElement('button');
    tripDetailCaptureBtn.type = 'button';
    tripDetailCaptureBtn.className = 'panel-capture-btn panel-trip-detail-capture-btn';
    tripDetailCaptureBtn.setAttribute('aria-label', '截图');
    tripDetailCaptureBtn.title = '截图';
    tripDetailCaptureBtn.innerHTML = '<img class="panel-capture-icon panel-trip-detail-capture-icon" alt="" src="./icons/camera.svg" />';
    tripDetailCaptureBtn.addEventListener('click', async (evt) => {
        stopEvent(evt);
        tripDetailPinned = true;
        clearTripDetailHideTimer();
        const baseName = `trip-detail-${toText(currentStationNameZh) || 'line'}`;
        await exportElementToPng(tripDetailRoot, baseName, tripDetailCaptureBtn);
    }, { passive: false });
    const tripDetailCaptureIcon = tripDetailCaptureBtn.querySelector('.panel-trip-detail-capture-icon');
    if (tripDetailCaptureIcon instanceof HTMLImageElement) {
        tripDetailCaptureIcon.addEventListener('error', () => {
            if (tripDetailCaptureIcon.dataset.fallbackTried === '1') return;
            tripDetailCaptureIcon.dataset.fallbackTried = '1';
            tripDetailCaptureIcon.src = '/icons/camera.svg';
        });
    }
    tripDetailHeader.appendChild(tripDetailCaptureBtn);

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
    tripDetailRoot.addEventListener('click', (e) => {
        // 仅阻止冒泡：避免点详情面板触发“空白处点击=恢复选择”等全局逻辑
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

    let hoverTimerId = null;
    let hoverCandidateKey = null;
    let lastFiredHoverKey = null;
    let lastMousePrimaryKey = '';
    let suppressMouseClickUntilMs = 0;
    let suppressMouseHoverUntilMs = 0;
    let routeMapPopoverHoverActive = false;
    let pendingTouchTripTap = null;

    const touchTripTapMaxMovePx = 12;
    const touchTripTapMaxMoveSq = touchTripTapMaxMovePx * touchTripTapMaxMovePx;

    let lastAppliedHoverKey = null;
    let restoreTimerId = null;
    const restoreDelayMs = Math.max(hoverDelayMs, 60);

    let currentStationServingIds = [];
    let currentStationId = null;
    let currentStationNameZh = '';
    let stationRenderToken = 0;

    // 时刻表日类型过滤
    let currentServiceDay = 'Weekday'; // 'Weekday' | 'SaturdayHoliday'

    // 可选：覆盖显示的“当前时间”（HH:MM）；为空则使用真实时间
    let currentNowOverrideHHMM = '';
    let isAutoNowClock = true;
    let autoNowClockTimerId = null;
    let isPanelVisible = false;
    const getDisplayNowMs = () => {
        const baseNowMs = Date.now();
        const hhmm = toText(currentNowOverrideHHMM);
        if (!hhmm) return baseNowMs;
        const serviceDayStartMs = getServiceDayStartMs(new Date(baseNowMs));
        const parsed = parseHHMMToServiceDayMs(hhmm, serviceDayStartMs);
        return parsed?.ms || baseNowMs;
    };

    const formatNowHHMM = (d = new Date()) => {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    const syncAutoNowClock = ({ forceRender = false } = {}) => {
        if (!isAutoNowClock) return;
        const hhmm = formatNowHHMM(new Date());
        if (toText(timeInput.value) !== hhmm) {
            timeInput.value = hhmm;
        }

        const changed = toText(currentNowOverrideHHMM) !== hhmm;
        currentNowOverrideHHMM = hhmm;

        if ((changed || forceRender) && toText(currentStationId)) {
            if (forceRender || !isPanelVisible) {
                renderAllTimetables();
            }
        }
    };

    const startAutoNowClock = () => {
        if (autoNowClockTimerId != null) return;
        syncAutoNowClock({ forceRender: false });
        autoNowClockTimerId = setInterval(() => {
            syncAutoNowClock({ forceRender: false });
        }, 15000);
    };

    const restoreAutoNowClock = () => {
        isAutoNowClock = true;
        syncAutoNowClock({ forceRender: true });
    };

    let timetableRenderToken = 0;
    let lastTripDetailKey = null;
    let tripLocked = false;
    let lockedTripKey = null;
    const tripHighlightDelayMs = 500;
    let tripHighlightTimerId = null;
    let tripHighlightCandidateKey = null;
    let tripHighlightAppliedKey = null;

    let tripDetailToken = 0;
    let tripDetailPinned = false;
    let tripDetailHideTimer = null;
    let timetableViewMode = 'list';
    let pendingGridDataDebugLog = false;
    const gridDataDebugByLineId = new Map();

    const normalizeTimetableViewMode = (mode) => (mode === 'grid' ? 'grid' : 'list');

    const hasLatin = (text) => /[A-Za-z]/.test(toText(text));
    const hasCjk = (text) => /[\u3400-\u9FFF]/.test(toText(text));

    const extractDisplayChars = (text) => {
        const s = toText(text);
        if (!s) return [];
        return Array.from(s).filter((ch) => /[A-Za-z0-9\u3400-\u9FFF]/.test(ch));
    };

    const buildTypeAbbr = (typeNameRaw) => {
        const typeName = toText(typeNameRaw);
        if (!typeName) return '';

        const latin = hasLatin(typeName);
        const cjk = hasCjk(typeName);

        if (latin && cjk) {
            const englishParts = typeName.match(/[A-Za-z]+/g) || [];
            const enAbbr = englishParts.map((part) => part[0]?.toUpperCase?.() || '').join('');
            const zhChars = Array.from(typeName).filter((ch) => /[\u3400-\u9FFF]/.test(ch));
            const zhAbbr = zhChars.length ? zhChars[0] : '';
            const mixed = `${enAbbr}${zhAbbr}`;
            return mixed || typeName;
        }

        if (latin && !cjk) {
            const m = typeName.match(/[A-Za-z]/);
            return m ? m[0].toUpperCase() : typeName;
        }

        if (cjk && !latin) {
            const chars = Array.from(typeName).filter((ch) => /[\u3400-\u9FFF]/.test(ch));
            const len = chars.length;
            if (len >= 4) return `${chars[0]}${chars[2]}`;
            if (len > 0 && len <= 3) return typeName;
        }

        const fallbackChars = extractDisplayChars(typeName);
        return fallbackChars.length ? fallbackChars[0].toUpperCase?.() || fallbackChars[0] : typeName;
    };

    const buildUniqueLeadAbbrMap = (orderedNames) => {
        const names = Array.isArray(orderedNames) ? orderedNames.map((x) => toText(x)).filter(Boolean) : [];
        const tokens = names.map((name) => {
            const chars = extractDisplayChars(name);
            return chars.length ? chars : Array.from(name);
        });
        const idx = new Array(tokens.length).fill(0);

        const pick = (tokenChars, i) => {
            if (!Array.isArray(tokenChars) || !tokenChars.length) return '';
            const pos = Math.max(0, Math.min(i, tokenChars.length - 1));
            return tokenChars[pos] || tokenChars[tokenChars.length - 1] || '';
        };

        for (let round = 0; round < 12; round += 1) {
            const bucket = new Map();
            for (let i = 0; i < tokens.length; i += 1) {
                const abbr = pick(tokens[i], idx[i]);
                if (!bucket.has(abbr)) bucket.set(abbr, []);
                bucket.get(abbr).push(i);
            }

            let changed = false;
            for (const [, indices] of bucket.entries()) {
                if (!Array.isArray(indices) || indices.length <= 1) continue;
                for (const i of indices) {
                    if (idx[i] < tokens[i].length - 1) {
                        idx[i] += 1;
                        changed = true;
                    }
                }
            }
            if (!changed) break;
        }

        const out = new Map();
        for (let i = 0; i < names.length; i += 1) {
            out.set(names[i], pick(tokens[i], idx[i]));
        }
        return out;
    };

    const NO_MARK_TYPE_NAMES = new Set(['各站停车', '普通']);

    const isNoMarkTypeName = (typeNameRaw) => NO_MARK_TYPE_NAMES.has(toText(typeNameRaw));

    const getNoMarkTerminalFullName = (terminalHints) => {
        const first = Array.isArray(terminalHints) ? terminalHints[0] : null;
        return toText(first?.full);
    };

    const buildDirectionGridHints = (rowsForDir) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir : [];

        const typeCount = new Map();
        const typeColorByName = new Map();
        const typeStopCountByName = new Map();
        const terminalCount = new Map();

        for (const row of rows) {
            const typeName = toText(row?.typeName);
            if (typeName) {
                typeCount.set(typeName, (typeCount.get(typeName) || 0) + 1);
                if (!typeColorByName.has(typeName)) {
                    const c = resolveTrainTypeColorForTheme(row?.typeColor);
                    if (c) typeColorByName.set(typeName, c);
                }
                const stopCount = Number(row?.stopCount);
                if (Number.isFinite(stopCount) && stopCount > 0) {
                    const prev = Number(typeStopCountByName.get(typeName));
                    typeStopCountByName.set(
                        typeName,
                        Number.isFinite(prev) ? Math.min(prev, stopCount) : stopCount
                    );
                }
            }

            const terminalName = toText(row?.terminalName || row?.destName);
            if (terminalName) terminalCount.set(terminalName, (terminalCount.get(terminalName) || 0) + 1);
        }

        const typeNames = sortTypeNamesByBaseAndStopCount(Array.from(typeCount.keys()), typeCount, typeStopCountByName);
        const typeHints = typeNames.map((name) => ({
            full: name,
            abbr: buildTypeAbbr(name),
            color: toText(typeColorByName.get(name)) || '#888',
            count: Number(typeCount.get(name) || 0)
        }));

        const terminalNames = Array.from(terminalCount.entries())
            .sort((a, b) => {
                const dc = Number(b[1] || 0) - Number(a[1] || 0);
                if (dc) return dc;
                return String(a[0]).localeCompare(String(b[0]));
            })
            .map(([name]) => name);
        const terminalAbbrMap = buildUniqueLeadAbbrMap(terminalNames);
        const terminalHints = terminalNames.map((name) => ({
            full: name,
            abbr: toText(terminalAbbrMap.get(name)) || toText(name).slice(0, 1),
            count: Number(terminalCount.get(name) || 0)
        }));

        return { typeHints, terminalHints };
    };

    const applyTimetableViewMode = (mode, { rerender = true } = {}) => {
        const next = normalizeTimetableViewMode(mode);
        timetableViewMode = next;
        body.setAttribute('data-timetable-view', next);
        body.classList.toggle('is-timetable-view-list', next === 'list');
        body.classList.toggle('is-timetable-view-grid', next === 'grid');
        dayPrintBtn.classList.toggle('is-hidden', next !== 'grid');
        if (rerender && toText(currentStationId)) renderAllTimetables();
    };

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

    const showTripCurrentStationHint = async ({ lineId, token } = {}) => {
        if (!onTripCurrentStationShow) return;

        let sid = toText(currentStationId);
        const lid = toText(lineId);
        if (lid) {
            const resolved = await resolveStationIdForLine(lid);
            sid = toText(resolved) || sid;
        }

        if (token != null && token !== tripDetailToken) return;
        if (!sid) return;

        try {
            onTripCurrentStationShow({ stationId: sid });
        } catch {
            // ignore
        }
    };

    const hideTripCurrentStationHint = () => {
        if (!onTripCurrentStationHide) return;
        try {
            onTripCurrentStationHide();
        } catch {
            // ignore
        }
    };

    const showTripDetailStationIndicator = (stationId) => {
        if (!onTripDetailStationIndicator) return;
        const sid = toText(stationId);
        if (!sid) return;
        try {
            onTripDetailStationIndicator({ stationId: sid });
        } catch {
            // ignore
        }
    };

    const clearTripDetailStationIndicator = () => {
        if (!onTripDetailStationIndicatorClear) return;
        try {
            onTripDetailStationIndicatorClear();
        } catch {
            // ignore
        }
    };

    const scheduleTripPreview = ({ previewKey, payload, immediate }) => {
        if (!onTripPreview) return;
        if (!immediate && !isHoverPreviewEnabled()) return;

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
        tripDetailPinned = false;
    };

    // expanded state per (lineId, direction)
    let expandedDirKeys = new Set();
    const dirFilterStateByKey = new Map(); // lineId||dir -> { origins:Set, terminals:Set, types:Set }
    const dirFilterRowsByKey = new Map(); // lineId||dir -> Array<{origin,terminal,type}>
    const dirPrintPayloadByKey = new Map(); // lineId||dir -> export payload for print-timetables.js
    const dirPreviewMetaByKey = new Map(); // lineId||dir -> { lineId, originStationIds:string[], terminalStationIds:string[] }
    let activeDirPreviewKey = '';
    let pinnedDirPreviewKey = '';
    let pinnedPanelSelection = null; // { kind:'line'|'company'|'dir'|'trip', key:string }
    const makeLineDirKey = (lineId, dirKey) => `${toText(lineId)}||${toText(dirKey) || 'Unknown'}`;
    const dirKeyOf = (lineId, dir) => `${toText(lineId)}||${toText(dir) || 'Unknown'}`;
    const isLoopLine = (lineId) => {
        const s = toText(lineId);
        return s === 'JR-East.Yamanote' || s === 'Toei.Oedo';
    };
    const isDirExpanded = (lineId, dir) => expandedDirKeys.has(dirKeyOf(lineId, dir));
    const setDirExpanded = (lineId, dir, expanded) => {
        const k = dirKeyOf(lineId, dir);
        if (!k) return;
        if (expanded) expandedDirKeys.add(k);
        else expandedDirKeys.delete(k);
    };

    const applyDirPreviewByKey = (lineDirKey, { force = false, fitMode } = {}) => {
        if (isMultiSelectModeEnabled()) return;
        const key = toText(lineDirKey);
        if (!key) return;
        if (!force && activeDirPreviewKey === key) return;
        const meta = dirPreviewMetaByKey.get(key);
        if (!meta) return;
        activeDirPreviewKey = key;
        try {
            onDirPreviewEnter?.({
                lineId: toText(meta.lineId),
                originStationIds: Array.isArray(meta.originStationIds) ? meta.originStationIds.slice() : [],
                terminalStationIds: Array.isArray(meta.terminalStationIds) ? meta.terminalStationIds.slice() : [],
                fitMode: toText(fitMode)
            });
        } catch {
            // ignore
        }
    };

    const clearDirPreview = () => {
        if (!activeDirPreviewKey) return;
        activeDirPreviewKey = '';
        try {
            onDirPreviewLeave?.();
        } catch {
            // ignore
        }
    };

    const pinDirPreviewByKey = (lineDirKey) => {
        pinnedDirPreviewKey = toText(lineDirKey) || '';
    };

    const unpinDirPreview = () => {
        pinnedDirPreviewKey = '';
    };

    const clearPinnedDirPreview = () => {
        unpinDirPreview();
        clearDirPreview();
    };

    const setPinnedPanelSelection = (kind, key) => {
        const k = toText(kind);
        const v = toText(key);
        if (!k || !v) {
            pinnedPanelSelection = null;
            body.classList.remove('is-pinned');
            return;
        }
        pinnedPanelSelection = { kind: k, key: v };
        body.classList.add('is-pinned');
    };

    const getCurrentPinnedInteractionKey = () => {
        if (tripLocked && toText(lockedTripKey)) return `trip:${toText(lockedTripKey)}`;
        if (pinnedPanelSelection?.kind && pinnedPanelSelection?.key) {
            return `${toText(pinnedPanelSelection.kind)}:${toText(pinnedPanelSelection.key)}`;
        }
        if (toText(pinnedDirPreviewKey)) return `dir:${toText(pinnedDirPreviewKey)}`;
        return '';
    };

    const hasPinnedPanelState = () => !!getCurrentPinnedInteractionKey();

    const isDirFilterPinned = () => {
        // 仅“方向筛选按钮点击后”的固定态允许被时刻表 hover 打断。
        // 其他固定态（公司/线路/车次锁定）仍然禁止 hover 变更。
        const k = toText(pinnedPanelSelection?.kind);
        const key = toText(pinnedPanelSelection?.key);
        const pinnedDir = toText(pinnedDirPreviewKey);
        return k === 'dir' && !!pinnedDir && key === pinnedDir;
    };

    // 从 timetable row/grid-cell 向上查找所属 lineId + dirKey，判断是否与 pinnedDirPreviewKey 同方向
    const isTripRowInPinnedDir = (rowEl) => {
        if (!(rowEl instanceof Element)) return false;
        const pinnedDir = toText(pinnedDirPreviewKey);
        if (!pinnedDir) return false;

        const dirBody = rowEl.closest?.('[data-dir-body][data-dir-key]');
        const lineEl = rowEl.closest?.('[data-line-id]');
        if (!dirBody || !lineEl) return false;

        const dirKey = toText(dirBody.getAttribute('data-dir-key'));
        const lineId = toText(lineEl.getAttribute('data-line-id'));
        if (!dirKey || !lineId) return false;

        return makeLineDirKey(lineId, dirKey) === pinnedDir;
    };

    const getInteractionKeyFromTarget = (target) => {
        const rowEl = findTripTarget(target);
        if (rowEl && body.contains(rowEl)) {
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) return `trip:${String(lineId)}||${String(tripKey)}`;
        }

        const dirFilter = getDirFilterButtonTarget(target);
        if (dirFilter) return `dir:${makeLineDirKey(dirFilter.lineId, dirFilter.dirKey)}`;

        const dirPrint = getDirPrintButtonTarget(target);
        if (dirPrint) return `dir:${makeLineDirKey(dirPrint.lineId, dirPrint.dirKey)}`;

        const dirTitle = getDirTitleTarget(target);
        if (dirTitle) return `dir:${makeLineDirKey(dirTitle.lineId, dirTitle.dirKey)}`;

        const dirTriangle = getDirTriangleTarget(target);
        if (dirTriangle) return `dir:${makeLineDirKey(dirTriangle.lineId, dirTriangle.dirKey)}`;

        const lineId = getLineTarget(target);
        if (lineId) return `line:${String(lineId)}`;

        const company = getCompanyTarget(target);
        if (company) return `company:${String(company)}`;

        return '';
    };

    const restoreStationDefaultSelection = () => {
        if (!onRestoreStationLines) return;
        try {
            onRestoreStationLines(
                Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [],
                { stationId: toText(currentStationId) || null }
            );
        } catch {
            // ignore
        }
    };

    const clearPinnedPanelState = ({ restoreStation = true } = {}) => {
        const hadPinned = hasPinnedPanelState();
        pinnedPanelSelection = null;
        body.classList.remove('is-pinned');
        if (tripLocked || tripDetailPinned) {
            hideTripDetail();
            lastTripDetailKey = null;
        }
        if (pinnedDirPreviewKey) {
            clearPinnedDirPreview();
        }
        if (restoreStation) {
            lastAppliedHoverKey = null;
            restoreStationDefaultSelection();
        }
        return hadPinned;
    };

    const applyDayToggleUi = () => {
        const day = currentServiceDay;
        btnWeekday.classList.toggle('is-active', day === 'Weekday');
        btnHoliday.classList.toggle('is-active', day === 'SaturdayHoliday');
    };

    const notifyJourneyRecompute = () => {
        try {
            const ui = window?.TokyoRailJourneyUI;
            if (ui && typeof ui.recompute === 'function') {
                ui.recompute();
            }
        } catch {
            // ignore
        }
    };

    const setServiceDay = (day) => {
        const v = String(day || '').trim();
        if (v !== 'Weekday' && v !== 'SaturdayHoliday') return;
        if (currentServiceDay === v) return;
        currentServiceDay = v;
        applyDayToggleUi();
        renderAllTimetables();
        notifyJourneyRecompute();
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
        const normalized = normalizeHHMM(timeInput.value);
        const v = normalized || toText(timeInput.value) || '';
        if (!v) {
            isAutoNowClock = true;
            syncAutoNowClock({ forceRender: true });
            return;
        }

        isAutoNowClock = false;
        currentNowOverrideHHMM = v;
        renderAllTimetables();
        notifyJourneyRecompute();
    });
    timeInput.addEventListener('blur', () => {
        const normalized = normalizeHHMM(timeInput.value);
        if (normalized) timeInput.value = normalized;
    });
    timeInput.addEventListener('click', (e) => {
        stopEvent(e);
        openTimePicker();
    }, { passive: false });
    timeInput.addEventListener('focus', () => {
        openTimePicker();
    });
    window.addEventListener('resize', () => {
        positionTimePicker();
    });
    window.addEventListener('scroll', () => {
        positionTimePicker();
    }, true);
    document.addEventListener('pointerdown', (evt) => {
        if (!timePickerState.open) return;
        const t = evt?.target;
        if (t && (timeOps.contains(t) || timePicker.contains(t))) return;
        closeTimePicker();
    }, true);
    document.addEventListener('keydown', (evt) => {
        if (!timePickerState.open) return;
        if (evt?.key === 'Escape') {
            closeTimePicker();
            return;
        }
        if (evt?.key === 'Enter') {
            stopEvent(evt);
            confirmTimePickerSelection();
        }
    });
    btnAutoNow.addEventListener('click', (e) => {
        stopEvent(e);
        closeTimePicker();
        restoreAutoNowClock();
        notifyJourneyRecompute();
    }, { passive: false });

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
        const withDay = candidates.find((t) => parseTripServiceDayFromId(t?.id) === currentServiceDay);
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

    const toServiceHourIndex = (timeMs, serviceDayStartMs) => {
        const ms = Number(timeMs);
        const base = Number(serviceDayStartMs);
        if (!Number.isFinite(ms) || !Number.isFinite(base)) return null;
        return Math.floor((ms - base) / 3600000);
    };

    const formatServiceHourLabel = (serviceHourIndex) => {
        const idx = Number(serviceHourIndex);
        if (!Number.isFinite(idx)) return '';
        const hour = (SERVICE_DAY_BOUNDARY_HOUR + idx) % 24;
        return String((hour + 24) % 24).padStart(2, '0');
    };

    const chooseHourWindow = ({ minHour, maxHour, currentHour, expanded }) => {
        if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) return [];
        if (maxHour < minHour) return [];

        if (!expanded) {
            let start = Number.isFinite(currentHour) ? currentHour : minHour;
            if (start < minHour) start = minHour;
            if (start > maxHour) start = maxHour;
            const out = [];
            for (let hour = start; hour <= maxHour; hour += 1) out.push(hour);
            return out;
        }

        const size = 10;
        let start = currentHour - 1;
        if (!Number.isFinite(start)) start = minHour;

        if (start < minHour) start = minHour;
        if (start > maxHour) start = Math.max(minHour, maxHour - size + 1);

        let end = Math.min(maxHour, start + size - 1);
        if ((end - start + 1) < size) start = Math.max(minHour, end - size + 1);

        const out = [];
        for (let hour = start; hour <= end; hour += 1) out.push(hour);
        return out;
    };

    const buildGridHintsHtml = ({ typeHints, terminalHints }) => {
        const typeLegendItems = (Array.isArray(typeHints) ? typeHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                const color = toText(item?.color) || '#888';
                if (!full || !abbr) return '';
                if (isNoMarkTypeName(full)) {
                    return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}"><i>无标</i>=${escapeHtml(full)}</span>`;
                }
                const sameLabel = full === abbr;
                const text = sameLabel ? full : `${full}=${abbr}`;
                return `<span class="panel-grid-hint-item panel-grid-hint-item-type" style="color:${escapeHtml(color)}">${escapeHtml(text)}</span>`;
            })
            .filter(Boolean)
            .join('<span class="panel-grid-hint-sep"> / </span>');

        const noMarkTerminalFullName = getNoMarkTerminalFullName(terminalHints);
        const terminalLegendItems = (Array.isArray(terminalHints) ? terminalHints : [])
            .map((item) => {
                const full = toText(item?.full);
                const abbr = toText(item?.abbr);
                if (!full) return '';
                if (full === noMarkTerminalFullName) {
                    return `<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888"><i>无标</i>-${escapeHtml(full)}</span>`;
                }
                if (!abbr) return '';
                return `<span class="panel-grid-hint-item panel-grid-hint-item-terminal" style="color:#888">${escapeHtml(abbr)}−${escapeHtml(full)}</span>`;
            })
            .filter(Boolean)
            .join('<span class="panel-grid-hint-sep"> / </span>');

        return `
            <div class="panel-grid-hints">
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">种别：</span>
                    <span class="panel-grid-hint-content">${typeLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
                <div class="panel-grid-hint-line">
                    <span class="panel-grid-hint-label">终点站：</span>
                    <span class="panel-grid-hint-content">${terminalLegendItems || '<span class="panel-grid-hint-item" style="color:#888">无</span>'}</span>
                </div>
            </div>
        `;
    };

    const buildGridTableHtmlForDirection = ({
        rowsForDir,
        typeHints,
        terminalHints,
        expanded,
        nowMs,
        serviceDayStartMs
    }) => {
        const rows = Array.isArray(rowsForDir) ? rowsForDir.slice().sort((a, b) => (Number(a?.timeMs) || 0) - (Number(b?.timeMs) || 0)) : [];
        if (!rows.length) return '<div class="panel-timetable-empty">当前无班次</div>';

        const byHour = new Map();
        let minHour = Number.POSITIVE_INFINITY;
        let maxHour = Number.NEGATIVE_INFINITY;

        for (const row of rows) {
            const hour = Number(row?.serviceHourIndex);
            if (!Number.isFinite(hour)) continue;
            if (!byHour.has(hour)) byHour.set(hour, []);
            byHour.get(hour).push(row);
            if (hour < minHour) minHour = hour;
            if (hour > maxHour) maxHour = hour;
        }

        if (!Number.isFinite(minHour) || !Number.isFinite(maxHour)) {
            return '<div class="panel-timetable-empty">当前无班次</div>';
        }

        const currentHour = toServiceHourIndex(nowMs, serviceDayStartMs);
        const currentHourForFocus = Number.isFinite(currentHour)
            ? Math.max(minHour, Math.min(maxHour, currentHour))
            : minHour;
        const focusStartHour = currentHourForFocus;
        const hourWindow = expanded
            ? Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i)
            : chooseHourWindow({ minHour, maxHour, currentHour, expanded: false });
        if (!hourWindow.length) return '<div class="panel-timetable-empty">当前无班次</div>';

        const typeAbbrByName = new Map((Array.isArray(typeHints) ? typeHints : []).map((x) => [toText(x?.full), toText(x?.abbr)]));
        const terminalAbbrByName = new Map((Array.isArray(terminalHints) ? terminalHints : []).map((x) => [toText(x?.full), toText(x?.abbr)]));
        const noMarkTerminalFullName = getNoMarkTerminalFullName(terminalHints);

        const rowHtml = hourWindow.map((hour, idx) => {
            const trips = Array.isArray(byHour.get(hour)) ? byHour.get(hour) : [];
            const bgClass = idx % 2 === 0 ? 'is-alt-a' : 'is-alt-b';
            const focusAttr = expanded && hour === focusStartHour ? ' data-grid-focus-start="1"' : '';
            const currentAttr = (!expanded && hour === currentHourForFocus) ? ' data-grid-current-hour="1"' : '';

                const cellsHtml = trips.length
                ? trips.map((trip, tripIndex) => {
                const typeName = toText(trip?.typeName);
                const destName = toText(trip?.terminalName || trip?.destName);
                const typeAbbr = toText(typeAbbrByName.get(typeName)) || buildTypeAbbr(typeName);
                const destAbbr = toText(terminalAbbrByName.get(destName)) || toText(destName).slice(0, 1);
                const minute = toText(trip?.minuteLabel).slice(0, 2);
                const tripKey = toText(trip?.tripKey);
                const color = resolveTrainTypeColorForTheme(trip?.typeColor) || 'var(--ui-text, #111)';
                const tripAttr = tripKey ? ` data-trip-key="${escapeHtml(tripKey)}"` : '';
                const lastClass = tripIndex === trips.length - 1 ? ' is-hour-last' : '';
                const showTypeAbbr = !isNoMarkTypeName(typeName);
                const showDestAbbr = !(noMarkTerminalFullName && destName === noMarkTerminalFullName);
                const tripAbbrText = `${showTypeAbbr ? `[${typeAbbr}]` : ''}${showDestAbbr ? destAbbr : ''}`;
                const tripAbbrHtml = tripAbbrText
                    ? `<span class="panel-grid-trip-abbr">${escapeHtml(tripAbbrText)}</span>`
                    : '<span class="panel-grid-trip-abbr" aria-hidden="true">&nbsp;</span>';

                    const isTerminal = !!trip?.showTerminalLabel;

                    const pastClass = trip?.isPast ? ' is-past' : '';

                    return `
                        <div class="panel-grid-cell panel-grid-cell-trip${pastClass}${lastClass}"${tripAttr}>
                            <span class="panel-grid-trip${pastClass}" style="color:${escapeHtml(color)}">
                                ${tripAbbrHtml}
                                <span class="panel-grid-trip-minute"><span class="panel-grid-trip-minute-text">${escapeHtml(minute)}</span>${isTerminal ? '<span class="panel-grid-trip-minute-flag" aria-label="终点站">终</span>' : ''}</span>
                            </span>
                        </div>
                    `;
                }).join('')
                : '<div class="panel-grid-cell is-empty is-hour-last"></div>';

            return `
                <div class="panel-grid-row ${bgClass}"${focusAttr}${currentAttr} data-grid-hour="${escapeHtml(String(hour))}">
                    <div class="panel-grid-hour">${escapeHtml(formatServiceHourLabel(hour))}</div>
                    <div class="panel-grid-trips">
                        ${cellsHtml}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="panel-timetable-grid">${rowHtml}</div>`;
    };

    const findTripTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('.panel-timetable-row[data-trip-key], .panel-grid-cell[data-trip-key]') || null;
    };

    const buildTimetableRowsHtml = async ({ lineId, stationId }) => {
        const stationKey = toText(stationId);
        if (!stationKey) return '';

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex, data] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex(),
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
            const tripServiceDay = parseTripServiceDayFromId(tripId);
            if (tripServiceDay && tripServiceDay !== currentServiceDay) continue;

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
            const dir = toText(trip?.d);
            const isLoopDirection = /Loop/i.test(dir);
            const skipCrossTripFillForLoop = isLoopDirection && (hasPt || hasNt);

            const isOriginStation = os.some((x) => toText(x) === stationKey);
            const isTerminalStation = ds.some((x) => toText(x) === stationKey);

            // 真始发/真终点：没有 pt/nt 的端点站，不补全时间
            const showOriginLabel = isOriginStation && !hasPt;
            const showTerminalLabel = isTerminalStation && !hasNt;
            const allowMirrorFill = !(showOriginLabel || showTerminalLabel);

            // (2) If dep missing but has nt, take nt's first stop time as dep.
            if (!dep && !skipCrossTripFillForLoop) {
                const ntRefId = toText(ntRefs?.[0]);
                if (ntRefId) dep = await getNtFirstDepartTime(ntRefId);
            }

            // (2) If arr missing but has pt, take pt's last stop time as arr.
            if (!arr && !skipCrossTripFillForLoop) {
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
            const loopDest = (dir === 'InnerLoop' ? '内环' : (dir === 'OuterLoop' ? '外环' : ''));
            const destName = loopDest || (destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '');
            const originId = toText(os?.[0]);
            const originName = originId ? (stationsIndex?.idToNameZh?.get?.(originId) || originId) : '';
            const terminalName = loopDest || (destId ? (stationsIndex?.idToNameZh?.get?.(destId) || destId) : '');

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
            const typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';

            const tripKey = tripId || toText(trip?.t) || '';
            const baseTripKey = toText(trip?.t) || (tripId ? tripId.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '') : '');

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;

            rows.push({
                destName,
                destId,
                arr: arr || null,
                dep: dep || null,
                arrPlus: !!arrParsed?.isNextDaySegment,
                depPlus: !!depParsed?.isNextDaySegment,
                timeMs,
                serviceHourIndex: toServiceHourIndex(timeMs, serviceDayStartMs),
                minuteLabel: toText(timeStr).slice(3, 5),
                isPast: timeMs < now,
                typeName,
                typeColor,
                originId,
                originName,
                terminalId: destId,
                terminalName,
                dir,
                destNamesForDir,
                showOriginLabel,
                showTerminalLabel,
                tripKey,
                baseTripKey,
                stopCount: Array.isArray(tt) ? tt.length : null
            });
        }

        if (!rows.length) return '';

        // 去重：同一物理班次在同一站点可能被拆成多个记录（如 *.Weekday.1 / *.Weekday.2），
        // 且种别 y 可能不同，导致 UI 同一时刻出现“多条不同种别”。
        // 这里按 (baseTripKey + dir + timeMs) 合并，优先保留“有 dep 的记录”（更符合站点时刻表的上车语义）。
        {
            const pickScore = (r) => {
                let score = 0;
                if (toText(r?.dep)) score += 10;
                if (toText(r?.typeName)) score += 5;
                if (toText(r?.typeColor)) score += 2;
                if (toText(r?.terminalName) || toText(r?.destName)) score += 1;
                return score;
            };

            const merged = new Map();
            for (const r of rows) {
                const base = toText(r?.baseTripKey) || toText(r?.tripKey);
                const dkey = toText(r?.dir) || 'Unknown';
                const tms = Number(r?.timeMs);
                if (!base || !Number.isFinite(tms)) {
                    merged.set(Symbol('row'), r);
                    continue;
                }
                const key = `${base}||${dkey}||${tms}`;
                const prev = merged.get(key);
                if (!prev) {
                    merged.set(key, r);
                    continue;
                }

                const a = prev;
                const b = r;
                const keepB = pickScore(b) > pickScore(a);
                const primary = keepB ? b : a;
                const secondary = keepB ? a : b;

                // merge times
                if (!toText(primary.arr) && toText(secondary.arr)) {
                    primary.arr = secondary.arr;
                    primary.arrPlus = !!secondary.arrPlus;
                }
                if (!toText(primary.dep) && toText(secondary.dep)) {
                    primary.dep = secondary.dep;
                    primary.depPlus = !!secondary.depPlus;
                }

                // merge labels / metadata
                primary.showOriginLabel = !!(primary.showOriginLabel || secondary.showOriginLabel);
                primary.showTerminalLabel = !!(primary.showTerminalLabel || secondary.showTerminalLabel);

                if (!toText(primary.typeName) && toText(secondary.typeName)) primary.typeName = secondary.typeName;
                if (!toText(primary.typeColor) && toText(secondary.typeColor)) primary.typeColor = secondary.typeColor;
                if (!toText(primary.originId) && toText(secondary.originId)) primary.originId = secondary.originId;
                if (!toText(primary.originName) && toText(secondary.originName)) primary.originName = secondary.originName;
                if (!toText(primary.terminalId) && toText(secondary.terminalId)) primary.terminalId = secondary.terminalId;
                if (!toText(primary.terminalName) && toText(secondary.terminalName)) primary.terminalName = secondary.terminalName;

                merged.set(key, primary);
            }

            // keep insertion order stable (Map preserves)
            rows.length = 0;
            for (const v of merged.values()) rows.push(v);
        }

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

        const renderTimeForPrint = (r) => renderTime({ ...(r || {}), isPast: false });

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
        const directionDebug = [];
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
            const lineDirKey = makeLineDirKey(lineId, dirKey);
            const expanded = isDirExpanded(lineId, dirKey);
            const tri = expanded ? '▾' : '▸';

            const rowsForDir = rows.filter((r) => (toText(r.dir) || 'Unknown') === dirKey);
            const { typeHints, terminalHints } = buildDirectionGridHints(rowsForDir);
            const filterRowsForDir = rowsForDir
                .map((r) => ({
                    origin: toText(r.originName),
                    terminal: toText(r.terminalName || r.destName),
                    type: toText(r.typeName)
                }))
                .filter((r) => r.origin || r.terminal || r.type);
            dirFilterRowsByKey.set(lineDirKey, filterRowsForDir);

            const state = dirFilterStateByKey.get(lineDirKey) || { origins: new Set(), terminals: new Set(), types: new Set() };
            if (!dirFilterStateByKey.has(lineDirKey)) {
                dirFilterStateByKey.set(lineDirKey, state);
            }

            const filteredRowsForDir = rowsForDir.filter((r) => {
                const originOk = !state.origins.size || state.origins.has(toText(r.originName));
                const terminalOk = !state.terminals.size || state.terminals.has(toText(r.terminalName || r.destName));
                const typeOk = !state.types.size || state.types.has(toText(r.typeName));
                return originOk && terminalOk && typeOk;
            });

            const uniqueIds = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map((x) => toText(x)).filter(Boolean)));
            dirPreviewMetaByKey.set(lineDirKey, {
                lineId: toText(lineId),
                originStationIds: uniqueIds(filteredRowsForDir.map((r) => r.originId)),
                terminalStationIds: uniqueIds(filteredRowsForDir.map((r) => r.terminalId || r.destId))
            });

            const labelRows = filteredRowsForDir.length ? filteredRowsForDir : rowsForDir;
            const labelCount = new Map();
            for (const item of labelRows) {
                const names = Array.isArray(item.destNamesForDir) ? item.destNamesForDir : [];
                for (const n of names) {
                    const s = toText(n);
                    if (!s) continue;
                    labelCount.set(s, (labelCount.get(s) || 0) + 1);
                }
            }
            const labelEntries = Array.from(labelCount.entries())
                .sort((a, b) => {
                    const dc = Number(b[1]) - Number(a[1]);
                    if (dc) return dc;
                    return String(a[0]).localeCompare(String(b[0]));
                })
                .map(([name]) => name);
            const label = labelEntries.length ? labelEntries.join('，') : (filteredNames.length ? filteredNames.join('，') : dirKey);

            directionDebug.push({
                dirKey,
                dirLabel: label,
                typeHints,
                terminalHints
            });

            const timetableViewClass = timetableViewMode === 'grid' ? 'panel-timetable-view-grid' : 'panel-timetable-view-list';
            const gridHintsHtml = timetableViewMode === 'grid'
                ? buildGridHintsHtml({ typeHints, terminalHints })
                : '';
            const future = filteredRowsForDir.filter((r) => !r.isPast);
            const visible = expanded ? filteredRowsForDir : future.slice(0, 3);

            const printableRowsForDir = filteredRowsForDir.map((r) => ({ ...(r || {}), isPast: false }));
            const printableListHtml = printableRowsForDir.length
                ? printableRowsForDir
                    .map((r) => {
                        const tripAttr = r.tripKey ? ` data-trip-key="${escapeHtml(r.tripKey)}"` : '';
                        const typeStyle = toText(r.typeColor)
                            ? ` style="color:${escapeHtml(toText(r.typeColor))}"`
                            : '';
                        return `
                            <div class="panel-timetable-row"${tripAttr}>
                                <div class="panel-timetable-dest">
                                    <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                                    <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(r.destName || '')}">
                                        <span class="panel-timetable-dest-marquee-inner">${escapeHtml(r.destName || '')}</span>
                                    </span>
                                </div>
                                <div class="panel-timetable-time">${renderTimeForPrint(r)}</div>
                                <div class="panel-timetable-type"${typeStyle}>
                                    <span class="panel-timetable-type-marquee" aria-label="${escapeHtml(r.typeName || '')}">
                                        <span class="panel-timetable-type-marquee-inner">${escapeHtml(r.typeName || '')}</span>
                                    </span>
                                </div>
                            </div>
                        `;
                    })
                    .join('')
                : '<div class="panel-timetable-empty">当前无班次</div>';

            const printableGridHtml = buildGridTableHtmlForDirection({
                rowsForDir: printableRowsForDir,
                typeHints,
                terminalHints,
                expanded: true,
                nowMs: now,
                serviceDayStartMs
            });

            const lineMetaForPrint = getLineMeta?.(lineId) || {};
            const companyKeyForPrint = toText(lineMetaForPrint?.company);
            const companyZhForPrint = toText(companyLogoMap?.[companyKeyForPrint]?.zh);
            const companyTypeForPrint = toText(companyLogoMap?.[companyKeyForPrint]?.type);
            const lineColorForPrint = toText(lineMetaForPrint?.color);
            dirPrintPayloadByKey.set(lineDirKey, {
                lineId: toText(lineId),
                dirKey: toText(dirKey),
                dirLabel: toText(label),
                stationName: toText(currentStationNameZh) || toText(title.textContent),
                lineName: toText(lineMetaForPrint?.name) || toText(lineId),
                lineColor: lineColorForPrint,
                companyName: companyZhForPrint || companyKeyForPrint || '未知公司',
                companyType: companyTypeForPrint || '',
                timetableViewMode,
                serviceDay: toText(currentServiceDay),
                generatedAt: Date.now(),
                listHtml: printableListHtml,
                gridHtml: printableGridHtml,
                gridHintsHtml
            });

            const timetableHtml = timetableViewMode === 'grid'
                ? buildGridTableHtmlForDirection({
                    rowsForDir: filteredRowsForDir,
                    typeHints,
                    terminalHints,
                    expanded,
                    nowMs: now,
                    serviceDayStartMs
                })
                : (visible.length
                    ? visible
                        .map((r) => {
                            const klass = r.isPast ? 'panel-timetable-row is-past' : 'panel-timetable-row';
                            const tripAttr = r.tripKey ? ` data-trip-key="${escapeHtml(r.tripKey)}"` : '';
                            const typeStyle = (!r.isPast && toText(r.typeColor))
                                ? ` style="color:${escapeHtml(toText(r.typeColor))}"`
                                : '';
                            return `
                                <div class="${klass}"${tripAttr}>
                                    <div class="panel-timetable-dest">
                                        <span class="panel-timetable-dest-prefix" aria-hidden="true">to</span>
                                        <span class="panel-timetable-dest-marquee" aria-label="to ${escapeHtml(r.destName || '')}">
                                            <span class="panel-timetable-dest-marquee-inner">${escapeHtml(r.destName || '')}</span>
                                        </span>
                                    </div>
                                    <div class="panel-timetable-time">${renderTime(r)}</div>
                                    <div class="panel-timetable-type"${typeStyle}>
                                        <span class="panel-timetable-type-marquee" aria-label="${escapeHtml(r.typeName || '')}">
                                            <span class="panel-timetable-type-marquee-inner">${escapeHtml(r.typeName || '')}</span>
                                        </span>
                                    </div>
                                </div>
                            `;
                        })
                        .join('')
                    : '<div class="panel-timetable-empty">当前无班次</div>');

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
                        <span class="panel-dir-actions">
                            <span class="panel-dir-triangle" aria-hidden="true">${tri}</span>
                            ${isLoopLine(lineId) ? '' : `<button type="button" class="panel-dir-filter-btn" data-dir-filter-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="筛选">
                                <img class="panel-dir-filter-icon" alt="" src="./icons/filter.svg" />
                            </button>`}
                            ${timetableViewMode === 'grid' ? `<button type="button" class="panel-dir-print-btn" data-dir-print-btn="1" data-line-id="${escapeHtml(lineId)}" data-dir-key="${escapeHtml(dirKey)}" aria-label="打印时刻表">
                                <img class="panel-dir-print-icon" alt="" src="./icons/print.svg" />
                            </button>` : ''}
                        </span>
                    </div>
                    ${gridHintsHtml}
                    <div class="panel-timetable ${timetableViewClass} ${expanded ? 'is-expanded' : 'is-collapsed'}" data-dir-body="1" data-dir-key="${escapeHtml(dirKey)}">
                        ${timetableHtml}
                    </div>
                </div>
            `;
        }

        const lineMeta = getLineMeta?.(lineId) || {};
        gridDataDebugByLineId.set(toText(lineId), {
            lineId: toText(lineId),
            lineName: toText(lineMeta?.name) || toText(lineId),
            directions: directionDebug
        });

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

        try {
            const icons = Array.from(ttEl.querySelectorAll('.panel-dir-filter-icon'));
            for (const icon of icons) {
                if (icon.__panelFilterIconHooked) continue;
                icon.__panelFilterIconHooked = true;
                icon.addEventListener('error', () => {
                    if (icon.__panelFilterIconFallbackTried) return;
                    icon.__panelFilterIconFallbackTried = true;
                    icon.src = '/icons/filter.svg';
                });
            }

            const printIcons = Array.from(ttEl.querySelectorAll('.panel-dir-print-icon'));
            for (const icon of printIcons) {
                if (icon.__panelPrintIconHooked) continue;
                icon.__panelPrintIconHooked = true;
                icon.addEventListener('error', () => {
                    if (icon.__panelPrintIconFallbackTried) return;
                    icon.__panelPrintIconFallbackTried = true;
                    icon.src = '/icons/print.svg';
                });
            }
        } catch {
            // ignore
        }

        // 方向展开态：默认把各方向可视区域滚到“最后一条已过班次”处（1 past + 9 future 的视觉效果）
        try {
            const expandedBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.is-expanded'));
            for (const bodyEl of expandedBodies) {
                if (bodyEl.classList.contains('panel-timetable-view-grid')) {
                    bodyEl.style.maxHeight = '';
                    const focusRow = bodyEl.querySelector('[data-grid-focus-start="1"]');
                    if (focusRow instanceof Element) {
                        bodyEl.scrollTop = Math.max(0, focusRow.offsetTop || 0);
                    } else {
                        bodyEl.scrollTop = 0;
                    }
                    continue;
                }

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

            const collapsedGridBodies = Array.from(ttEl.querySelectorAll('.panel-timetable.panel-timetable-view-grid.is-collapsed'));
            for (const bodyEl of collapsedGridBodies) {
                const collapsedBaseHeight = 70; // 两行车次（不按小时数）
                bodyEl.style.maxHeight = `${collapsedBaseHeight}px`;

                const currentHourRow = bodyEl.querySelector('[data-grid-current-hour="1"]') || bodyEl.querySelector('.panel-grid-row');
                if (!(currentHourRow instanceof Element)) continue;

                const currentHourFullHeight = Math.ceil((currentHourRow.offsetHeight || 0) + 1);
                const targetHeight = Math.max(collapsedBaseHeight, currentHourFullHeight);
                bodyEl.style.maxHeight = `${targetHeight}px`;
                bodyEl.scrollTop = 0;
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

    const normalizeTripStops = (stops, serviceDayStartMs, { originIds, terminalIds, originAKeys, terminalAKeys, showOriginLabel, showTerminalLabel }) => {
        const out = [];
        for (const s of Array.isArray(stops) ? stops : []) {
            let arr = toText(s?.arr) || '';
            let dep = toText(s?.dep) || '';

            const stationId = toText(s?.stationId);
            const stationAKey = getStationAKey(stationId);
            const isOriginStop = !!showOriginLabel && (
                !!originIds?.has?.(stationId) ||
                (!!stationAKey && !!originAKeys?.has?.(stationAKey))
            );
            const isTerminalStop = !!showTerminalLabel && (
                !!terminalIds?.has?.(stationId) ||
                (!!stationAKey && !!terminalAKeys?.has?.(stationAKey))
            );
            const allowMirrorFill = !(isOriginStop || isTerminalStop);

            if (allowMirrorFill) {
                if (!arr && dep) arr = dep;
                if (!dep && arr) dep = arr;
            }

            const arrParsed = arr ? parseHHMMToServiceDayMs(arr, serviceDayStartMs) : null;
            const depParsed = dep ? parseHHMMToServiceDayMs(dep, serviceDayStartMs) : null;
            const timeMs = depParsed?.ms || arrParsed?.ms || null;

            out.push({
                stationId,
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

    const getTripTypeName = (trip, trainTypesIndex) => {
        const typeId = toText(trip?.y);
        if (!typeId) return '';
        return toText(trainTypesIndex?.get?.(typeId) || typeId);
    };

    const getTripTypeColor = (trip, trainTypeColorIndex) => {
        const typeId = toText(trip?.y);
        if (!typeId) return '';
        return resolveTrainTypeColorForTheme(trainTypeColorIndex?.get?.(typeId));
    };

    const renderTripDetail = async ({ lineId, tripKey, clientX, clientY, pinned, fitMode }) => {
        const token = ++tripDetailToken;
        tripDetailPinned = !!pinned;
        clearTripDetailHideTimer();
        clearTripDetailStationIndicator();

        const trip = await findTripByKey(lineId, tripKey);
        if (token !== tripDetailToken) return;
        if (!trip) {
            tripDetailRoot.classList.add('is-hidden');
            return;
        }

        await showTripCurrentStationHint({ lineId, token });
        if (token !== tripDetailToken) return;

        const now = getDisplayNowMs();
        const serviceDayStartMs = getServiceDayStartMs(new Date(now));

        const [stationsIndex, trainTypesIndex, trainTypeColorIndex] = await Promise.all([
            getStationsIndex(),
            getTrainTypesIndex(),
            getTrainTypeColorIndex()
        ]);
        if (token !== tripDetailToken) return;

        const ptRefs = Array.isArray(trip?.pt) ? trip.pt : (trip?.pt ? [trip.pt] : []);
        const ntRefs = Array.isArray(trip?.nt) ? trip.nt : (trip?.nt ? [trip.nt] : []);
        const hasPt = ptRefs.some((x) => !!toText(x));
        const hasNt = ntRefs.some((x) => !!toText(x));
        const dirRaw = toText(trip?.d);
        const isLoopDirection = /Loop/i.test(dirRaw);
        const hideThroughSegmentsForLoop = isLoopDirection && (hasPt || hasNt);
        const os = Array.isArray(trip?.os) ? trip.os : (trip?.os ? [trip.os] : []);
        const ds = Array.isArray(trip?.ds) ? trip.ds : (trip?.ds ? [trip.ds] : []);
        const originIds = new Set(os.map((x) => toText(x)).filter(Boolean));
        const terminalIds = new Set(ds.map((x) => toText(x)).filter(Boolean));
        // Trip detail 展示包含直通( pt/nt )链路：始发/终点标记应始终显示在全链路端点，
        // 且需兼容“同名换乘站不同线路 stationId”场景（用 AKey 兜底匹配）。
        const originAKeys = new Set(Array.from(originIds).map((id) => getStationAKey(id)).filter(Boolean));
        const terminalAKeys = new Set(Array.from(terminalIds).map((id) => getStationAKey(id)).filter(Boolean));
        const showOriginLabel = !!originIds.size;
        const showTerminalLabel = !!terminalIds.size;

        const ptChain = await collectRefChainTrips(trip, 'pt', token);
        if (token !== tripDetailToken) return;
        const ntChain = await collectRefChainTrips(trip, 'nt', token);
        if (token !== tripDetailToken) return;

        const segments = [];

        const mainRowsRaw = normalizeTripStops(buildTripStops(trip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
            originIds,
            terminalIds,
            originAKeys,
            terminalAKeys,
            showOriginLabel,
            showTerminalLabel
        }).map((s) => ({ ...s, seg: 'main', isMain: true }));

        if (hideThroughSegmentsForLoop && mainRowsRaw.length) {
            const firstMain = mainRowsRaw[0];
            const lastMain = mainRowsRaw[mainRowsRaw.length - 1];

            const ptRefId = toText(ptRefs?.[0]);
            if (ptRefId && firstMain) {
                const ptArr = await getPtLastArriveTime(ptRefId);
                if (token !== tripDetailToken) return;
                const parsed = ptArr ? parseHHMMToServiceDayMs(ptArr, serviceDayStartMs) : null;
                if (ptArr) {
                    firstMain.arr = ptArr;
                    firstMain.arrPlus = !!parsed?.isNextDaySegment;
                }
            }

            const ntRefId = toText(ntRefs?.[0]);
            if (ntRefId && lastMain) {
                const ntDep = await getNtFirstDepartTime(ntRefId);
                if (token !== tripDetailToken) return;
                const parsed = ntDep ? parseHHMMToServiceDayMs(ntDep, serviceDayStartMs) : null;
                if (ntDep) {
                    lastMain.dep = ntDep;
                    lastMain.depPlus = !!parsed?.isNextDaySegment;
                }
            }
        }

        if (!hideThroughSegmentsForLoop) {
            for (const ptTrip of (Array.isArray(ptChain) ? ptChain.slice().reverse() : [])) {
                const rows = normalizeTripStops(buildTripStops(ptTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                    originIds,
                    terminalIds,
                    originAKeys,
                    terminalAKeys,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'pt', isMain: false }));
                segments.push({
                    kind: 'pt',
                    lineId: getTripLineId(ptTrip),
                    rows,
                    typeName: getTripTypeName(ptTrip, trainTypesIndex),
                    typeColor: getTripTypeColor(ptTrip, trainTypeColorIndex)
                });
            }
        }

        segments.push({
            kind: 'main',
            lineId: getTripLineId(trip),
            rows: mainRowsRaw,
            typeName: getTripTypeName(trip, trainTypesIndex),
            typeColor: getTripTypeColor(trip, trainTypeColorIndex)
        });

        if (!hideThroughSegmentsForLoop) {
            for (const ntTrip of (Array.isArray(ntChain) ? ntChain : [])) {
                const rows = normalizeTripStops(buildTripStops(ntTrip, stationsIndex, serviceDayStartMs), serviceDayStartMs, {
                    originIds,
                    terminalIds,
                    originAKeys,
                    terminalAKeys,
                    showOriginLabel,
                    showTerminalLabel
                }).map((s) => ({ ...s, seg: 'nt', isMain: false }));
                segments.push({
                    kind: 'nt',
                    lineId: getTripLineId(ntTrip),
                    rows,
                    typeName: getTripTypeName(ntTrip, trainTypesIndex),
                    typeColor: getTripTypeColor(ntTrip, trainTypeColorIndex)
                });
            }
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
        const typeColor = typeId ? resolveTrainTypeColorForTheme(trainTypeColorIndex.get(typeId)) : '';
        const titlePrefix = `往 ${destName}`.trim();
        const safeTypeName = toText(typeName);
        const safeTypeColor = toText(typeColor);
        if (safeTypeName) {
            const typeStyle = safeTypeColor ? ` style="color:${escapeHtml(safeTypeColor)}"` : '';
            tripDetailTitle.innerHTML = `${escapeHtml(titlePrefix)} <span class="panel-trip-detail-title-type"${typeStyle}>${escapeHtml(safeTypeName)}</span>`;
        } else {
            tripDetailTitle.textContent = titlePrefix;
        }
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
                        <div class="panel-trip-detail-station" data-station-id="${escapeHtml(toText(s.stationId))}">${escapeHtml(s.stationName || '')}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-arrive">${arrivalLabel}${arrText ? `<span class=\"panel-time-arrive\">${escapeHtml(arrText)}</span>` : ''}</div>
                        <div class="panel-trip-detail-time panel-trip-detail-depart">${departLabel}${depText ? `<span class=\"panel-time-depart\">${escapeHtml(depText)}</span>` : ''}</div>
                    </div>
                `;
            };

        const renderNoteRow = (descriptor, typeName, typeColor, isPast) => {
            if (!descriptor?.text) return '';
            const past = !!isPast;
            const colorStyle = past
                ? ' style="color:#ccc"'
                : (descriptor.color ? ` style="color:${escapeHtml(descriptor.color)}"` : '');
            const dotStyle = past
                ? ' style="background:#ccc"'
                : (descriptor.color ? ` style="background:${escapeHtml(descriptor.color)}"` : '');
            const typeText = toText(typeName);
            const typeStyle = (!past && toText(typeColor))
                ? ` style="color:${escapeHtml(toText(typeColor))}"`
                : '';
            const typeHtml = typeText
                ? `<span class="panel-trip-detail-note-type"${typeStyle}>${escapeHtml(typeText)}</span>`
                : '';
            const rowCls = past ? 'panel-trip-detail-note-row is-past' : 'panel-trip-detail-note-row';
            return `
                <div class="${rowCls}">
                    <span class="panel-trip-detail-note-dot"${dotStyle}></span>
                    <span class="panel-trip-detail-note-line"${colorStyle}>${escapeHtml(descriptor.text)}</span>
                    ${typeHtml}
                </div>
            `;
        };

        const getSegmentFirstRow = (segment) => (Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[0] : null);
        const getSegmentLastRow = (segment) => (Array.isArray(segment?.rows) && segment.rows.length ? segment.rows[segment.rows.length - 1] : null);
        const isBoundaryPast = (leftRow, rightRow) => {
            if (leftRow && rightRow) return !!(leftRow.isPast && rightRow.isPast);
            if (leftRow) return !!leftRow.isPast;
            if (rightRow) return !!rightRow.isPast;
            return false;
        };

        const renderLoopMarkerRow = (text) => {
            const label = toText(text);
            if (!label) return '';
            return `
                <div class="panel-trip-detail-note-row">
                    <span class="panel-trip-detail-note-line">${escapeHtml(label)}</span>
                </div>
            `;
        };

        let rowsHtml = '';
        if (hideThroughSegmentsForLoop) {
            rowsHtml += renderLoopMarkerRow('↑环线');
        }
        const segmentBlocks = [];
        for (const seg of segmentsWithPast) {
            const lastBlock = segmentBlocks.length ? segmentBlocks[segmentBlocks.length - 1] : null;
            const sameLine = !!lastBlock && isSameLineName(lastBlock.lineId, seg.lineId);
            if (!sameLine) {
                segmentBlocks.push({
                    lineId: seg.lineId,
                    descriptor: buildLineDescriptor(seg.lineId) || (seg.kind === 'main' ? currentLineDesc : null),
                    typeName: toText(seg.typeName),
                    typeColor: toText(seg.typeColor),
                    segments: [seg]
                });
                continue;
            }

            lastBlock.segments.push(seg);
            if (!toText(lastBlock.typeName) && toText(seg.typeName)) {
                lastBlock.typeName = toText(seg.typeName);
            }
            if (!toText(lastBlock.typeColor) && toText(seg.typeColor)) {
                lastBlock.typeColor = toText(seg.typeColor);
            }
        }

        for (let i = 0; i < segmentBlocks.length; i += 1) {
            const block = segmentBlocks[i];
            const prevBlock = i > 0 ? segmentBlocks[i - 1] : null;

            const firstSeg = block.segments[0] || null;
            const prevLastSeg = prevBlock?.segments?.[prevBlock.segments.length - 1] || null;

            const prevLastRow = getSegmentLastRow(prevLastSeg);
            const firstRow = getSegmentFirstRow(firstSeg);

            rowsHtml += renderNoteRow(block.descriptor, block.typeName, block.typeColor, isBoundaryPast(prevLastRow, firstRow));
            for (const seg of block.segments) {
                rowsHtml += (seg.rows || []).map(renderStopRow).join('');
            }
        }
        if (hideThroughSegmentsForLoop) {
            rowsHtml += renderLoopMarkerRow('↓环线');
        }

        try {
            const payloadSegments = segmentsWithPast.map((seg) => ({
                kind: seg.kind,
                lineId: toText(seg.lineId),
                stationIds: (seg.rows || []).map((r) => toText(r.stationId)).filter(Boolean)
            }));
            const mainSeg = segmentsWithPast.find((s) => s.kind === 'main') || null;
            const mainRows = Array.isArray(mainSeg?.rows) ? mainSeg.rows : [];
            const mainOriginStationId = mainRows.length ? toText(mainRows[0]?.stationId) : '';
            const mainTerminalStationId = mainRows.length ? toText(mainRows[mainRows.length - 1]?.stationId) : '';
            const payload = {
                tripKey: toText(tripKey),
                selectedLineId: toText(lineId),
                mainLineId: toText(getTripLineId(trip) || lineId),
                originStationId: mainOriginStationId,
                mainTerminalStationId,
                terminalStationId: mainTerminalStationId,
                typeName: toText(typeName),
                hasNt,
                segments: payloadSegments,
                fitMode: toText(fitMode)
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
        hideTripCurrentStationHint();
        clearTripDetailStationIndicator();
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

            const marquees = Array.from(rootEl.querySelectorAll('.panel-timetable-dest-marquee, .panel-timetable-type-marquee'));
            const candidates = [];

            for (const marqueeEl of marquees) {
                const innerEl = marqueeEl.querySelector('.panel-timetable-dest-marquee-inner, .panel-timetable-type-marquee-inner');
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

                const holdMs = 2000;
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
        closeDirFilterPopover();
        const token = ++timetableRenderToken;
        const stationId = currentStationId;
        if (pendingGridDataDebugLog) gridDataDebugByLineId.clear();
        const lineEls = Array.from(body.querySelectorAll('[data-line-id]'));
        for (const el of lineEls) {
            await renderTimetableForLineEl(el, stationId, token);
        }

        if (pendingGridDataDebugLog) {
            const lines = Array.from(gridDataDebugByLineId.values()).sort((a, b) => String(a?.lineName || '').localeCompare(String(b?.lineName || '')));
            /*
            console.log('[班次视图][grid-data]', {
                stationId: toText(currentStationId),
                stationName: toText(currentStationNameZh),
                serviceDay: currentServiceDay,
                lines
            });
            */
            pendingGridDataDebugLog = false;
        }
    };

    const dirFilterPopover = document.createElement('div');
    dirFilterPopover.className = 'panel-dir-filter-popover is-hidden';
    dirFilterPopover.innerHTML = `
        <div class="panel-dir-filter-popover-head">
            <span class="panel-dir-filter-popover-title">筛选</span>
            <span class="panel-dir-filter-popover-head-actions">
                <label class="panel-dir-filter-toggle-all" data-dir-filter-toggle-all-wrap="1">
                    <input type="checkbox" data-dir-filter-toggle-all="1" checked />
                    <span>全选</span>
                </label>
                <button type="button" class="panel-dir-filter-popover-clear" data-dir-filter-clear="1" aria-label="清除筛选">清除筛选</button>
                <button type="button" class="panel-dir-filter-popover-close" data-dir-filter-close="1" aria-label="关闭">x</button>
            </span>
        </div>
        <div class="panel-dir-filter-popover-body" data-dir-filter-popover-body="1"></div>
    `;
    dirFilterPopover.addEventListener('pointerdown', (e) => stopPropagationOnly(e), { passive: true });
    dirFilterPopover.addEventListener('click', (e) => stopPropagationOnly(e), { passive: true });
    document.body.appendChild(dirFilterPopover);

    let activeDirFilterKey = '';

    const rerenderLineById = async (lineId) => {
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lineId))}"]`);
        if (!lineEl) return;
        const token = ++timetableRenderToken;
        await renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const closeDirFilterPopover = ({ clearPreview = false } = {}) => {
        activeDirFilterKey = '';
        dirFilterPopover.classList.add('is-hidden');
        if (clearPreview) clearPinnedDirPreview();
    };

    const positionDirFilterPopover = (anchorEl) => {
        if (!anchorEl || !(anchorEl instanceof Element)) return;
        const rect = anchorEl.getBoundingClientRect();
        const popRect = dirFilterPopover.getBoundingClientRect();
        const popW = Math.max(360, Math.ceil(popRect.width || 360));
        const popH = Math.max(180, Math.ceil(popRect.height || 260));
        const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        const gap = 8;

        let left = rect.right - popW;
        left = Math.max(8, Math.min(left, Math.max(8, viewportW - popW - 8)));

        const canShowAbove = rect.top - gap - popH >= 8;
        const top = canShowAbove
            ? rect.top - gap - popH
            : Math.min(viewportH - popH - 8, rect.bottom + gap);

        dirFilterPopover.style.left = `${Math.round(left)}px`;
        dirFilterPopover.style.top = `${Math.round(Math.max(8, top))}px`;
    };

    const FILTER_FIELD_TO_ROW_KEY = {
        origins: 'origin',
        terminals: 'terminal',
        types: 'type'
    };

    const createEmptyDirFilterState = () => ({ origins: new Set(), terminals: new Set(), types: new Set() });

    const collectDirFilterOptionSets = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        const out = createEmptyDirFilterState();
        for (const row of list) {
            const origin = toText(row?.origin);
            const terminal = toText(row?.terminal);
            const type = toText(row?.type);
            if (origin) out.origins.add(origin);
            if (terminal) out.terminals.add(terminal);
            if (type) out.types.add(type);
        }
        return out;
    };

    const createAllSelectedDirFilterState = (rows) => collectDirFilterOptionSets(rows);

    const syncDirFilterStateWithRows = (state, rows) => {
        const source = state || createEmptyDirFilterState();
        const allValues = collectDirFilterOptionSets(rows);
        const next = createEmptyDirFilterState();
        for (const key of ['origins', 'terminals', 'types']) {
            const selected = source[key] instanceof Set ? source[key] : new Set();
            for (const value of selected) {
                if (allValues[key].has(value)) next[key].add(value);
            }
        }
        return next;
    };

    const isAllSelectedDirFilterState = (state, rows) => {
        const allValues = collectDirFilterOptionSets(rows);
        const current = state || createEmptyDirFilterState();
        for (const key of ['origins', 'terminals', 'types']) {
            const selected = current[key] instanceof Set ? current[key] : new Set();
            if (selected.size !== allValues[key].size) return false;
            for (const value of allValues[key]) {
                if (!selected.has(value)) return false;
            }
        }
        return true;
    };

    const getFilterRowsForState = ({ rows, state, ignoreField = '' }) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.filter((row) => {
            const origin = toText(row?.origin);
            const terminal = toText(row?.terminal);
            const type = toText(row?.type);
            // Empty Set = no constraint on that dimension (standard faceted filter: empty ≡ all)
            const originOk = ignoreField === 'origins' || !(state?.origins instanceof Set) || !state.origins.size || state.origins.has(origin);
            const terminalOk = ignoreField === 'terminals' || !(state?.terminals instanceof Set) || !state.terminals.size || state.terminals.has(terminal);
            const typeOk = ignoreField === 'types' || !(state?.types instanceof Set) || !state.types.size || state.types.has(type);
            return originOk && terminalOk && typeOk;
        });
    };

    const buildFilterFacetEntries = ({ rows, field, state }) => {
        const rowKey = FILTER_FIELD_TO_ROW_KEY[field];
        if (!rowKey) return [];

        const scopedRows = getFilterRowsForState({ rows, state, ignoreField: field });
        const sourceRows = scopedRows.length ? scopedRows : (Array.isArray(rows) ? rows : []);
        const counts = new Map();
        for (const row of sourceRows) {
            const value = toText(row?.[rowKey]);
            if (!value) continue;
            counts.set(value, (counts.get(value) || 0) + 1);
        }

        const selected = state?.[field] instanceof Set ? state[field] : new Set();
        for (const value of selected) {
            const v = toText(value);
            if (!v || counts.has(v)) continue;
            counts.set(v, 0);
        }

        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count: Number(count) || 0 }))
            .sort((a, b) => {
                const dc = b.count - a.count;
                if (dc) return dc;
                return String(a.value).localeCompare(String(b.value));
            });
    };

    const buildDirFilterColumnHtml = ({ title, field, entries, selected }) => {
        const items = Array.isArray(entries) ? entries : [];
        const rowsHtml = items.length
            ? items.map(({ value, count }) => {
                const checked = selected?.has?.(value) ? ' checked' : '';
                return `
                    <label class="panel-dir-filter-option">
                        <input type="checkbox" data-dir-filter-field="${escapeHtml(field)}" value="${escapeHtml(value)}"${checked} />
                        <span class="panel-dir-filter-option-name">${escapeHtml(value)}</span>
                        <span class="panel-dir-filter-option-count">（${escapeHtml(String(count))}）</span>
                    </label>
                `;
            }).join('')
            : '<div class="panel-dir-filter-empty">无可选项</div>';

        return `
            <div class="panel-dir-filter-col">
                <div class="panel-dir-filter-col-title">${escapeHtml(title)}</div>
                <div class="panel-dir-filter-col-body">${rowsHtml}</div>
            </div>
        `;
    };

    /**
     * Standard faceted-filter in-place update.
     * After any checkbox change, recompute cross-column counts and sync UI.
     * Empty Set means "no constraint" (show all) — the standard model.
     */
    const updateDirFilterPopoverInPlace = ({ rows, state }) => {
        const bodyEl = dirFilterPopover.querySelector('[data-dir-filter-popover-body]');
        if (!bodyEl) return;
        const fields = ['origins', 'terminals', 'types'];
        for (const field of fields) {
            const entries = buildFilterFacetEntries({ rows, field, state });
            const countMap = new Map();
            for (const e of entries) countMap.set(e.value, e.count);

            const checkboxes = bodyEl.querySelectorAll(`input[data-dir-filter-field="${field}"]`);
            for (const cb of checkboxes) {
                if (!(cb instanceof HTMLInputElement)) continue;
                const value = toText(cb.value);
                if (!value) continue;
                // Update count
                const label = cb.closest('.panel-dir-filter-option');
                if (label) {
                    const countSpan = label.querySelector('.panel-dir-filter-option-count');
                    if (countSpan) {
                        const newCount = countMap.get(value) ?? 0;
                        countSpan.textContent = `（${newCount}）`;
                    }
                }
                // Sync checked state: empty set → nothing checked visually
                const selected = state?.[field];
                cb.checked = !!(selected instanceof Set && selected.size && selected.has(value));
            }
        }
        // Toggle-all: checked only when every value in every column is selected
        const toggleAllInput = dirFilterPopover.querySelector('[data-dir-filter-toggle-all="1"]');
        if (toggleAllInput instanceof HTMLInputElement) {
            toggleAllInput.checked = isAllSelectedDirFilterState(state, rows);
        }
    };

    const openDirFilterPopover = ({ lineId, dirKey, anchorEl }) => {
        // Block filter popover for loop lines (Yamanote / Oedo)
        if (isLoopLine(lineId)) return;

        const lineDirKey = makeLineDirKey(lineId, dirKey);
        const rows = dirFilterRowsByKey.get(lineDirKey) || [];
        let state;
        if (!dirFilterStateByKey.has(lineDirKey)) {
            // Initial open: empty state means "no constraint" = show all
            state = createEmptyDirFilterState();
            dirFilterStateByKey.set(lineDirKey, state);
        } else {
            state = syncDirFilterStateWithRows(dirFilterStateByKey.get(lineDirKey), rows);
            dirFilterStateByKey.set(lineDirKey, state);
        }

        const bodyEl = dirFilterPopover.querySelector('[data-dir-filter-popover-body]');
        if (!bodyEl) return;
        const originEntries = buildFilterFacetEntries({ rows, field: 'origins', state });
        const terminalEntries = buildFilterFacetEntries({ rows, field: 'terminals', state });
        const typeEntries = buildFilterFacetEntries({ rows, field: 'types', state });
        bodyEl.innerHTML = [
            buildDirFilterColumnHtml({ title: '始发站', field: 'origins', entries: originEntries, selected: state.origins }),
            buildDirFilterColumnHtml({ title: '终点站', field: 'terminals', entries: terminalEntries, selected: state.terminals }),
            buildDirFilterColumnHtml({ title: '种别', field: 'types', entries: typeEntries, selected: state.types })
        ].join('');

        const toggleAllInput = dirFilterPopover.querySelector('[data-dir-filter-toggle-all="1"]');
        if (toggleAllInput instanceof HTMLInputElement) {
            toggleAllInput.checked = isAllSelectedDirFilterState(state, rows);
        }

        activeDirFilterKey = lineDirKey;
        dirFilterPopover.classList.remove('is-hidden');
        positionDirFilterPopover(anchorEl);
        applyDirPreviewByKey(lineDirKey, { force: true });
    };

    const toggleDirFilterPopoverFromButton = (btnEl) => {
        if (!btnEl || !(btnEl instanceof Element)) return;
        const lineId = toText(btnEl.getAttribute('data-line-id'));
        const dirKey = toText(btnEl.getAttribute('data-dir-key'));
        if (!lineId || !dirKey) return;
        const lineDirKey = makeLineDirKey(lineId, dirKey);

        if (!dirFilterPopover.classList.contains('is-hidden') && activeDirFilterKey === lineDirKey) {
            closeDirFilterPopover();
            return;
        }

        openDirFilterPopover({ lineId, dirKey, anchorEl: btnEl });
    };

    dirFilterPopover.addEventListener('change', async (evt) => {
        const target = evt?.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.type !== 'checkbox') return;
        if (!activeDirFilterKey) return;
        const [lineId, dirKey] = activeDirFilterKey.split('||');

        // Guard: loop lines should never reach here (filter btn hidden), but bail out just in case
        if (isLoopLine(lineId)) return;

        const rows = dirFilterRowsByKey.get(activeDirFilterKey) || [];
        let state = dirFilterStateByKey.get(activeDirFilterKey) || createEmptyDirFilterState();
        if (!dirFilterStateByKey.has(activeDirFilterKey)) dirFilterStateByKey.set(activeDirFilterKey, state);

        // --- Toggle-all checkbox ---
        if (target.hasAttribute('data-dir-filter-toggle-all')) {
            // Checked → select all values (= standard "all selected" state)
            // Unchecked → clear all (= empty sets = no constraint = show all)
            const newState = target.checked
                ? createAllSelectedDirFilterState(rows)
                : createEmptyDirFilterState();
            dirFilterStateByKey.set(activeDirFilterKey, newState);
            state = newState;

            // Re-render timetable and update popover counts
            await rerenderLineById(lineId);
            const updatedRows = dirFilterRowsByKey.get(activeDirFilterKey) || rows;
            updateDirFilterPopoverInPlace({ rows: updatedRows, state });
            // Update map highlighting to reflect filter change
            applyDirPreviewByKey(activeDirFilterKey, { force: true });
            const newAnchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
            if (newAnchorEl) positionDirFilterPopover(newAnchorEl);
            return;
        }

        // --- Individual option checkbox ---
        const field = toText(target.getAttribute('data-dir-filter-field'));
        if (field !== 'origins' && field !== 'terminals' && field !== 'types') return;
        const value = toText(target.value);
        if (!value) return;

        const bucket = state[field];
        if (target.checked) {
            bucket.add(value);
        } else {
            bucket.delete(value);
        }

        // Re-render timetable and update popover counts in-place
        await rerenderLineById(lineId);
        const updatedRows = dirFilterRowsByKey.get(activeDirFilterKey) || rows;
        updateDirFilterPopoverInPlace({ rows: updatedRows, state });
        // Update map highlighting to reflect filter change
        applyDirPreviewByKey(activeDirFilterKey, { force: true });
        const newAnchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
        if (newAnchorEl) positionDirFilterPopover(newAnchorEl);
    });

    dirFilterPopover.addEventListener('mouseenter', () => {
        if (!activeDirFilterKey) return;
        applyDirPreviewByKey(activeDirFilterKey, { force: true });
    });

    dirFilterPopover.addEventListener('pointerdown', (evt) => {
        const t = evt?.target;
        if (!(t instanceof Element)) return;
        if (!activeDirFilterKey) return;
        applyDirPreviewByKey(activeDirFilterKey, { force: true });
    }, { passive: true });

    dirFilterPopover.addEventListener('click', async (evt) => {
        const clearBtn = evt?.target?.closest?.('[data-dir-filter-clear]');
        if (clearBtn) {
            stopEvent(evt);
            if (!activeDirFilterKey) return;
            const rows = dirFilterRowsByKey.get(activeDirFilterKey) || [];
            const state = createEmptyDirFilterState();
            dirFilterStateByKey.set(activeDirFilterKey, state);

            const [lineId, dirKey] = activeDirFilterKey.split('||');
            await rerenderLineById(lineId);
            const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
            if (anchorEl) openDirFilterPopover({ lineId, dirKey, anchorEl });
            else closeDirFilterPopover();
            return;
        }

        const closeBtn = evt?.target?.closest?.('[data-dir-filter-close]');
        if (!closeBtn) return;
        stopEvent(evt);
        closeDirFilterPopover();
    }, { passive: false });

    document.addEventListener('pointerdown', (evt) => {
        if (dirFilterPopover.classList.contains('is-hidden')) return;
        const t = evt?.target;
        if (t instanceof Element) {
            if (t.closest('.maplibregl-canvas-container, .maplibregl-canvas, .maplibregl-ctrl, #map')) return;
        }
        if (t && dirFilterPopover.contains(t)) return;
        if (t && t instanceof Element && t.closest('.panel-dir-filter-btn')) return;
        closeDirFilterPopover();
    }, true);

    document.addEventListener('keydown', (evt) => {
        if (evt?.key !== 'Escape') return;
        if (dirFilterPopover.classList.contains('is-hidden')) return;
        closeDirFilterPopover();
    });

    window.addEventListener('resize', () => {
        if (dirFilterPopover.classList.contains('is-hidden') || !activeDirFilterKey) return;
        const [lineId, dirKey] = activeDirFilterKey.split('||');
        const anchorEl = body.querySelector(`.panel-dir-filter-btn[data-line-id="${escapeHtml(String(lineId))}"][data-dir-key="${escapeHtml(String(dirKey))}"]`);
        if (anchorEl) positionDirFilterPopover(anchorEl);
    });

    startAutoNowClock();
    applyTimetableViewMode(getTimetableViewMode ? getTimetableViewMode() : 'list', { rerender: false });

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
            onRestoreStationLines(
                Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : [],
                { stationId: toText(currentStationId) || null }
            );
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

    const getCompanyTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-company-logo, .panel-company-name');
        if (!hit || !body.contains(hit)) return null;
        const companyEl = hit.closest?.('.panel-company-header[data-company]');
        const company = companyEl?.getAttribute?.('data-company');
        return company ? String(company) : null;
    };

    const getLineTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const hit = target.closest?.('.panel-line-name');
        if (!hit || !body.contains(hit)) return null;
        const lineEl = hit.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        return lineId ? String(lineId) : null;
    };

    const getDirTitleTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const titleEl = target.closest?.('.panel-dir-title');
        if (!titleEl || !body.contains(titleEl)) return null;
        const dirEl = titleEl.closest?.('[data-dir-toggle]');
        const lineEl = titleEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const dirKey = dirEl?.getAttribute?.('data-dir-key');
        if (!lineId || !dirKey) return null;
        return { lineId: String(lineId), dirKey: String(dirKey) };
    };

    const getDirTriangleTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const triEl = target.closest?.('.panel-dir-triangle');
        if (!triEl || !body.contains(triEl)) return null;
        const dirEl = triEl.closest?.('[data-dir-toggle]');
        const lineEl = triEl.closest?.('[data-line-id]');
        const lineId = lineEl?.getAttribute?.('data-line-id');
        const dirKey = dirEl?.getAttribute?.('data-dir-key');
        if (!lineId || !dirKey) return null;
        return { lineId: String(lineId), dirKey: String(dirKey) };
    };

    const getDirFilterButtonTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const btn = target.closest?.('.panel-dir-filter-btn[data-dir-filter-btn]');
        if (!btn || !body.contains(btn)) return null;
        const lineId = btn.getAttribute('data-line-id');
        const dirKey = btn.getAttribute('data-dir-key');
        if (!lineId || !dirKey) return null;
        return { buttonEl: btn, lineId: String(lineId), dirKey: String(dirKey) };
    };

    const getDirPrintButtonTarget = (target) => {
        if (!(target instanceof Element)) return null;
        const btn = target.closest?.('.panel-dir-print-btn[data-dir-print-btn]');
        if (!btn || !body.contains(btn)) return null;
        const lineId = btn.getAttribute('data-line-id');
        const dirKey = btn.getAttribute('data-dir-key');
        if (!lineId || !dirKey) return null;
        return { buttonEl: btn, lineId: String(lineId), dirKey: String(dirKey) };
    };

    const requestPrintTimetable = (lineId, dirKey) => {
        const key = makeLineDirKey(lineId, dirKey);
        const payload = dirPrintPayloadByKey.get(key);
        if (!payload) return;
        try {
            window.dispatchEvent(new CustomEvent(TIMETABLE_PRINT_EVENT, {
                detail: { ...payload }
            }));
        } catch {
            // ignore
        }
    };

    const collectAllDirectionPrintPayloads = () => {
        const out = [];
        const seen = new Set();
        const lineEls = Array.from(body.querySelectorAll('[data-line-id]'));
        for (const lineEl of lineEls) {
            const lineId = toText(lineEl.getAttribute('data-line-id'));
            if (!lineId) continue;
            const dirEls = Array.from(lineEl.querySelectorAll('[data-dir-toggle][data-dir-key]'));
            for (const dirEl of dirEls) {
                const dirKey = toText(dirEl.getAttribute('data-dir-key'));
                const lineDirKey = makeLineDirKey(lineId, dirKey);
                if (!lineDirKey || seen.has(lineDirKey)) continue;
                seen.add(lineDirKey);
                const payload = dirPrintPayloadByKey.get(lineDirKey);
                if (payload) out.push({ ...payload });
            }
        }

        for (const [lineDirKey, payload] of dirPrintPayloadByKey.entries()) {
            if (!payload || seen.has(lineDirKey)) continue;
            seen.add(lineDirKey);
            out.push({ ...payload });
        }

        return out;
    };

    const requestPrintAllTimetables = () => {
        const payloads = collectAllDirectionPrintPayloads();
        if (!payloads.length) return;
        try {
            window.dispatchEvent(new CustomEvent(TIMETABLE_PRINT_ALL_EVENT, {
                detail: {
                    stationName: toText(currentStationNameZh) || toText(title.textContent),
                    serviceDay: toText(currentServiceDay),
                    timetableViewMode,
                    pages: payloads
                }
            }));
        } catch {
            // ignore
        }
    };

    dayPrintBtn.addEventListener('click', (evt) => {
        stopEvent(evt);
        requestPrintAllTimetables();
    }, { passive: false });

    const resolveMousePrimaryTarget = (target) => {
        const dirTitle = getDirTitleTarget(target);
        if (dirTitle) {
            const key = makeLineDirKey(dirTitle.lineId, dirTitle.dirKey);
            return { kind: 'dir', key: `dir:${key}`, lineId: dirTitle.lineId, dirKey: dirTitle.dirKey, lineDirKey: key };
        }
        const lineId = getLineTarget(target);
        if (lineId) return { kind: 'line', key: `line:${String(lineId)}`, lineId: String(lineId) };
        const companyName = getCompanyTarget(target);
        if (companyName) return { kind: 'company', key: `company:${String(companyName)}`, companyName: String(companyName) };
        return null;
    };

    const applyLineHoverSelection = (lineId) => {
        const id = toText(lineId);
        if (!id || !onSelectLine) return;
        onSelectLine(id, { source: 'panel-hover' });
        lastAppliedHoverKey = `line:${id}`;
    };

    const applyCompanyHoverSelection = (companyName) => {
        const name = toText(companyName);
        if (!name || !onSelectCompany) return;
        onSelectCompany(name, {
            source: 'panel-hover',
            stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
        });
        lastAppliedHoverKey = `company:${name}`;
    };

    const armCancelInteractionSuppression = () => {
        const until = nowMs() + 260;
        suppressMouseClickUntilMs = until;
        // 取消固定后 1s 内不响应 hover，避免鼠标仍在面板上立即重新触发预览
        suppressMouseHoverUntilMs = nowMs() + 1000;
    };

    const expandDirectionTimetable = (lineId, dirKey) => {
        const lid = toText(lineId);
        const dkey = toText(dirKey);
        if (!lid || !dkey) return;
        if (isDirExpanded(lid, dkey)) return;
        setDirExpanded(lid, dkey, true);
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lid))}"]`);
        const token = ++timetableRenderToken;
        renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const toggleDirectionTimetable = (lineId, dirKey) => {
        const lid = toText(lineId);
        const dkey = toText(dirKey);
        if (!lid || !dkey) return;
        const nextExpanded = !isDirExpanded(lid, dkey);
        setDirExpanded(lid, dkey, nextExpanded);
        const lineEl = body.querySelector(`[data-line-id="${escapeHtml(String(lid))}"]`);
        const token = ++timetableRenderToken;
        renderTimetableForLineEl(lineEl, currentStationId, token);
    };

    const onBodyPointerDown = (evt) => {
        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (isTouchLikePointer(pt)) {
            suppressMouseEventsUntilMs = nowMs() + 800;
            pendingTouchTripTap = null;
        }

        const earlyPrintTarget = getDirPrintButtonTarget(evt?.target);
        if (earlyPrintTarget) {
            stopEvent(evt);
            requestPrintTimetable(earlyPrintTarget.lineId, earlyPrintTarget.dirKey);
            return;
        }

        if (evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            const pinnedKey = getCurrentPinnedInteractionKey();
            const hitKey = getInteractionKeyFromTarget(evt.target);
            stopEvent(evt);
            if (pinnedKey && hitKey && pinnedKey === hitKey) return;
            clearPinnedPanelState({ restoreStation: true });
            armCancelInteractionSuppression();
            return;
        }

        if (tripLocked) {
            const t = evt?.target;
            const rowEl = findTripTarget(t);
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

        const filterTarget = getDirFilterButtonTarget(evt?.target);
        if (filterTarget) {
            stopEvent(evt);
            const lineDirKey = makeLineDirKey(filterTarget.lineId, filterTarget.dirKey);
            applyDirPreviewByKey(lineDirKey, { fitMode: 'commit' });
            pinDirPreviewByKey(lineDirKey);
            setPinnedPanelSelection('dir', lineDirKey);
            toggleDirFilterPopoverFromButton(filterTarget.buttonEl);
            return;
        }

        const rowEl = findTripTarget(evt?.target);
        if (rowEl && body.contains(rowEl)) {
            clearTripHighlightTimer();
            const lineEl = rowEl.closest?.('[data-line-id]');
            const lineId = lineEl?.getAttribute?.('data-line-id');
            const tripKey = rowEl.getAttribute?.('data-trip-key');
            if (lineId && tripKey) {
                stopPropagationOnly(evt);
                pendingTouchTripTap = {
                    pointerId: evt?.pointerId,
                    startX: evt?.clientX ?? 0,
                    startY: evt?.clientY ?? 0,
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    moved: false
                };
                return;
            }
        }

        const dirTriangle = getDirTriangleTarget(evt?.target);
        if (dirTriangle) {
            stopEvent(evt);
            toggleDirectionTimetable(dirTriangle.lineId, dirTriangle.dirKey);
            return;
        }

        const dirTitle = getDirTitleTarget(evt?.target);
        if (dirTitle) {
            stopEvent(evt);
            toggleDirectionTimetable(dirTitle.lineId, dirTitle.dirKey);
            return;
        }

        const lineId = getLineTarget(evt?.target);
        if (lineId) {
            stopEvent(evt);
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            lastAppliedHoverKey = null;
            clearPinnedDirPreview();
            setPinnedPanelSelection('line', String(lineId));
            if (onSelectLine) onSelectLine(String(lineId), { source: 'panel-touch', isolateStations: true });
            return;
        }

        const companyName = getCompanyTarget(evt?.target);
        if (companyName) {
            stopEvent(evt);
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            lastAppliedHoverKey = null;
            clearPinnedDirPreview();
            setPinnedPanelSelection('company', String(companyName));
            if (onSelectCompany) {
                onSelectCompany(String(companyName), {
                    source: 'panel-touch',
                    stationLineIds: Array.isArray(currentStationServingIds) ? currentStationServingIds.slice() : []
                });
            }
            return;
        }

        if (!evt?.target || !(evt.target instanceof Element) || !body.contains(evt.target)) {
            // 触屏在非交互区域（例如时间表滚动区）按下：允许默认滚动，但不要把事件传到地图
            stopPropagationOnly(evt);
            return;
        }

        stopPropagationOnly(evt);
    };

    const onBodyPointerMoveTouchTap = (evt) => {
        if (!pendingTouchTripTap) return;
        const pt = readPointerType(evt);
        if (!isTouchLikePointer(pt)) return;

        const pendingPointerId = pendingTouchTripTap.pointerId;
        const evtPointerId = evt?.pointerId;
        if (pendingPointerId != null && evtPointerId != null && pendingPointerId !== evtPointerId) return;

        const dx = (evt?.clientX ?? pendingTouchTripTap.startX) - pendingTouchTripTap.startX;
        const dy = (evt?.clientY ?? pendingTouchTripTap.startY) - pendingTouchTripTap.startY;
        const d2 = dx * dx + dy * dy;
        if (d2 > touchTripTapMaxMoveSq) {
            pendingTouchTripTap.moved = true;
        }
    };

    const onBodyPointerCancelTouchTap = () => {
        pendingTouchTripTap = null;
    };

    const onBodyPointerUpTouchTap = (evt) => {
        const pending = pendingTouchTripTap;
        if (!pending) return;

        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (!isTouchLikePointer(pt)) {
            pendingTouchTripTap = null;
            return;
        }

        const pendingPointerId = pending.pointerId;
        const evtPointerId = evt?.pointerId;
        if (pendingPointerId != null && evtPointerId != null && pendingPointerId !== evtPointerId) return;

        pendingTouchTripTap = null;

        const dx = (evt?.clientX ?? pending.startX) - pending.startX;
        const dy = (evt?.clientY ?? pending.startY) - pending.startY;
        const moved = pending.moved || (dx * dx + dy * dy) > touchTripTapMaxMoveSq;
        if (moved) return;

        stopPropagationOnly(evt);

        const key = `${pending.lineId}||${pending.tripKey}`;
        if (tripLocked && key !== lockedTripKey) {
            hideTripDetail();
            lastTripDetailKey = null;
            return;
        }

        lockTripPreview(key);
        setPinnedPanelSelection('trip', key);
        renderTripDetail({
            lineId: pending.lineId,
            tripKey: pending.tripKey,
            clientX: evt?.clientX || pending.startX,
            clientY: evt?.clientY || pending.startY,
            pinned: true,
            fitMode: 'commit'
        });
        lastTripDetailKey = key;
    };

    const onBodyMove = (evt) => {
        if (nowMs() < suppressMouseHoverUntilMs) {
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }
        if (isMultiSelectModeEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (!pinnedDirPreviewKey) clearDirPreview();
            return;
        }
        if (hasPinnedPanelState()) {
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            return;
        }
        if (tripLocked) return;
        if (isTouchLikePointer(lastPointerType)) return;
        if (!isHoverPreviewEnabled()) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            if (!pinnedDirPreviewKey) clearDirPreview();
            return;
        }

        const target = resolveMousePrimaryTarget(evt?.target);
        if (!target) {
            scheduleRestoreStationLines();
            clearHoverTimer();
            hoverCandidateKey = null;
            lastFiredHoverKey = null;
            lastMousePrimaryKey = '';
            if (!(evt?.relatedTarget && dirFilterPopover.contains(evt.relatedTarget)) && !pinnedDirPreviewKey) {
                clearDirPreview();
            }
            return;
        }

        clearRestoreTimer();

        const key = target.key;
        if (key === hoverCandidateKey) return;

        clearHoverTimer();
        hoverCandidateKey = key;

        if (key === lastFiredHoverKey) return;

        hoverTimerId = setTimeout(() => {
            hoverTimerId = null;
            if (hoverCandidateKey !== key) return;
            lastFiredHoverKey = key;

            if (target.kind === 'dir') {
                applyDirPreviewByKey(target.lineDirKey, { fitMode: 'preview' });
                lastMousePrimaryKey = key;
            } else if (target.kind === 'line') {
                applyLineHoverSelection(target.lineId);
                lastMousePrimaryKey = key;
            } else if (target.kind === 'company') {
                applyCompanyHoverSelection(target.companyName);
                lastMousePrimaryKey = key;
            }
        }, primaryHoverDelayMs);
    };

    const onBodyClick = (evt) => {
        // 触屏：由 pointerdown 接管两段式逻辑
        if (isTouchLikePointer(lastPointerType) || nowMs() < suppressMouseEventsUntilMs) {
            stopEvent(evt);
            return;
        }

        const earlyPrintTarget = getDirPrintButtonTarget(evt?.target);
        if (earlyPrintTarget) {
            stopEvent(evt);
            requestPrintTimetable(earlyPrintTarget.lineId, earlyPrintTarget.dirKey);
            return;
        }

        if (nowMs() < suppressMouseClickUntilMs) {
            stopEvent(evt);
            return;
        }

        if (evt?.target instanceof Element && body.contains(evt.target) && hasPinnedPanelState()) {
            const pinnedKey = getCurrentPinnedInteractionKey();
            const hitKey = getInteractionKeyFromTarget(evt.target);
            stopEvent(evt);
            if (pinnedKey && hitKey && pinnedKey === hitKey) return;
            clearPinnedPanelState({ restoreStation: true });
            armCancelInteractionSuppression();
            return;
        }

        const rowEl = findTripTarget(evt?.target);
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

                lockTripPreview(key);
                setPinnedPanelSelection('trip', key);
                const fitMode = (tripHighlightAppliedKey === key) ? 'none' : 'commit';
                renderTripDetail({
                    lineId: String(lineId),
                    tripKey: String(tripKey),
                    clientX: evt?.clientX || 0,
                    clientY: evt?.clientY || 0,
                    pinned: true,
                    fitMode
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

        const filterTarget = getDirFilterButtonTarget(evt?.target);
        if (filterTarget) {
            stopEvent(evt);
            const lineDirKey = makeLineDirKey(filterTarget.lineId, filterTarget.dirKey);
            applyDirPreviewByKey(lineDirKey, { fitMode: 'preview' });
            pinDirPreviewByKey(lineDirKey);
            setPinnedPanelSelection('dir', lineDirKey);
            toggleDirFilterPopoverFromButton(filterTarget.buttonEl);
            return;
        }

        const dirTriangle = getDirTriangleTarget(evt?.target);
        if (dirTriangle) {
            stopEvent(evt);
            toggleDirectionTimetable(dirTriangle.lineId, dirTriangle.dirKey);
            return;
        }

        const dirTitle = getDirTitleTarget(evt?.target);
        if (dirTitle) {
            stopEvent(evt);
            toggleDirectionTimetable(dirTitle.lineId, dirTitle.dirKey);
            return;
        }

        const primaryTarget = resolveMousePrimaryTarget(evt?.target);
        if (!primaryTarget || (primaryTarget.kind !== 'line' && primaryTarget.kind !== 'company')) return;

        stopEvent(evt);
        clearHoverTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;

        clearPinnedDirPreview();

        if (primaryTarget.kind === 'line') {
            if (lastMousePrimaryKey !== primaryTarget.key) {
                applyLineHoverSelection(primaryTarget.lineId);
                lastMousePrimaryKey = primaryTarget.key;
            }
            setPinnedPanelSelection('line', String(primaryTarget.lineId));
            return;
        }

        if (primaryTarget.kind === 'company') {
            if (lastMousePrimaryKey !== primaryTarget.key) {
                applyCompanyHoverSelection(primaryTarget.companyName);
                lastMousePrimaryKey = primaryTarget.key;
            }
            setPinnedPanelSelection('company', String(primaryTarget.companyName));
        }
    };

    const onBodyLeave = (evt) => {
        clearTripHighlightTimer();
        clearHoverTimer();
        clearRestoreTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        lastMousePrimaryKey = '';
        const toEl = evt?.relatedTarget;
        if (routeMapPopoverHoverActive || (toEl instanceof Element && toEl.closest?.('[data-route-map]'))) {
            return;
        }
        if (hasPinnedPanelState()) return;
        restoreStationLinesIfNeeded();
        if (tripLocked) return;
        if (toEl && tripDetailRoot.contains(toEl)) return;
        if (!(toEl && dirFilterPopover.contains(toEl)) && !pinnedDirPreviewKey) {
            clearDirPreview();
        }
        if (!tripDetailPinned) scheduleTripDetailHide();
    };

    body.addEventListener('pointerdown', onBodyPointerDown, { passive: false });
    body.addEventListener('pointermove', onBodyPointerMoveTouchTap, { passive: true });
    body.addEventListener('pointerup', onBodyPointerUpTouchTap, { passive: true });
    body.addEventListener('pointercancel', onBodyPointerCancelTouchTap, { passive: true });
    body.addEventListener('mousemove', onBodyMove);
    body.addEventListener('mouseleave', onBodyLeave);
    body.addEventListener('click', onBodyClick, { passive: false });

    body.addEventListener('mouseover', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        if (isTouchLikePointer(lastPointerType)) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        // 有固定态时：仅当 dir-filter 固定 且 row 属于同一方向 才允许 hover 打断
        if (hasPinnedPanelState()) {
            if (!isDirFilterPinned() || !isTripRowInPinnedDir(rowEl)) return;
        }
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

        // 若 dir-filter 固定态被同方向 row hover 打断，清除方向高亮
        if (isDirFilterPinned()) {
            clearDirPreview();
        }

        clearTripDetailHideTimer();
        clearTripHighlightTimer();
        renderTripDetail({
            lineId: String(lineId),
            tripKey: String(tripKey),
            clientX: evt?.clientX || 0,
            clientY: evt?.clientY || 0,
            pinned: false,
            fitMode: 'preview'
        });
        lastTripDetailKey = key;
    });

    body.addEventListener('mouseout', (evt) => {
        if (!isHoverPreviewEnabled()) return;
        clearTripHighlightTimer();
        if (tripLocked) return;
        if (tripDetailPinned) return;
        const rowEl = findTripTarget(evt?.target);
        if (!rowEl || !body.contains(rowEl)) return;
        if (hasPinnedPanelState()) {
            if (!isDirFilterPinned() || !isTripRowInPinnedDir(rowEl)) return;
        }
        const toEl = evt?.relatedTarget;
        if (toEl && (rowEl.contains(toEl) || tripDetailRoot.contains(toEl))) return;
        // dir-filter 固定态下 row mouseout：恢复方向高亮并隐藏 trip detail
        if (isDirFilterPinned()) {
            applyDirPreviewByKey(pinnedDirPreviewKey, { force: true });
        }
        scheduleTripDetailHide();
    });

    window.addEventListener('__TokyoRailRouteMapPopoverHoverEnter', () => {
        routeMapPopoverHoverActive = true;
        clearRestoreTimer();
    });

    window.addEventListener('__TokyoRailRouteMapPopoverHoverLeave', () => {
        routeMapPopoverHoverActive = false;
        if (hasPinnedPanelState()) return;
        restoreStationLinesIfNeeded();
        if (!pinnedDirPreviewKey) {
            clearDirPreview();
        }
    });

    const getTripDetailStationTarget = (target) => {
        if (!(target instanceof Element)) return null;
        return target.closest?.('.panel-trip-detail-station[data-station-id]') || null;
    };

    tripDetailBody.addEventListener('mouseover', (evt) => {
        if (isTouchLikePointer(lastPointerType)) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    });

    tripDetailBody.addEventListener('mouseout', (evt) => {
        if (isTouchLikePointer(lastPointerType)) return;
        const fromEl = getTripDetailStationTarget(evt?.target);
        if (!fromEl) return;
        const toEl = evt?.relatedTarget;
        const toStation = getTripDetailStationTarget(toEl);
        if (toStation) return;
        clearTripDetailStationIndicator();
    });

    tripDetailBody.addEventListener('mouseleave', () => {
        clearTripDetailStationIndicator();
    });

    tripDetailBody.addEventListener('pointerdown', (evt) => {
        const pt = readPointerType(evt);
        lastPointerType = pt;
        if (!isTouchLikePointer(pt)) return;
        const stationEl = getTripDetailStationTarget(evt?.target);
        if (!stationEl) return;
        const sid = toText(stationEl.getAttribute('data-station-id'));
        if (!sid) return;
        showTripDetailStationIndicator(sid);
    }, { passive: true });

    document.addEventListener('click', (evt) => {
        const target = evt?.target;

        // 点击设置区域不应触发“取消固定”或关闭详情
        if (
            target instanceof Element && (
                (settingsContentEl && settingsContentEl.contains(target)) ||
                timeOverlay.contains(target) ||
                target.closest('.settings-content') ||
                target.closest('.settings-ui')
            )
        ) return;

        if (pinnedDirPreviewKey) {
            const insidePanel = !!(target && root.contains(target));
            const insideFilterPopover = !!(target && dirFilterPopover.contains(target));
            if (!insidePanel && !insideFilterPopover) {
                clearPinnedDirPreview();
            }
        }

        if (hasPinnedPanelState()) {
            const insidePanel = !!(target && root.contains(target));
            const insideFilterPopover = !!(target && dirFilterPopover.contains(target));
            if (!insidePanel && !insideFilterPopover) {
                clearPinnedPanelState({ restoreStation: true });
                return;
            }
        }

        if (!tripDetailPinned && !tripLocked) return;
        if (target && tripDetailRoot.contains(target)) return;
        if (target && root.contains(target)) {
            const rowEl = findTripTarget(target);
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

        // 时间控件浮层：置于右上功能区同一行，位于 ms-fab 左侧
        timeOverlay.style.top = '10px';
        timeOverlay.style.right = '194px';

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
        isPanelVisible = true;
        root.style.transform = 'translateX(0)';
    };

    const hide = () => {
        closeTimePicker();
        closeDirFilterPopover();
        clearPinnedPanelState({ restoreStation: false });
        hideTripDetail();
        dirFilterStateByKey.clear();
        isPanelVisible = false;
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

    const showForStationProps = async (props) => {
        const renderToken = ++stationRenderToken;
        const name = readStationName(props);
        setTitle(name);

        currentStationId = toText(props?.id);
        currentStationNameZh = toText(props?.name_zh || props?.['name:zh'] || name);

        // 用 serving_ids 驱动交互恢复/公司过滤
        const servingIdsRaw = normalizeArrayLike(props?.serving_ids);
        currentStationServingIds = servingIdsRaw.map(String).filter(Boolean);
        pendingGridDataDebugLog = true;
        expandedDirKeys = new Set();
        dirFilterStateByKey.clear();
        lastAppliedHoverKey = null;
        lastMousePrimaryKey = '';
        clearHoverTimer();
        clearRestoreTimer();
        clearTripHighlightTimer();
        hideTripDetail();
        closeDirFilterPopover();
        clearPinnedPanelState({ restoreStation: false });
        lastTripDetailKey = null;

        const lineStationNameByLineId = await buildTransferLineStationNameMap({
            stationId: currentStationId,
            stationNameZh: currentStationNameZh,
            servingLineIds: currentStationServingIds
        });
        if (renderToken !== stationRenderToken) return;

        // 渲染 popup 同结构的内容（公司分组 + 线路）
        body.innerHTML = buildCompaniesHtml(props || {}, { getLineMeta, companyLogoMap, lineStationNameByLineId, railwaysOrderIndex });

        show();

        // 默认折叠态：填充每条线路的“未来最近 3 条”班次
        // 这里等待渲染完成，避免外部随后执行的 scrollToLineId 被后续异步渲染“拉回顶部”。
        await renderAllTimetables();
    };

    const scrollToLineId = (lineId, options = {}) => {
        const id = toText(lineId);
        if (!id) return false;

        const behavior = options?.behavior === 'auto' ? 'auto' : 'smooth';
        const block = options?.block === 'center' ? 'center' : 'start';

        const findLineEl = () => {
            const all = body.querySelectorAll('[data-line-id]');
            for (const el of all) {
                if (!(el instanceof Element)) continue;
                if (toText(el.getAttribute('data-line-id')) === id) return el;
            }
            return null;
        };

        const applyScroll = (lineEl) => {
            if (!(lineEl instanceof Element)) return false;
            const bodyRect = body.getBoundingClientRect();
            const lineRect = lineEl.getBoundingClientRect();
            const naturalTop = body.scrollTop + (lineRect.top - bodyRect.top);
            const centerOffset = block === 'center'
                ? Math.max(0, (body.clientHeight - lineRect.height) / 2)
                : 0;
            const top = Math.max(0, Math.round(naturalTop - centerOffset));
            try {
                body.scrollTo({ top, behavior });
                return true;
            } catch {
                body.scrollTop = top;
                return true;
            }
        };

        const immediate = findLineEl();
        if (immediate && applyScroll(immediate)) return true;

        setTimeout(() => {
            const retry = findLineEl();
            if (retry) applyScroll(retry);
        }, 120);
        return false;
    };

    const getScrollTop = () => {
        try {
            return Math.max(0, Number(body.scrollTop) || 0);
        } catch {
            return 0;
        }
    };

    const setScrollTop = (top, options = {}) => {
        const next = Math.max(0, Number(top) || 0);
        const behavior = options?.behavior === 'smooth' ? 'smooth' : 'auto';
        try {
            body.scrollTo({ top: next, behavior });
            return true;
        } catch {
            body.scrollTop = next;
            return true;
        }
    };

    const setHoverPreviewEnabled = (enabled) => {
        const next = enabled !== false;
        if (hoverPreviewEnabled === next) return;
        hoverPreviewEnabled = next;
        if (hoverPreviewEnabled) return;

        clearHoverTimer();
        clearRestoreTimer();
        clearTripHighlightTimer();
        hoverCandidateKey = null;
        lastFiredHoverKey = null;
        lastMousePrimaryKey = '';
        restoreStationLinesIfNeeded();
        clearPinnedPanelState({ restoreStation: false });
        hideTripCurrentStationHint();
        clearTripDetailStationIndicator();
        if (!tripLocked) {
            hideTripDetail();
            lastTripDetailKey = null;
        }
    };

    return {
        el: root,
        show,
        hide,
        setTitle,
        setHoverPreviewEnabled,
        setTimetableViewMode: (mode) => applyTimetableViewMode(mode, { rerender: true }),
        showForStationProps,
        scrollToLineId,
        getScrollTop,
        setScrollTop,
        layout
    };
}
