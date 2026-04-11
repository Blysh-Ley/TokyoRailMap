import { searchRailEntities, getLineMetaByIds } from './search.js';
import {
    collectJourneyCandidatesRaptor,
    pickPlanBuckets,
    ensurePlannerStaticData,
    getGroupStops,
    filterNearbyStops,
    sameSet,
    getStationNameById,
    getLineMeta,
    isThroughLegPairByMeta,
    expandLegsForDisplay,
    buildPlanDetailBlocks,
    buildSectionLineRunsForDisplay,
    buildTripPreviewPayloadFromDisplayPlan,
    toHHMM,
    formatDuration,
    getServiceDayStartMs,
    normalizeHHMM,
    hhmmToOffsetMinutes
} from './travel-search-planner-raptor.js';
import { getCachedJson, getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from './fetch.js';
import {
    buildTimetableStationText,
    createTimetableNoteRow,
    createTimetableStationRow
} from './timetable-table.js';
import {
    detectThroughServiceCategoryFromTrips,
    THROUGH_SERVICE_DISPLAY
} from './shonanshinjuku-uenotokyo.js';

function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null) continue;
        if (k === 'text') node.textContent = String(v);
        else node.setAttribute(k, String(v));
    }
    return node;
}

const normalizeText = (v) => String(v ?? '').trim();

const setJourneyIconFromCache = (imgEl, iconFile) => {
    const file = normalizeText(iconFile);
    if (!(imgEl instanceof HTMLImageElement) || !file) return;
    const candidates = getIconCandidates(file);
    setImageElementFromCache(imgEl, candidates, {
        cacheKey: `icon:${file}`,
        fallbackSrc: getPreferredCachedImageSrc(candidates, { cacheKey: `icon:${file}` })
    }).catch(() => null);
};

const getJourneyServiceDay = (serviceDay) => (normalizeText(serviceDay) === 'SaturdayHoliday' ? 'SaturdayHoliday' : 'Weekday');

const getJourneyTripBaseKey = (tripLike) => {
    const t = normalizeText(tripLike?.t || '');
    if (t) return t;
    const id = normalizeText(tripLike?.id || '');
    if (!id) return '';
    return id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
};

const extractJourneyLineIdFromTripId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/^(.*)\.[^.]+\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    return normalizeText(m?.[1] || '');
};

const normalizeRefArray = (value) => {
    if (Array.isArray(value)) return value.map((x) => normalizeText(x)).filter(Boolean);
    const s = normalizeText(value);
    return s ? [s] : [];
};

const journeyTripByIdCacheByDay = new Map();

const getJourneyTripByIdCache = (serviceDay) => {
    const day = getJourneyServiceDay(serviceDay);
    if (!journeyTripByIdCacheByDay.has(day)) journeyTripByIdCacheByDay.set(day, new Map());
    return journeyTripByIdCacheByDay.get(day);
};

const findJourneyTripByRefInList = (list, key) => {
    const tripKey = normalizeText(key);
    if (!tripKey) return null;
    const rows = Array.isArray(list) ? list : [];

    const exact = rows.find((trip) => {
        const id = normalizeText(trip?.id || '');
        const t = normalizeText(trip?.t || '');
        return id === tripKey || t === tripKey;
    });
    if (exact) return exact;

    const baseExact = rows.find((trip) => getJourneyTripBaseKey(trip) === tripKey);
    if (baseExact) return baseExact;

    const pref = rows.find((trip) => {
        const id = normalizeText(trip?.id || '');
        const t = normalizeText(trip?.t || '');
        return id.startsWith(`${tripKey}.`) || t.startsWith(`${tripKey}.`);
    });
    if (pref) return pref;

    return rows.find((trip) => {
        const pt = normalizeRefArray(trip?.pt);
        const nt = normalizeRefArray(trip?.nt);
        return pt.includes(tripKey) || nt.includes(tripKey);
    }) || null;
};

const loadJourneyTripByTripId = async ({ tripId, serviceDay }) => {
    const key = normalizeText(tripId);
    if (!key) return null;

    const dayCache = getJourneyTripByIdCache(serviceDay);
    if (dayCache.has(key)) return dayCache.get(key) || null;

    const cache = window?.TokyoRailTimetableCache;
    if (!cache) {
        dayCache.set(key, null);
        return null;
    }

    const lineId = extractJourneyLineIdFromTripId(key);
    if (!lineId) {
        dayCache.set(key, null);
        return null;
    }

    const has = cache.get(lineId);
    if (!has) await cache.preloadByLineIds([lineId]);
    const list = Array.isArray(cache.get(lineId)) ? cache.get(lineId) : [];

    const day = getJourneyServiceDay(serviceDay);
    const filtered = list.filter((trip) => {
        const id = normalizeText(trip?.id || '');
        if (!id) return true;
        if (day === 'Weekday') return !id.includes('.SaturdayHoliday');
        return id.includes('.SaturdayHoliday');
    });

    const found = findJourneyTripByRefInList(filtered, key) || findJourneyTripByRefInList(list, key) || null;
    dayCache.set(key, found);
    return found;
};

const collectUniqueTripIds = (values) => {
    const out = [];
    const seen = new Set();
    for (const value of Array.isArray(values) ? values : []) {
        const id = normalizeText(value);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
};

const collectSectionCandidateTripIds = (section) => {
    const ids = [];
    const throughTripIds = Array.isArray(section?.throughTripIds) ? section.throughTripIds : [];
    const tripIds = Array.isArray(section?.tripIds) ? section.tripIds : [];
    const legs = Array.isArray(section?.legs) ? section.legs : [];

    ids.push(...throughTripIds, ...tripIds);
    for (const leg of legs) {
        ids.push(
            normalizeText(leg?.rawTripId || ''),
            normalizeText(leg?.tripId || ''),
            ...(Array.isArray(leg?.throughTripIds) ? leg.throughTripIds : [])
        );
    }

    return collectUniqueTripIds(ids);
};

const collectLegCandidateTripIds = (leg) => collectUniqueTripIds([
    normalizeText(leg?.rawTripId || ''),
    normalizeText(leg?.tripId || ''),
    ...(Array.isArray(leg?.throughTripIds) ? leg.throughTripIds : [])
]);

const detectJourneyThroughCategoryMeta = async ({ tripIds, serviceDay }) => {
    const ids = collectUniqueTripIds(tripIds);
    if (!ids.length) return null;

    const trips = [];
    for (const tripId of ids) {
        const trip = await loadJourneyTripByTripId({ tripId, serviceDay });
        if (trip) trips.push(trip);
    }
    if (!trips.length) return null;

    const category = normalizeText(detectThroughServiceCategoryFromTrips(trips));
    const display = THROUGH_SERVICE_DISPLAY?.[category] || null;
    if (!category || !display) return null;

    return {
        category,
        name: normalizeText(display?.name || ''),
        color: normalizeText(display?.color || '') || null
    };
};

const extractJourneyTripSpecialNames = (tripLike) => {
    const list = Array.isArray(tripLike?.nm) ? tripLike.nm : [];
    const out = [];
    for (const item of list) {
        const name = normalizeText(item?.['zh-Hans'] || item?.['zh-Hnas'] || item?.ja || item?.en);
        if (name) out.push(name);
    }
    return Array.from(new Set(out));
};

const detectJourneySpecialNameText = async ({ tripIds, serviceDay }) => {
    const ids = collectUniqueTripIds(tripIds);
    if (!ids.length) return '';

    const names = new Set();
    for (const tripId of ids) {
        const trip = await loadJourneyTripByTripId({ tripId, serviceDay });
        if (!trip) continue;
        for (const name of extractJourneyTripSpecialNames(trip)) names.add(name);
    }

    return Array.from(names).join(' / ');
};

const collectPlanCandidateTripIds = (displayPlan) => {
    const sections = Array.isArray(displayPlan?.sections) ? displayPlan.sections : [];
    if (sections.length) {
        const ids = [];
        for (const section of sections) {
            ids.push(...collectSectionCandidateTripIds(section));
        }
        return collectUniqueTripIds(ids);
    }

    const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
    const ids = [];
    for (const leg of legs) ids.push(...collectLegCandidateTripIds(leg));
    return collectUniqueTripIds(ids);
};

const TRAVEL_HISTORY_KEY = 'TokyoRailSearchHistory';
const TRAVEL_MAX_HISTORY = 20;

const normalizeTravelHistoryQuery = (q) => normalizeText(q).slice(0, 120);

const loadTravelHistory = () => {
    try {
        const raw = window.localStorage?.getItem?.(TRAVEL_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeTravelHistoryQuery).filter(Boolean).slice(0, TRAVEL_MAX_HISTORY);
    } catch {
        return [];
    }
};

const saveTravelHistory = (items) => {
    try {
        const list = Array.isArray(items) ? items.map(normalizeTravelHistoryQuery).filter(Boolean) : [];
        window.localStorage?.setItem?.(TRAVEL_HISTORY_KEY, JSON.stringify(list.slice(0, TRAVEL_MAX_HISTORY)));
    } catch {
        // ignore
    }
};

const addTravelHistory = (q) => {
    const value = normalizeTravelHistoryQuery(q);
    if (!value) return;
    const list = loadTravelHistory();
    const next = [value, ...list.filter((x) => x !== value)].slice(0, TRAVEL_MAX_HISTORY);
    saveTravelHistory(next);
};

let journeyStationCodeMapPromise = null;
const getJourneyStationCodeMap = async () => {
    if (journeyStationCodeMapPromise) return journeyStationCodeMapPromise;
    journeyStationCodeMapPromise = (async () => {
        try {
            const list = await getCachedJson('./data/stations.json');
            const map = new Map();
            for (const s of Array.isArray(list) ? list : []) {
                const id = normalizeText(s?.id);
                const code = normalizeText(s?.title?.code || '');
                if (!id || !code) continue;
                map.set(id, code);
            }
            return map;
        } catch {
            return new Map();
        }
    })();
    return journeyStationCodeMapPromise;
};

const travelIsDarkThemeActive = () => {
    try {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
        return false;
    }
};

const travelParseCssColorToRgb = (input) => {
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

const travelRgbToHex = ({ r, g, b }) => {
    const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

const travelRelativeLuminance = ({ r, g, b }) => {
    const toLinear = (v) => {
        const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
        return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const TRAVEL_DARK_INVERT_TRIGGER_LUMINANCE = (() => {
    const ref = travelParseCssColorToRgb('#005AAA');
    return ref ? travelRelativeLuminance(ref) : 0.102;
})();

const travelAdjustColorForDarkThemeIfNeeded = (color) => {
    const parsed = travelParseCssColorToRgb(color);
    if (!parsed) return normalizeText(color);

    const lum = travelRelativeLuminance(parsed);
    if (!(lum < TRAVEL_DARK_INVERT_TRIGGER_LUMINANCE)) return normalizeText(color);

    const inverted = {
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    };
    return travelRgbToHex(inverted);
};

const resolveJourneyColorForTheme = (color) => {
    const raw = normalizeText(color);
    if (!raw) return raw;
    if (!travelIsDarkThemeActive()) return raw;
    return travelAdjustColorForDarkThemeIfNeeded(raw);
};

const isLocalTypeName = (name) => {
    const text = normalizeText(name).toLowerCase();
    if (!text) return false;
    return text === '普通' || text === '各站停车' || text === '各駅停車' || text === 'local';
};

let travelHtml2canvasPromise = null;

const loadExternalScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-html2canvas-lib="${src}"]`);
    if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
        return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.html2canvasLib = src;
    script.addEventListener('load', () => {
        script.dataset.loaded = '1';
        resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`加载失败: ${src}`)), { once: true });
    document.head.appendChild(script);
});

const ensureTravelHtml2canvas = async () => {
    if (typeof window !== 'undefined' && typeof window.html2canvas === 'function') {
        return window.html2canvas;
    }
    if (travelHtml2canvasPromise) return travelHtml2canvasPromise;

    travelHtml2canvasPromise = (async () => {
        await loadExternalScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
        if (typeof window === 'undefined' || typeof window.html2canvas !== 'function') {
            throw new Error('html2canvas 未加载');
        }
        return window.html2canvas;
    })();

    return travelHtml2canvasPromise;
};

const travelNowIsoCompact = () => {
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

const travelSanitizeFilePart = (s) => String(s || '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_.\-\u4e00-\u9fa5]/g, '_')
    .slice(0, 120);

const travelNextFrame = () => new Promise((resolve) => window.requestAnimationFrame(() => resolve()));

const travelCanvasToBlobPng = (canvas) => new Promise((resolve, reject) => {
    try {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('toBlob 返回空结果'));
        }, 'image/png');
    } catch (err) {
        reject(err);
    }
});

const collectTravelScrollableState = (rootEl) => {
    const states = [];
    if (!(rootEl instanceof HTMLElement)) return states;
    const nodes = [rootEl, ...Array.from(rootEl.querySelectorAll('*'))];
    for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const cs = window.getComputedStyle(node);
        const overflowY = normalizeText(cs.overflowY || cs.overflow).toLowerCase();
        const overflowX = normalizeText(cs.overflowX || cs.overflow).toLowerCase();
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

const restoreTravelScrollableState = (states) => {
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

const downloadTravelBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportJourneyPopoverToPng = async (element, filenameBase, buttonEl) => {
    if (!(element instanceof HTMLElement)) return;
    const btn = buttonEl instanceof HTMLButtonElement ? buttonEl : null;
    const prevDisabled = btn?.disabled;
    const EXPORT_CLASS = 'is-journey-trip-exporting';
    let exportStyleEl = null;
    try {
        if (btn) btn.disabled = true;
        const html2canvas = await ensureTravelHtml2canvas();
        const states = collectTravelScrollableState(element);
        await travelNextFrame();
        await travelNextFrame();
        let blob = null;
        try {
            document.documentElement.classList.add(EXPORT_CLASS);
            if (!document.querySelector('style[data-journey-trip-export-style="1"]')) {
                exportStyleEl = document.createElement('style');
                exportStyleEl.setAttribute('data-journey-trip-export-style', '1');
                exportStyleEl.textContent = `
                    html.${EXPORT_CLASS} .journey-trip-popover {
                        border-radius: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                    }
                    html.${EXPORT_CLASS} .journey-trip-popover .journey-trip-capture-btn {
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
            blob = await travelCanvasToBlobPng(canvas);
        } finally {
            document.documentElement.classList.remove(EXPORT_CLASS);
            if (exportStyleEl) {
                try { exportStyleEl.remove(); } catch { /* ignore */ }
                exportStyleEl = null;
            }
            restoreTravelScrollableState(states);
        }

        const base = travelSanitizeFilePart(filenameBase) || 'journey-detail';
        downloadTravelBlob(blob, `${base}-${travelNowIsoCompact()}.png`);
    } catch {
        // ignore
    } finally {
        if (btn) btn.disabled = !!prevDisabled;
    }
};

function buildStationIcon(isTransfer) {
    const wrap = el('span', 'search-result-icon');
    const dot = el('span', 'search-result-icon--station');
    const border = isTransfer ? 4 : 0.5;
    const size = isTransfer ? 18 : 12;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderWidth = `${border}px`;
    wrap.appendChild(dot);
    return wrap;
}

const isElementTextMultiLine = (node) => {
    if (!(node instanceof HTMLElement)) return false;
    const cs = window.getComputedStyle(node);
    const lineHeight = Number.parseFloat(cs.lineHeight || '0');
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        return node.getClientRects().length > 1;
    }
    return node.scrollHeight > (lineHeight * 1.45);
};

const refreshJourneyStationLineAlignment = (rootEl) => {
    if (!(rootEl instanceof HTMLElement)) return;
    const lineNodes = rootEl.querySelectorAll('.journey-station-result-lines');
    lineNodes.forEach((lineNode) => {
        if (!(lineNode instanceof HTMLElement)) return;
        const textNode = lineNode.closest('.journey-station-result-text');
        if (!(textNode instanceof HTMLElement)) return;
        const isMultiline = isElementTextMultiLine(lineNode);
        textNode.classList.toggle('is-lines-multiline', isMultiline);
        if (isMultiline) {
            textNode.style.setProperty('--journey-line-offset', '0px');
            return;
        }

        const nameNode = textNode.querySelector('.journey-station-result-name');
        if (!(nameNode instanceof HTMLElement)) {
            textNode.style.setProperty('--journey-line-offset', '0px');
            return;
        }

        const nameRect = nameNode.getBoundingClientRect();
        const lineRect = lineNode.getBoundingClientRect();
        const delta = nameRect.bottom - lineRect.bottom;
        const clamped = Math.max(-8, Math.min(8, delta));
        textNode.style.setProperty('--journey-line-offset', `${clamped.toFixed(2)}px`);
    });
};

export function mountTravelSearchUI() {
    if (document.querySelector('.journey-ui')) {
        return window.TokyoRailJourneyUI;
    }

    const root = el('div', 'journey-ui is-collapsed');

    const fab = el('button', 'journey-fab', { type: 'button', 'aria-label': '行程搜索' });
    const fabIcon = el('img', 'journey-fab-icon', { alt: '' });
    setImageElementFromCache(fabIcon, [
        ...getIconCandidates('travel.svg'),
        ...getIconCandidates('search.svg')
    ], {
        cacheKey: 'icon:travel_or_search',
        fallbackSrc: getPreferredCachedImageSrc(getIconCandidates('travel.svg'), { cacheKey: 'icon:travel.svg' })
    }).catch(() => null);
    fab.appendChild(fabIcon);

    const bar = el('div', 'journey-bar');
    const originWrap = el('div', 'journey-input-wrap');
    const originInput = el('input', 'journey-input journey-input-origin', {
        type: 'search',
        placeholder: '起点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const originMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择起点站' });
    const originMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    setJourneyIconFromCache(originMapPickIcon, 'map-select.svg');
    originMapPickBtn.appendChild(originMapPickIcon);
    originWrap.appendChild(originInput);
    originWrap.appendChild(originMapPickBtn);

    const divider = el('button', 'journey-divider', {
        type: 'button',
        'aria-label': '切换起点和终点'
    });
    const dividerIcon = el('img', 'journey-divider-icon', { alt: '' });
    setJourneyIconFromCache(dividerIcon, 'change-dirc.svg');
    divider.appendChild(dividerIcon);

    const destinationWrap = el('div', 'journey-input-wrap');
    const destinationInput = el('input', 'journey-input journey-input-destination', {
        type: 'search',
        placeholder: '终点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const destinationMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择终点站' });
    const destinationMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    setJourneyIconFromCache(destinationMapPickIcon, 'map-select.svg');
    destinationMapPickBtn.appendChild(destinationMapPickIcon);
    destinationWrap.appendChild(destinationInput);
    destinationWrap.appendChild(destinationMapPickBtn);

    const closeBtn = el('button', 'journey-close-btn', {
        type: 'button',
        'aria-label': '关闭行程搜索并清空'
    });
    const closeIcon = el('img', 'journey-close-icon', { alt: '' });
    setJourneyIconFromCache(closeIcon, 'x.svg');
    closeBtn.appendChild(closeIcon);

    bar.appendChild(originWrap);
    bar.appendChild(divider);
    bar.appendChild(destinationWrap);
    bar.appendChild(closeBtn);

    const results = el('div', 'journey-results is-hidden');
    const list = el('ul', 'search-results-list');
    results.appendChild(list);

    const planResults = el('div', 'journey-plan-results is-hidden');
    const planList = el('ul', 'journey-plan-list');
    planResults.appendChild(planList);

    const tripPopover = el('div', 'journey-trip-popover is-hidden');
    const tripPopoverHeader = el('div', 'journey-trip-header');
    const tripPopoverTitle = el('div', 'journey-trip-title');
    const tripCaptureBtn = el('button', 'journey-trip-capture-btn', { type: 'button', 'aria-label': '截图' });
    const tripCaptureIcon = el('img', 'journey-trip-capture-icon', { alt: '' });
    setJourneyIconFromCache(tripCaptureIcon, 'camera.svg');
    tripCaptureBtn.appendChild(tripCaptureIcon);
    tripPopoverHeader.appendChild(tripPopoverTitle);
    tripPopoverHeader.appendChild(tripCaptureBtn);
    const tripPopoverBody = el('div', 'journey-trip-body');
    tripPopover.appendChild(tripPopoverHeader);
    tripPopover.appendChild(tripPopoverBody);
    document.body.appendChild(tripPopover);

    root.appendChild(fab);
    root.appendChild(bar);
    root.appendChild(results);
    root.appendChild(planResults);
    document.body.appendChild(root);

    let activeField = 'origin';
    let selectedOriginId = '';
    let selectedDestinationId = '';
    let composingOrigin = false;
    let composingDestination = false;
    let mapPickTarget = null; // 'origin' | 'destination' | null
    let lastPlanComputeKey = '';
    let planComputeToken = 0;
    let popoverHideTimer = null;
    let pinnedTripPopoverKey = '';
    let planPreviewHideTimer = null;
    let activePlanPreviewKey = '';
    let pinnedPlanPreviewKey = '';
    let planPreviewRequestToken = 0;

    try {
        window.__TokyoRailJourneyMapPickActive = false;
        window.__TokyoRailSuppressStationSelectionUntil = 0;
    } catch {
        // ignore
    }

    const suppressStationSelectionOnce = (ms = 700) => {
        try {
            const now = Date.now();
            const until = now + Math.max(0, Number(ms) || 0);
            const prev = Number(window.__TokyoRailSuppressStationSelectionUntil) || 0;
            window.__TokyoRailSuppressStationSelectionUntil = Math.max(prev, until);
        } catch {
            // ignore
        }
    };

    const getMapInstance = () => {
        try {
            return window.__TokyoRailMap || null;
        } catch {
            return null;
        }
    };

    const setMapPickTarget = (target) => {
        mapPickTarget = target === 'origin' || target === 'destination' ? target : null;
        originMapPickBtn.classList.toggle('is-active', mapPickTarget === 'origin');
        destinationMapPickBtn.classList.toggle('is-active', mapPickTarget === 'destination');
        try {
            window.__TokyoRailJourneyMapPickActive = !!mapPickTarget;
        } catch {
            // ignore
        }
    };

    const resolveStationByName = async (name) => {
        const q = normalizeText(name);
        if (!q) return null;
        const hits = await searchRailEntities(q, { limit: 20, allowedTypes: new Set(['station']) });
        const list = Array.isArray(hits) ? hits : [];
        const exact = list.find((x) => normalizeText(x?.text) === q);
        return exact || list[0] || null;
    };

    const applyPickedStation = async ({ target, stationId, stationName }) => {
        suppressStationSelectionOnce(900);
        const key = target === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;

        let resolvedId = normalizeText(stationId);
        let resolvedName = normalizeText(stationName);

        if (!resolvedId && resolvedName) {
            const hit = await resolveStationByName(resolvedName);
            if (hit) {
                resolvedId = normalizeText(hit.id);
                if (!resolvedName) resolvedName = normalizeText(hit.text);
            }
        }

        if (!resolvedName && resolvedId) {
            const byId = await searchRailEntities(resolvedId, { limit: 10, allowedTypes: new Set(['station']) });
            const list = Array.isArray(byId) ? byId : [];
            const hit = list.find((x) => normalizeText(x?.id) === resolvedId) || list[0] || null;
            if (hit) resolvedName = normalizeText(hit.text);
        }

        if (!resolvedName && !resolvedId) return;

        input.value = resolvedName || input.value;
        input.dataset.stationId = resolvedId || '';
        if (key === 'origin') selectedOriginId = resolvedId || '';
        else selectedDestinationId = resolvedId || '';

        setMapPickTarget(null);
        results.classList.add('is-hidden');
        maybeComputePlans();
    };

    // 供外部 UI（如 panel header 下拉）直接写入起终点。
    // 注意：规划时优先使用 selectedOriginId/selectedDestinationId，因此必须同步更新它们。
    const applyExternalStationSelection = (field, stationId, stationName, options = {}) => {
        const key = field === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;

        const resolvedId = normalizeText(stationId);
        const resolvedName = normalizeText(stationName);
        if (!resolvedId && !resolvedName) return false;

        if (options?.expand !== false) {
            try { root.classList.remove('is-collapsed'); } catch {}
        }

        input.value = resolvedName || input.value;
        input.dataset.stationId = resolvedId || '';
        if (key === 'origin') selectedOriginId = resolvedId || '';
        else selectedDestinationId = resolvedId || '';

        // 外部写入也应退出 map pick 状态
        try { setMapPickTarget(null); } catch {}
        results.classList.add('is-hidden');

        if (options?.recompute !== false) {
            lastPlanComputeKey = '';
            maybeComputePlans();
        }
        return true;
    };

    const handleMapStationPick = async (eventLike) => {
        if (!mapPickTarget) return;

        const map = getMapInstance();
        if (!map) return;

        const point = eventLike?.point;
        const fromFeatures = (() => {
            const list = Array.isArray(eventLike?.features) ? eventLike.features : [];
            if (list.length) return list;
            if (!point) return [];
            try {
                return map.queryRenderedFeatures(point, { layers: ['stations-layer'] }) || [];
            } catch {
                return [];
            }
        })();

        const feature = fromFeatures[0];
        const props = feature?.properties || {};
        const stationId = normalizeText(props?.id || feature?.id || '');
        const stationName = normalizeText(props?.name_zh || props?.name || props?.name_ja || '');
        if (!stationId && !stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId,
            stationName
        });
    };

    const onDocumentClickCapture = async (evt) => {
        if (!mapPickTarget) return;
        const target = evt?.target;
        if (!(target instanceof Element)) return;
        const labelEl = target.closest('.station-label');
        if (!labelEl) return;

        const stationName = normalizeText(labelEl.textContent || '');
        if (!stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId: '',
            stationName
        });
    };

    let mapPickHookBound = false;
    const ensureMapPickHook = () => {
        if (mapPickHookBound) return;
        const map = getMapInstance();
        if (!map || typeof map.on !== 'function') return;
        map.on('click', (e) => {
            handleMapStationPick(e);
        });
        mapPickHookBound = true;
    };

    const mapPickBindTimer = window.setInterval(() => {
        ensureMapPickHook();
        if (mapPickHookBound) window.clearInterval(mapPickBindTimer);
    }, 400);

    const getActiveInput = () => (activeField === 'destination' ? destinationInput : originInput);

    const clearPlanList = ({ clearMapPreview = false } = {}) => {
        if (clearMapPreview) {
            try {
                const actions = window?.TokyoRailSearchMapActions;
                actions?.clearTripPathPreview?.();
            } catch {
                // ignore
            }
        }
        activePlanPreviewKey = '';
        pinnedPlanPreviewKey = '';
        planPreviewRequestToken += 1;
        if (planPreviewHideTimer) {
            window.clearTimeout(planPreviewHideTimer);
            planPreviewHideTimer = null;
        }
        while (planList.firstChild) planList.removeChild(planList.firstChild);
        hideTripPopover();
    };

    const clearTripPopoverBody = () => {
        while (tripPopoverBody.firstChild) tripPopoverBody.removeChild(tripPopoverBody.firstChild);
    };

    const hideTripPopover = () => {
        tripPopover.classList.add('is-hidden');
        clearTripPopoverBody();
        pinnedTripPopoverKey = '';
    };

    const scheduleHideTripPopover = () => {
        if (pinnedTripPopoverKey) return;
        if (popoverHideTimer) window.clearTimeout(popoverHideTimer);
        popoverHideTimer = window.setTimeout(() => {
            hideTripPopover();
        }, 120);
    };

    const cancelHideTripPopover = () => {
        if (!popoverHideTimer) return;
        window.clearTimeout(popoverHideTimer);
        popoverHideTimer = null;
    };

    const cancelHidePlanPreview = () => {
        if (!planPreviewHideTimer) return;
        window.clearTimeout(planPreviewHideTimer);
        planPreviewHideTimer = null;
    };

    const clearJourneyPlanPreview = ({ force = false, clearMapPreview = true } = {}) => {
        if (!force && pinnedPlanPreviewKey) return;
        cancelHidePlanPreview();
        if (!activePlanPreviewKey && !force) return;
        if (clearMapPreview) {
            try {
                window?.TokyoRailSearchMapActions?.clearTripPathPreview?.();
            } catch {
                // ignore
            }
        }
        activePlanPreviewKey = '';
    };

    const scheduleClearJourneyPlanPreview = (delayMs = 120) => {
        cancelHidePlanPreview();
        planPreviewHideTimer = window.setTimeout(() => {
            planPreviewHideTimer = null;
            clearJourneyPlanPreview({ force: false });
        }, Math.max(0, Number(delayMs) || 0));
    };

    const buildTripPreviewPayloadFromDisplayPlanLegacy = async ({ row, displayPlan }) => {
        const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
        if (!legs.length) return null;

        const segments = [];
        for (const leg of legs) {
            if (!leg || leg.kind !== 'rail') continue;

            const lineId = normalizeText(leg?.lineId);
            if (!lineId) continue;

            const trip = await resolveTripForLeg({ leg, serviceDay: row?.serviceDay });
            const segDir = trip ? (normalizeText(trip?.d) || null) : null;
            let stationIds = [];
            if (trip) {
                const rows = toLegStopRows({ trip, leg });
                stationIds = rows.map((x) => normalizeText(x?.stationId)).filter(Boolean);
            } else {
                stationIds = [normalizeText(leg?.fromStop), normalizeText(leg?.toStop)].filter(Boolean);
            }

            const compactIds = [];
            for (const sid of stationIds) {
                if (!sid) continue;
                if (compactIds.length && compactIds[compactIds.length - 1] === sid) continue;
                compactIds.push(sid);
            }
            if (compactIds.length < 2) continue;

            const seg = {
                kind: 'main',
                lineId,
                stationIds: compactIds
            };
            if (segDir) seg.d = segDir;
            segments.push(seg);
        }

        if (!segments.length) return null;

        const firstSeg = segments[0];
        const lastSeg = segments[segments.length - 1];
        const firstLeg = legs[0] || null;

        return {
            tripKey: normalizeText(firstLeg?.tripKey || `${toHHMM(displayPlan?.firstDepMs)}-${toHHMM(displayPlan?.arrivalMs)}`),
            selectedLineId: normalizeText(firstSeg?.lineId),
            mainLineId: normalizeText(firstSeg?.lineId),
            originStationId: normalizeText(row?.originStationId || firstSeg?.stationIds?.[0]),
            mainTerminalStationId: normalizeText(firstSeg?.stationIds?.[firstSeg.stationIds.length - 1]),
            terminalStationId: normalizeText(lastSeg?.stationIds?.[lastSeg.stationIds.length - 1]),
            typeName: normalizeText(firstLeg?.typeName || '普通'),
            hasNt: false,
            fitMode: 'preview',
            segments
        };
    };

    const applyJourneyPlanPreview = async ({ row, previewKey, pin = false, interaction = 'hover', clearBefore = true } = {}) => {
        const actions = window?.TokyoRailSearchMapActions;
        if (!actions || typeof actions.previewTripPath !== 'function') return;

        const interactionText = String(interaction || '').trim() || 'hover';
        const fitMode = interactionText === 'click' ? 'commit' : 'preview';

        const token = ++planPreviewRequestToken;
        const displayPlan = await getDisplayPlanForRow(row);
        const payload = await buildTripPreviewPayloadFromDisplayPlan({ row, displayPlan });
        if (token !== planPreviewRequestToken) return;
        if (!payload) return;

        try {
            actions.previewTripPath(
                {
                    ...(payload || {}),
                    __previewInteraction: interactionText,
                    fitMode
                },
                { clearBefore: clearBefore === true, fitMode }
            );
        } catch {
            return;
        }

        activePlanPreviewKey = normalizeText(previewKey);
        if (pin) pinnedPlanPreviewKey = activePlanPreviewKey;
    };

    const getDisplayPlanForRow = async (row) => {
        if (!row || !row.plan) return null;
        if (row.__displayPlan) return row.__displayPlan;

        const expandedLegs = await expandLegsForDisplay({
            legs: row?.plan?.legs || [],
            serviceDay: row?.serviceDay,
            originStationId: row?.originStationId
        });

        const firstLeg = expandedLegs[0] || null;
        const lastLeg = expandedLegs[expandedLegs.length - 1] || null;

        const firstDepMs = Number.isFinite(Number(firstLeg?.depMs))
            ? Number(firstLeg.depMs)
            : (Number.isFinite(Number(row.plan.firstDepMs)) ? Number(row.plan.firstDepMs) : null);
        const arrivalMs = Number.isFinite(Number(lastLeg?.arrMs))
            ? Number(lastLeg.arrMs)
            : (Number.isFinite(Number(row.plan.arrivalMs)) ? Number(row.plan.arrivalMs) : null);

        const baseDepartureMs = Number.isFinite(Number(row?.baseDepartureMs))
            ? Number(row.baseDepartureMs)
            : (Number.isFinite(Number(row?.plan?.baseDepartureMs)) ? Number(row.plan.baseDepartureMs) : null);

        const durationMs = (Number.isFinite(baseDepartureMs) && Number.isFinite(arrivalMs))
            ? (arrivalMs - baseDepartureMs)
            : ((Number.isFinite(firstDepMs) && Number.isFinite(arrivalMs)) ? (arrivalMs - firstDepMs) : row.plan.durationMs);

        const sections = Array.isArray(row?.plan?.sections) ? row.plan.sections : [];
        let transfers = 0;
        if (sections.length) {
            transfers = Math.max(0, sections.length - 1);
        } else {
            for (let i = 0; i < expandedLegs.length - 1; i += 1) {
                if (!isThroughLegPairByMeta({ currentLeg: expandedLegs[i], nextLeg: expandedLegs[i + 1] })) transfers += 1;
            }
        }

        row.__displayPlan = {
            ...row.plan,
            legs: expandedLegs,
            sections,
            firstDepMs: Number.isFinite(firstDepMs) ? firstDepMs : row.plan.firstDepMs,
            arrivalMs: Number.isFinite(arrivalMs) ? arrivalMs : row.plan.arrivalMs,
            durationMs,
            transfers
        };
        return row.__displayPlan;
    };

    const renderTripDetailBody = async ({ row }) => {
        clearTripPopoverBody();
        const displayPlan = await getDisplayPlanForRow(row);
        const sectionsForDisplay = Array.isArray(displayPlan?.sections) ? displayPlan.sections : [];
        const sectionThroughMetaList = sectionsForDisplay.length
            ? await Promise.all(sectionsForDisplay.map((section) => detectJourneyThroughCategoryMeta({
                tripIds: collectSectionCandidateTripIds(section),
                serviceDay: row?.serviceDay
            })))
            : [];

        const blocks = await buildPlanDetailBlocks({
            plan: row.plan,
            legsOverride: displayPlan?.legs,
            sectionsOverride: displayPlan?.sections,
            serviceDay: row.serviceDay,
            originStationId: row.originStationId
        });
        if (!blocks.length) {
            tripPopoverBody.appendChild(el('div', 'journey-trip-empty', { text: '无详细停站信息' }));
            return;
        }

        const overallDestinationStationId = normalizeText(row?.destinationStationId || (displayPlan?.legs && displayPlan.legs.length ? displayPlan.legs[displayPlan.legs.length - 1]?.toStop : '') || '');
        const stationCodeMap = await getJourneyStationCodeMap();
        let shouldAppendDirectionForNextNote = true;
        let currentSectionIndex = 0;
        let hasRenderedSectionLineNote = false;

        for (const block of blocks) {
            if (block.kind === 'transfer') {
                const transferRow = el('div', 'journey-trip-transfer-row');
                transferRow.appendChild(el('span', 'journey-trip-transfer-label', { text: '换乘' }));
                tripPopoverBody.appendChild(transferRow);
                shouldAppendDirectionForNextNote = true;
                currentSectionIndex += 1;
                hasRenderedSectionLineNote = false;
                continue;
            }

            const sectionThroughMeta = sectionThroughMetaList[currentSectionIndex] || null;
            const lineText = normalizeText(sectionThroughMeta?.name || block.lineDisplayName || block.lineName);
            const lineColorResolved = normalizeText(sectionThroughMeta?.color || block.lineColor || '');
            const shouldRenderLineNote = !hasRenderedSectionLineNote;

            const blockRows = Array.isArray(block?.rows) ? block.rows : [];
            const blockLast = blockRows.length ? blockRows[blockRows.length - 1] : null;
            const directionDestination = shouldAppendDirectionForNextNote
                ? normalizeText(getStationNameById(overallDestinationStationId) || blockLast?.stationName || blockLast?.stationId || '')
                : '';
            if (shouldRenderLineNote) {
                const note = createTimetableNoteRow({
                    rowClass: 'journey-trip-note-row',
                    dotClass: 'journey-trip-note-dot',
                    lineClass: 'journey-trip-note-line',
                    typeClass: 'journey-trip-note-type',
                    directionClass: 'journey-trip-note-direction',
                    lineText,
                    lineColor: lineColorResolved ? String(resolveJourneyColorForTheme(lineColorResolved)) : '',
                    dotColor: lineColorResolved ? String(resolveJourneyColorForTheme(lineColorResolved)) : '',
                    typeText: block.typeName,
                    typeColor: block.typeColor ? String(resolveJourneyColorForTheme(block.typeColor)) : '',
                    directionText: directionDestination ? ` 往 ${directionDestination} /` : ''
                });
                if (travelIsDarkThemeActive() && isLocalTypeName(block.typeName)) {
                    const noteTypeEl = note.querySelector('.journey-trip-note-type');
                    if (noteTypeEl instanceof HTMLElement) noteTypeEl.style.color = '#fff';
                }
                if (shouldAppendDirectionForNextNote) shouldAppendDirectionForNextNote = false;
                hasRenderedSectionLineNote = true;
                tripPopoverBody.appendChild(note);
            }

            for (let i = 0; i < block.rows.length; i += 1) {
                const s = block.rows[i];
                const isFirst = i === 0;
                const isLast = i === block.rows.length - 1;
                const stationId = normalizeText(s.stationId || '');
                const arriveText = normalizeText(s.arrText || '') || (isFirst ? normalizeText(s.depText || '') : '');
                const stationText = buildTimetableStationText({
                    stationCode: normalizeText(stationCodeMap.get(stationId) || ''),
                    stationName: normalizeText(s.stationName || s.stationId),
                    stationId
                });
                const depText = overallDestinationStationId && stationId && overallDestinationStationId === stationId
                    ? ''
                    : (normalizeText(s.depText || '') || (isLast ? '-' : ''));
                const rowEl = createTimetableStationRow({
                    rowClass: s?.isPast ? 'journey-trip-row is-past' : 'journey-trip-row',
                    stationClass: 'journey-trip-station',
                    arriveCellClass: 'journey-trip-time journey-trip-arrive',
                    departCellClass: 'journey-trip-time journey-trip-depart',
                    arriveTextClass: 'journey-trip-time-arrive',
                    departTextClass: 'journey-trip-time-depart',
                    destinationTextClass: 'journey-trip-time-arrive journey-trip-time-destination',
                    stationId,
                    stationText,
                    arrivalText: arriveText,
                    departureText: depText,
                    showDestination: !!(overallDestinationStationId && stationId && overallDestinationStationId === stationId),
                    destinationText: '目的地'
                });
                tripPopoverBody.appendChild(rowEl);
            }
        }
    };

    const positionTripPopover = (anchorEl) => {
        const rect = anchorEl.getBoundingClientRect();
        const maxW = 360;
        tripPopover.style.minWidth = `250px`;
        tripPopover.style.maxWidth = `${maxW}px`;
        tripPopover.classList.remove('is-hidden');

        const popRect = tripPopover.getBoundingClientRect();
        const gap = 10;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;

        let left = rect.right + gap;
        if (left + popRect.width > vw - 8) {
            left = Math.max(8, rect.left - gap - popRect.width);
        }

        let top = rect.top;
        if (top + popRect.height > vh - 8) {
            top = Math.max(8, vh - popRect.height - 8);
        }
        top = Math.max(8, top);

        tripPopover.style.left = `${Math.round(left)}px`;
        tripPopover.style.top = `${Math.round(top)}px`;
    };

    const showTripPopover = async ({ anchorEl, row }) => {
        cancelHideTripPopover();
        const displayPlan = await getDisplayPlanForRow(row);
        const planLegs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : (Array.isArray(row?.plan?.legs) ? row.plan.legs : []);
        const fallbackOriginId = normalizeText(planLegs[0]?.fromStop || '');
        const fallbackDestinationId = normalizeText(planLegs[planLegs.length - 1]?.toStop || '');
        const originStationId = normalizeText(row?.originStationId || fallbackOriginId);
        const destinationStationId = normalizeText(row?.destinationStationId || fallbackDestinationId);
        const originZh = getStationNameById(originStationId) || normalizeText(row?.originName || originStationId);
        const destinationZh = getStationNameById(destinationStationId) || normalizeText(row?.destinationName || destinationStationId);
        tripPopoverTitle.textContent = `${originZh} → ${destinationZh}`;
        await renderTripDetailBody({ row });
        positionTripPopover(anchorEl);
    };

    const showPlanMessage = (message) => {
        clearPlanList();
        const li = document.createElement('li');
        li.className = 'journey-plan-item';
        const empty = el('div', 'journey-plan-empty', { text: message });
        li.appendChild(empty);
        planList.appendChild(li);
        planResults.classList.remove('is-hidden');
    };

    const hidePlanResultsIfEmptyInputs = ({ clearMapPreview = false } = {}) => {
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        clearPlanList({ clearMapPreview });
        planResults.classList.add('is-hidden');
    };

    const appendJourneyPath = async (container, displayPlan, serviceDayHint = '') => {
        const effectiveServiceDay = normalizeText(serviceDayHint || displayPlan?.serviceDay || 'Weekday') || 'Weekday';
        const sectionList = Array.isArray(displayPlan?.sections) ? displayPlan.sections : [];
        if (sectionList.length) {
            for (let i = 0; i < sectionList.length; i += 1) {
                const section = sectionList[i] || {};
                const lineRuns = await buildSectionLineRunsForDisplay({
                    section,
                    serviceDay: effectiveServiceDay
                });
                const sectionThroughMeta = await detectJourneyThroughCategoryMeta({
                    tripIds: collectSectionCandidateTripIds(section),
                    serviceDay: effectiveServiceDay
                });

                if (sectionThroughMeta?.name) {
                    const lineSpan = el('span', 'journey-plan-line', { text: sectionThroughMeta.name });
                    if (sectionThroughMeta?.color) lineSpan.style.color = String(resolveJourneyColorForTheme(sectionThroughMeta.color));
                    container.appendChild(lineSpan);

                    const fallbackType = normalizeText(lineRuns?.[0]?.typeName || section?.legs?.[0]?.typeName || '');
                    const fallbackTypeColor = normalizeText(lineRuns?.[0]?.typeColor || section?.legs?.[0]?.typeColor || '');
                    if (fallbackType) {
                        const typeSpan = el('span', 'journey-plan-type', { text: fallbackType });
                        if (fallbackTypeColor) typeSpan.style.color = String(resolveJourneyColorForTheme(fallbackTypeColor));
                        container.appendChild(typeSpan);
                    }

                    if (i < sectionList.length - 1) {
                        const wrap = el('span', 'journey-plan-arrow');
                        const icon = el('img', 'journey-plan-arrow-icon', { alt: '' });
                        setJourneyIconFromCache(icon, 'arrow-right.svg');
                        if (travelIsDarkThemeActive()) icon.style.filter = 'brightness(0) invert(1)';
                        wrap.appendChild(icon);
                        container.appendChild(wrap);
                    }
                    continue;
                }

                if (!lineRuns.length) {
                    const lineIds = Array.isArray(section?.lineIds)
                        ? section.lineIds.map((x) => normalizeText(x)).filter(Boolean)
                        : [];
                    for (const lineId of lineIds) {
                        lineRuns.push({ lineId, typeName: '', typeColor: null });
                    }
                }

                if (!lineRuns.length) continue;

                for (let r = 0; r < lineRuns.length; r += 1) {
                    const run = lineRuns[r];
                    const lineMeta = await getLineMeta(run.lineId);
                    const lineText = normalizeText(lineMeta?.name || run.lineId || '线路');
                    const lineColor = normalizeText(lineMeta?.color || '');
                    const lineSpan = el('span', 'journey-plan-line', { text: lineText || '线路' });
                    if (lineColor) lineSpan.style.color = String(resolveJourneyColorForTheme(lineColor));
                    container.appendChild(lineSpan);

                    const runTypeText = normalizeText(run?.typeName || '');
                    if (runTypeText) {
                        const typeSpan = el('span', 'journey-plan-type', { text: runTypeText });
                        if (run?.typeColor) typeSpan.style.color = String(resolveJourneyColorForTheme(run.typeColor));
                        container.appendChild(typeSpan);
                    }

                    if (r < lineRuns.length - 1) {
                        const sep = el('span', 'journey-plan-line-sep', { text: '·' });
                        sep.style.color = travelIsDarkThemeActive() ? '#fff' : '#000';
                        container.appendChild(sep);
                    }
                }

                if (i < sectionList.length - 1) {
                    const wrap = el('span', 'journey-plan-arrow');
                    const icon = el('img', 'journey-plan-arrow-icon', { alt: '' });
                    setJourneyIconFromCache(icon, 'arrow-right.svg');
                    if (travelIsDarkThemeActive()) icon.style.filter = 'brightness(0) invert(1)';
                    wrap.appendChild(icon);
                    container.appendChild(wrap);
                }
            }
            return;
        }

        const legs = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
        for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i];
            const legThroughMeta = await detectJourneyThroughCategoryMeta({
                tripIds: collectLegCandidateTripIds(leg),
                serviceDay: effectiveServiceDay
            });

            if (legThroughMeta?.name) {
                const lineSpan = el('span', 'journey-plan-line', { text: legThroughMeta.name });
                if (legThroughMeta?.color) lineSpan.style.color = String(resolveJourneyColorForTheme(legThroughMeta.color));
                container.appendChild(lineSpan);

                const typeText = normalizeText(leg?.typeName || '');
                if (typeText) {
                    const typeSpan = el('span', 'journey-plan-type', { text: typeText });
                    if (leg?.typeColor) typeSpan.style.color = String(resolveJourneyColorForTheme(leg.typeColor));
                    container.appendChild(typeSpan);
                }

                if (i < legs.length - 1) {
                    const through = isThroughLegPairByMeta({ currentLeg: leg, nextLeg: legs[i + 1] });
                    const wrap = el('span', 'journey-plan-arrow');
                    const icon = el('img', 'journey-plan-arrow-icon', { alt: '' });
                    const arrowIconFile = through ? 'arrows.svg' : 'arrow-right.svg';
                    setJourneyIconFromCache(icon, arrowIconFile);
                    if (!through && travelIsDarkThemeActive()) {
                        icon.style.filter = 'brightness(0) invert(1)';
                    }
                    wrap.appendChild(icon);
                    container.appendChild(wrap);
                }
                continue;
            }

            const throughLineIds = Array.isArray(leg?.throughLineIds)
                ? leg.throughLineIds.map((x) => normalizeText(x)).filter(Boolean)
                : [];
            const uniqueThroughLineIds = [];
            for (const lineId of throughLineIds) {
                if (!lineId) continue;
                if (!uniqueThroughLineIds.length || uniqueThroughLineIds[uniqueThroughLineIds.length - 1] !== lineId) {
                    uniqueThroughLineIds.push(lineId);
                }
            }

            if (uniqueThroughLineIds.length > 1) {
                const metas = await Promise.all(uniqueThroughLineIds.map((lineId) => getLineMeta(lineId)));
                for (let m = 0; m < metas.length; m += 1) {
                    const meta = metas[m];
                    const lineId = uniqueThroughLineIds[m] || '';
                    const lineText = normalizeText(meta?.name || lineId || '线路');
                    const lineColor = normalizeText(meta?.color || '');
                    const lineSpan = el('span', 'journey-plan-line', { text: lineText || '线路' });
                    if (lineColor) lineSpan.style.color = String(resolveJourneyColorForTheme(lineColor));
                    container.appendChild(lineSpan);

                    if (m < metas.length - 1) {
                        const sep = el('span', 'journey-plan-line-sep', { text: '·' });
                        sep.style.color = travelIsDarkThemeActive() ? '#fff' : '#000';
                        container.appendChild(sep);
                    }
                }
            } else {
                const lineMeta = await getLineMeta(leg.lineId);
                const lineText = normalizeText(lineMeta?.name || leg.lineId || '线路');
                const lineColor = normalizeText(lineMeta?.color || '');
                const lineSpan = el('span', 'journey-plan-line', { text: lineText || '线路' });
                if (lineColor) lineSpan.style.color = String(resolveJourneyColorForTheme(lineColor));
                container.appendChild(lineSpan);
            }

            const typeText = normalizeText(leg.typeName || '普通');
            const typeSpan = el('span', 'journey-plan-type', { text: typeText });
            if (leg?.typeColor) typeSpan.style.color = String(resolveJourneyColorForTheme(leg.typeColor));
            container.appendChild(typeSpan);

            if (i < legs.length - 1) {
                const through = isThroughLegPairByMeta({ currentLeg: leg, nextLeg: legs[i + 1] });
                const wrap = el('span', 'journey-plan-arrow');
                const icon = el('img', 'journey-plan-arrow-icon', { alt: '' });
                const arrowIconFile = through ? 'arrows.svg' : 'arrow-right.svg';
                setJourneyIconFromCache(icon, arrowIconFile);
                if (!through && travelIsDarkThemeActive()) {
                    icon.style.filter = 'brightness(0) invert(1)';
                }
                wrap.appendChild(icon);
                container.appendChild(wrap);
            }
        }
    };

    const renderPlanResults = async (rows) => {
        clearPlanList();
        if (!rows.length) {
            showPlanMessage('无可用路线');
            return;
        }

        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const displayPlan = await getDisplayPlanForRow(row);
            const li = document.createElement('li');
            li.className = 'journey-plan-item';

            const tagLabels = Array.isArray(row?.tagLabels)
                ? row.tagLabels.map((x) => normalizeText(x)).filter(Boolean)
                : [normalizeText(row?.label)].filter(Boolean);
            if (tagLabels.length) {
                const tagsWrap = el('div', 'journey-plan-tags');
                for (const tagText of tagLabels) {
                    let addText = tagText + "  ";
                    tagsWrap.appendChild(el('div', 'journey-plan-tag', { text: addText }));
                }
                li.appendChild(tagsWrap);
            }

            const head = el('div', 'journey-plan-head');
            head.appendChild(el('span', 'journey-plan-duration', { text: formatDuration(displayPlan?.durationMs) }));
            const transferText = Number(displayPlan?.transfers) > 0
                ? `${Number(displayPlan.transfers)}次换乘`
                : '直达';
            head.appendChild(el('span', 'journey-plan-transfer', { text: transferText }));
            head.appendChild(el('span', 'journey-plan-arrive', { text: `${toHHMM(displayPlan?.arrivalMs)}到达` }));
            li.appendChild(head);

            const path = el('div', 'journey-plan-path');
            await appendJourneyPath(path, displayPlan, row?.serviceDay || '');
            li.appendChild(path);

            const planSpecialName = await detectJourneySpecialNameText({
                tripIds: collectPlanCandidateTripIds(displayPlan),
                serviceDay: row?.serviceDay || ''
            });
            if (planSpecialName) {
                const specialLine = el('div', 'journey-plan-special-line', { text: planSpecialName });
                li.appendChild(specialLine);
            }

            if (i < rows.length - 1) {
                li.appendChild(el('div', 'journey-plan-sep'));
            }

            li.addEventListener('mouseenter', () => {
                cancelHidePlanPreview();
                const previewKey = `row-${i}`;
                if (!pinnedTripPopoverKey || pinnedTripPopoverKey === previewKey) {
                    showTripPopover({ anchorEl: li, row });
                }
                if (pinnedPlanPreviewKey && pinnedPlanPreviewKey !== previewKey) return;
                applyJourneyPlanPreview({ row, previewKey, pin: false, interaction: 'hover' });
            });
            li.addEventListener('mouseleave', () => {
                const previewKey = `row-${i}`;
                if (pinnedTripPopoverKey !== previewKey) {
                    scheduleHideTripPopover();
                }
                if (!pinnedPlanPreviewKey) {
                    scheduleClearJourneyPlanPreview(120);
                }
            });

            li.addEventListener('click', async (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                cancelHidePlanPreview();
                const previewKey = `row-${i}`;

                if (pinnedTripPopoverKey === previewKey) {
                    pinnedTripPopoverKey = '';
                    scheduleHideTripPopover();
                } else {
                    pinnedTripPopoverKey = previewKey;
                    showTripPopover({ anchorEl: li, row });
                }

                if (pinnedPlanPreviewKey === previewKey) {
                    pinnedPlanPreviewKey = '';
                    if (window?.__TokyoRailMultiSelectEnabled === true) {
                        await applyJourneyPlanPreview({
                            row,
                            previewKey,
                            pin: false,
                            interaction: 'click',
                            clearBefore: false
                        });
                        activePlanPreviewKey = '';
                    } else {
                        clearJourneyPlanPreview({ force: true });
                    }
                    return;
                }

                pinnedPlanPreviewKey = previewKey;
                applyJourneyPlanPreview({ row, previewKey, pin: true, interaction: 'click' });
            });

            planList.appendChild(li);
        }

        planResults.classList.remove('is-hidden');
    };

    const readServiceDayFromPanel = () => {
        const active = document.querySelector('.panel-day-seg button.is-active[data-day]');
        const day = normalizeText(active?.getAttribute?.('data-day') || '');
        return day === 'SaturdayHoliday' ? 'SaturdayHoliday' : 'Weekday';
    };

    const readDepartureBase = () => {
        const now = new Date();
        const serviceDayStartMs = getServiceDayStartMs(now);
        const input = document.querySelector('.settings-time-input');
        const hhmm = normalizeHHMM(input?.value || '') || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const offset = hhmmToOffsetMinutes(hhmm);
        const depMs = Number.isFinite(offset) ? serviceDayStartMs + offset * 60000 : now.getTime();
        return { serviceDayStartMs, departureMs: depMs };
    };

    const collectJourneyCandidates = async ({ sourceStops, destinationStops, serviceDay, baseDepartureMs }) => {
        const plans = await collectJourneyCandidatesRaptor({
            sourceStops,
            destinationStops,
            serviceDay,
            baseDepartureMs
        });
        return Array.isArray(plans) ? plans : [];
    };

    const maybeComputePlans = async () => {
        const originId = normalizeText(selectedOriginId || originInput.dataset.stationId || '');
        const destinationId = normalizeText(selectedDestinationId || destinationInput.dataset.stationId || '');

        if (!originId || !destinationId) {
            hidePlanResultsIfEmptyInputs();
            return;
        }
        if (originId === destinationId) {
            showPlanMessage('起点与终点相同');
            return;
        }

        const serviceDay = readServiceDayFromPanel();
        const originName = getStationNameById(originId) || normalizeText(originInput.value) || originId;
        const destinationName = getStationNameById(destinationId) || normalizeText(destinationInput.value) || destinationId;
        const { departureMs } = readDepartureBase();
        const key = `${originId}||${destinationId}||${serviceDay}||${Math.floor(departureMs / 60000)}`;
        if (key === lastPlanComputeKey) return;
        lastPlanComputeKey = key;

        const token = ++planComputeToken;
        showPlanMessage('正在计算路线...');

        await ensurePlannerStaticData();

        let sourceStops = getGroupStops(originId);
        sourceStops.add(originId);
        sourceStops = filterNearbyStops(originId, sourceStops, 800);
        const destinationStops = getGroupStops(destinationId);
        if (!sourceStops.size || !destinationStops.size || sameSet(sourceStops, destinationStops)) {
            showPlanMessage('未找到有效起终点');
            return;
        }

        const plans = await collectJourneyCandidates({
            sourceStops,
            destinationStops,
            serviceDay,
            baseDepartureMs: departureMs
        });

        if (token !== planComputeToken) return;
        if (!plans.length) {
            showPlanMessage('无可用路线');
            return;
        }

        const shortest = plans.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0] || null;
        const fewestTransfers = plans.slice().sort((a, b) => a.transfers - b.transfers || a.durationMs - b.durationMs || a.arrivalMs - b.arrivalMs)[0] || null;
        const earliestDeparture = plans.slice().sort((a, b) => a.firstDepMs - b.firstDepMs || a.arrivalMs - b.arrivalMs)[0] || null;

        const picked = pickPlanBuckets(plans).map((x) => {
            const plan = x?.plan || null;
            const tagLabels = [];
            if (plan && shortest === plan) tagLabels.push('最短用时');
            if (plan && fewestTransfers === plan) tagLabels.push('最少换乘');
            if (plan && earliestDeparture === plan) tagLabels.push('最早出发');
            if (!tagLabels.length) tagLabels.push(normalizeText(x?.label || '备用方案'));
            if (plan?.hasSurcharge) tagLabels.push('额外费用！');

            return {
                ...x,
                tagLabels,
                serviceDay,
                baseDepartureMs: departureMs,
                originStationId: originId,
                destinationStationId: destinationId,
                originName,
                destinationName
            };
        });
        await renderPlanResults(picked);
    };

    const clearList = () => {
        while (list.firstChild) list.removeChild(list.firstChild);
    };

    const expand = () => {
        if (!root.classList.contains('is-collapsed')) return;
        root.classList.remove('is-collapsed');
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
    };

    const collapse = () => {
        root.classList.add('is-collapsed');
        results.classList.add('is-hidden');
        hideTripPopover();
        clearJourneyPlanPreview({ force: true, clearMapPreview: false });
        pinnedPlanPreviewKey = '';
        if (!mapPickTarget) hidePlanResultsIfEmptyInputs({ clearMapPreview: false });
    };

    const clearJourneyInputsAndCollapse = () => {
        originInput.value = '';
        destinationInput.value = '';
        originInput.dataset.stationId = '';
        destinationInput.dataset.stationId = '';
        selectedOriginId = '';
        selectedDestinationId = '';
        lastPlanComputeKey = '';
        setMapPickTarget(null);
        hideTripPopover();
        clearPlanList({ clearMapPreview: false });
        planResults.classList.add('is-hidden');
        results.classList.add('is-hidden');
        collapse();
    };

    const collapseIfBothEmpty = () => {
        if (mapPickTarget) return;
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        collapse();
    };

    const renderEmpty = (text) => {
        clearList();
        const li = document.createElement('li');
        li.appendChild(el('div', 'search-empty', { text }));
        list.appendChild(li);
        results.classList.remove('is-hidden');
    };

    const renderHistoryResults = () => {
        clearList();
        const history = loadTravelHistory();
        if (!history.length) {
            results.classList.add('is-hidden');
            return;
        }

        {
            const li = document.createElement('li');
            const head = el('div', 'search-empty', { text: '搜索记录' });
            head.style.fontSize = '12px';
            head.style.fontWeight = '600';
            head.style.paddingTop = '8px';
            head.style.paddingBottom = '8px';
            li.appendChild(head);
            list.appendChild(li);
        }

        for (const text of history) {
            const li = document.createElement('li');
            const row = el('div', 'search-result-item');
            const icon = el('span', 'search-result-icon');
            const label = el('div', 'search-result-text', { text });
            label.style.flex = '1 1 auto';
            row.appendChild(icon);
            row.appendChild(label);

            const del = el('button', '', { type: 'button', 'aria-label': '删除记录' });
            del.textContent = 'x';
            del.style.marginLeft = 'auto';
            del.style.background = 'transparent';
            del.style.border = 'none';
            del.style.padding = '0 2px';
            del.style.cursor = 'pointer';
            del.style.color = 'inherit';
            del.style.fontSize = '15px';
            del.style.lineHeight = '1';
            del.style.opacity = '0.7';

            del.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                const next = loadTravelHistory().filter((x) => x !== text);
                saveTravelHistory(next);
                renderHistoryResults();
            });

            row.appendChild(del);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                const input = getActiveInput();
                input.value = text;
                refresh();
                try { input.focus?.(); } catch { /* ignore */ }
            });

            li.appendChild(row);
            list.appendChild(li);
        }

        {
            const li = document.createElement('li');
            const box = el('div', 'search-empty');
            box.style.textAlign = 'center';
            box.style.paddingTop = '10px';
            box.style.paddingBottom = '10px';

            const btn = el('button', '', { type: 'button' });
            btn.textContent = '删除所有记录';
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.padding = '0';
            btn.style.cursor = 'pointer';
            btn.style.color = 'inherit';
            btn.style.fontSize = '12px';
            btn.style.lineHeight = '1.2';

            btn.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                saveTravelHistory([]);
                renderHistoryResults();
            });

            box.appendChild(btn);
            li.appendChild(box);
            list.appendChild(li);
        }

        results.classList.remove('is-hidden');
    };

    const renderStationResults = async (items) => {
        clearList();
        if (!items.length) {
            renderEmpty('暂无站点结果');
            return;
        }

        for (const item of items) {
            const li = document.createElement('li');
            const row = el('div', 'search-result-item');
            const icon = buildStationIcon(item?.isTransfer === true);
            const text = el('div', 'search-result-text journey-station-result-text');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'journey-station-result-name';
            nameSpan.textContent = String(item?.text ?? '');
            text.appendChild(nameSpan);

            const lineMetas = await getLineMetaByIds(item?.lineIds);
            if (Array.isArray(lineMetas) && lineMetas.length) {
                const wrap = document.createElement('span');
                wrap.className = 'journey-station-result-lines';
                wrap.style.fontSize = '11px';
                wrap.style.whiteSpace = 'normal';

                lineMetas.forEach((meta, idx) => {
                    if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                    const seg = document.createElement('span');
                    seg.textContent = String(meta?.name || '');
                    if (meta?.color) seg.style.color = String(resolveJourneyColorForTheme(meta.color));
                    wrap.appendChild(seg);
                });

                text.appendChild(wrap);
            }

            row.appendChild(icon);
            row.appendChild(text);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();

                addTravelHistory(getActiveInput().value);

                const input = getActiveInput();
                input.value = String(item?.text ?? '');
                input.dataset.stationId = String(item?.id ?? '');

                if (activeField === 'origin') selectedOriginId = String(item?.id ?? '');
                else selectedDestinationId = String(item?.id ?? '');

                results.classList.add('is-hidden');
                maybeComputePlans();
            });

            li.appendChild(row);
            list.appendChild(li);
        }

        window.requestAnimationFrame(() => {
            refreshJourneyStationLineAlignment(list);
        });

        results.classList.remove('is-hidden');
    };

    const refresh = async () => {
        const input = getActiveInput();
        const q = normalizeText(input.value);
        if (!q) {
            clearList();
            renderHistoryResults();
            return;
        }

        const stationItems = await searchRailEntities(q, { limit: 30, allowedTypes: new Set(['station']) });
        await renderStationResults(Array.isArray(stationItems) ? stationItems : []);
    };

    const bindInput = (input, key) => {
        const isOrigin = key === 'origin';

        input.addEventListener('focus', () => {
            activeField = key;
            expand();
            refresh();
        });

        input.addEventListener('compositionstart', () => {
            if (isOrigin) composingOrigin = true;
            else composingDestination = true;
        });

        input.addEventListener('compositionend', () => {
            if (isOrigin) composingOrigin = false;
            else composingDestination = false;
            refresh();
        });

        input.addEventListener('input', () => {
            const composing = isOrigin ? composingOrigin : composingDestination;
            if (composing) return;

            if (isOrigin) selectedOriginId = '';
            else selectedDestinationId = '';

            lastPlanComputeKey = '';

            refresh();
        });

        input.addEventListener('search', () => {
            refresh();
        });
    };

    bindInput(originInput, 'origin');
    bindInput(destinationInput, 'destination');

    root.addEventListener('mouseenter', () => {
        expand();
    });

    root.addEventListener('mouseleave', () => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        collapseIfBothEmpty();
    });

    fab.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    fab.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    bar.addEventListener('pointerdown', () => {
        expand();
    });

    const mapEl = document.getElementById('map');
    const shouldIgnoreTarget = (target) => {
        if (!target || !(target instanceof Element)) return false;
        if (root.contains(target)) return true;
        if (target.closest('.search-ui')) return true;
        if (target.closest('.RW-wrapper')) return true;
        if (target.closest('.maplibregl-popup')) return true;
        if (target.closest('.maplibregl-ctrl')) return true;
        return false;
    };

    const onMapPress = (evt) => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        const target = evt?.target;
        if (shouldIgnoreTarget(target)) return;
        if (!mapEl || !target || !(target instanceof Node) || !mapEl.contains(target)) return;
        results.classList.add('is-hidden');
        collapseIfBothEmpty();
    };

    const armMapPick = (target) => {
        activeField = target === 'destination' ? 'destination' : 'origin';
        expand();
        setMapPickTarget(activeField);
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
        ensureMapPickHook();
    };

    const swapOriginDestination = () => {
        const prevOriginText = normalizeText(originInput.value);
        const prevOriginId = normalizeText(selectedOriginId || originInput.dataset.stationId || '');
        const prevDestinationText = normalizeText(destinationInput.value);
        const prevDestinationId = normalizeText(selectedDestinationId || destinationInput.dataset.stationId || '');

        originInput.value = prevDestinationText;
        destinationInput.value = prevOriginText;

        originInput.dataset.stationId = prevDestinationId;
        destinationInput.dataset.stationId = prevOriginId;

        selectedOriginId = prevDestinationId;
        selectedDestinationId = prevOriginId;

        activeField = 'origin';
        setMapPickTarget(null);
        lastPlanComputeKey = '';

        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) {
            expand();
        }

        maybeComputePlans();
    };

    originMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    destinationMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    originMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('origin');
    });

    destinationMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('destination');
    });

    closeBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });
    closeBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        clearJourneyInputsAndCollapse();
    });

    divider.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    divider.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        swapOriginDestination();
    });

    originInput.addEventListener('keydown', (evt) => {
        if (evt?.key === 'Enter') {
            evt.preventDefault?.();
            maybeComputePlans();
        }
    });
    destinationInput.addEventListener('keydown', (evt) => {
        if (evt?.key === 'Enter') {
            evt.preventDefault?.();
            maybeComputePlans();
        }
    });

    const timeInput = document.querySelector('.settings-time-input');
    if (timeInput) {
        timeInput.addEventListener('input', () => {
            lastPlanComputeKey = '';
            maybeComputePlans();
        });
    }

    const dayButtons = document.querySelectorAll('.panel-day-seg button[data-day]');
    dayButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            lastPlanComputeKey = '';
            maybeComputePlans();
        });
    });

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
        document.addEventListener('pointerdown', onMapPress, true);
    } else {
        document.addEventListener('mousedown', onMapPress, true);
        document.addEventListener('touchstart', onMapPress, { capture: true, passive: true });
    }
    document.addEventListener('click', onDocumentClickCapture, true);

    tripPopover.addEventListener('mouseenter', () => {
        cancelHideTripPopover();
        cancelHidePlanPreview();
    });
    tripPopover.addEventListener('mouseleave', () => {
        if (!pinnedTripPopoverKey) {
            scheduleHideTripPopover();
        }
        if (!pinnedPlanPreviewKey) {
            scheduleClearJourneyPlanPreview(120);
        }
    });
    tripCaptureBtn.addEventListener('click', async (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        if (tripCaptureBtn.disabled) return;
        const titleText = normalizeText(tripPopoverTitle.textContent || 'journey-detail');
        const baseName = `journey-detail-${titleText || 'trip'}`;
        await exportJourneyPopoverToPng(tripPopover, baseName, tripCaptureBtn);
    });

    const ui = {
        root,
        fab,
        originInput,
        destinationInput,
        setOriginStation: (stationId, stationName, options) => applyExternalStationSelection('origin', stationId, stationName, options),
        setDestinationStation: (stationId, stationName, options) => applyExternalStationSelection('destination', stationId, stationName, options),
        recompute: () => {
            lastPlanComputeKey = '';
            return maybeComputePlans();
        },
        getSelection() {
            return {
                originStationId: selectedOriginId,
                destinationStationId: selectedDestinationId,
                originText: normalizeText(originInput.value),
                destinationText: normalizeText(destinationInput.value)
            };
        }
    };

    window.TokyoRailJourneyUI = ui;
    return ui;
}

mountTravelSearchUI();
