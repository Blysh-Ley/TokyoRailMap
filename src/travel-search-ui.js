import { searchRailEntities, getLineMetaByIds } from './search.js';
import {
    collectJourneyCandidatesRaptor,
    pickPlanBuckets,
    ensurePlannerStaticData,
    getGroupStops,
    filterNearbyStops,
    getNearbyStationsForJourneyPick,
    sameSet,
    getStationNameById,
    isThroughLegPairByMeta,
    expandLegsForDisplay,
    buildPlanDetailBlocks,
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

const formatJourneyMapCoordinates = (lngLat) => {
    const lng = Number(lngLat?.lng ?? lngLat?.[0]);
    const lat = Number(lngLat?.lat ?? lngLat?.[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return '';
    return `（${lat.toFixed(1)},${lng.toFixed(1)}）`;
};

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

const journeyDirectionByTripIdsCache = new Map();

const resolveJourneyTripTerminalStationId = (tripLike) => {
    const ds = Array.isArray(tripLike?.ds) ? tripLike.ds : (tripLike?.ds ? [tripLike.ds] : []);
    for (const item of ds) {
        const id = normalizeText(item);
        if (id) return id;
    }

    const stops = Array.isArray(tripLike?.stops) ? tripLike.stops : [];
    for (let i = stops.length - 1; i >= 0; i -= 1) {
        const id = normalizeText(stops[i]?.id || stops[i]?.s || stops[i]?.stopId || '');
        if (id) return id;
    }

    return '';
};

const resolveJourneyDirectionDestination = async ({ tripIds, serviceDay, fallbackStationName = '' }) => {
    const ids = collectUniqueTripIds(tripIds);
    const fallback = normalizeText(fallbackStationName);
    if (!ids.length) return fallback;

    const cacheKey = `${normalizeText(serviceDay) || 'Weekday'}|${ids.join(',')}`;
    if (journeyDirectionByTripIdsCache.has(cacheKey)) {
        return journeyDirectionByTripIdsCache.get(cacheKey) || fallback;
    }

    for (const tripId of ids) {
        const trip = await loadJourneyTripByTripId({ tripId, serviceDay });
        if (!trip) continue;

        const terminalStationId = resolveJourneyTripTerminalStationId(trip);
        const name = normalizeText(getStationNameById(terminalStationId) || terminalStationId || '');
        if (name) {
            journeyDirectionByTripIdsCache.set(cacheKey, name);
            return name;
        }
    }

    journeyDirectionByTripIdsCache.set(cacheKey, fallback);
    return fallback;
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

const normalizeTravelHistoryItem = (item) => {
    if (typeof item === 'string') return { text: normalizeText(item).slice(0, 120) };
    if (!item || typeof item !== 'object') return null;
    return {
        id: item.id ? String(item.id) : undefined,
        text: normalizeText(item.text).slice(0, 120),
        type: item.type || 'station',
        isTransfer: !!item.isTransfer,
        lineIds: Array.isArray(item.lineIds) ? item.lineIds.map(String) : undefined
    };
};

const loadTravelHistory = () => {
    try {
        const raw = window.localStorage?.getItem?.(TRAVEL_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeTravelHistoryItem).filter(Boolean).slice(0, TRAVEL_MAX_HISTORY);
    } catch {
        return [];
    }
};

const saveTravelHistory = (items) => {
    try {
        const list = Array.isArray(items) ? items.map(normalizeTravelHistoryItem).filter(Boolean) : [];
        window.localStorage?.setItem?.(TRAVEL_HISTORY_KEY, JSON.stringify(list.slice(0, TRAVEL_MAX_HISTORY)));
    } catch {
        // ignore
    }
};

const addTravelHistory = (item) => {
    const value = normalizeTravelHistoryItem(item);
    if (!value || !value.text) return;
    const list = loadTravelHistory();
    const next = [value, ...list.filter((x) => (x.id && value.id ? x.id !== value.id : x.text !== value.text))].slice(0, TRAVEL_MAX_HISTORY);
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

const resolveJourneyBadgeTextColor = (bgColor) => {
    const parsed = travelParseCssColorToRgb(bgColor);
    if (!parsed) return '#fff';
    return travelRelativeLuminance(parsed) > 0.55 ? '#111' : '#fff';
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
    const planPagination = el('div', 'journey-plan-pagination is-hidden');
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
    let stationResultRequestToken = 0;
    let selectedOriginId = '';
    let selectedDestinationId = '';
    let selectedOriginCandidateIds = [];
    let selectedDestinationCandidateIds = [];
    let selectedOriginCandidateMeta = [];
    let selectedDestinationCandidateMeta = [];
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
    let currentPlanPage = 0;
    let allPlanRows = [];

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
        if (key === 'origin') {
            selectedOriginId = resolvedId || '';
            selectedOriginCandidateIds = [];
        } else {
            selectedDestinationId = resolvedId || '';
            selectedDestinationCandidateIds = [];
        }

        try {
            await window?.TokyoRailSearchMapActions?.clearJourneyPickPin?.(key);
            await window?.TokyoRailSearchMapActions?.showJourneyPickPin?.({ stationId: resolvedId, type: key });
        } catch {
            // ignore
        }

        setMapPickTarget(null);
        results.classList.add('is-hidden');
        maybeComputePlans();
    };

    const applyPickedCoordinate = async ({ target, lngLat }) => {
        suppressStationSelectionOnce(900);
        const key = target === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;
        const coordsText = formatJourneyMapCoordinates(lngLat);
        if (!coordsText) return;

        let nearbyStations = [];
        try {
            nearbyStations = await getNearbyStationsForJourneyPick({ lngLat, maxMeters: 2000 });
        } catch {
            nearbyStations = [];
        }

        const candidateMeta = (Array.isArray(nearbyStations) ? nearbyStations : []).slice(0, 3);
        const candidateIds = Array.from(new Set(candidateMeta.map((item) => normalizeText(item?.stationId || '')).filter(Boolean)));

        // 始终显示经纬度文本（格式化为一位小数），但保存候选站点 meta 供稍后计算步行时间
        input.value = coordsText;
        input.dataset.stationId = '';
        if (key === 'origin') {
            selectedOriginId = '';
            selectedOriginCandidateIds = candidateIds;
            selectedOriginCandidateMeta = candidateMeta;
        } else {
            selectedDestinationId = '';
            selectedDestinationCandidateIds = candidateIds;
            selectedDestinationCandidateMeta = candidateMeta;
        }

        try {
            await window?.TokyoRailSearchMapActions?.clearJourneyPickPin?.(key);
            await window?.TokyoRailSearchMapActions?.showJourneyPickPin?.({ lngLat, type: key });
        } catch {
            // ignore
        }

        if (!candidateIds.length) {
            setMapPickTarget(null);
            results.classList.add('is-hidden');
            showPlanMessage('2公里内没有站点');
            return;
        }

        setMapPickTarget(null);
        results.classList.add('is-hidden');
        lastPlanComputeKey = '';
        await maybeComputePlans();
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
        if (key === 'origin') {
            selectedOriginId = resolvedId || '';
            selectedOriginCandidateIds = [];
        } else {
            selectedDestinationId = resolvedId || '';
            selectedDestinationCandidateIds = [];
        }

        try {
            window?.TokyoRailSearchMapActions?.clearJourneyPickPin?.(key);
            window?.TokyoRailSearchMapActions?.showJourneyPickPin?.({ stationId: resolvedId, type: key });
        } catch {
            // ignore
        }

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

        const lngLat = eventLike?.lngLat;
        if (!lngLat) return;

        await applyPickedCoordinate({
            target: mapPickTarget,
            lngLat
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
        while (planPagination.firstChild) planPagination.removeChild(planPagination.firstChild);
        currentPlanPage = 0;
        allPlanRows = [];
        hideTripPopover();
    };

    const generatePaginationButtonLabel = (label, index) => {
        const normalizedLabel = normalizeText(label);
        const labelMap = {};
        
        // 统计每个label类型的个数
        for (const row of allPlanRows) {
            const rowLabel = normalizeText(row?.label || '推荐');
            labelMap[rowLabel] = (labelMap[rowLabel] || 0) + 1;
        }
        
        // 如果某个标签只有一个，不添加数字
        if (labelMap[normalizedLabel] === 1) {
            return normalizedLabel;
        }
        
        // 计算当前index之前有多少个相同label的项
        let count = 0;
        for (let i = 0; i < index; i += 1) {
            const rowLabel = normalizeText(allPlanRows[i]?.label || '推荐');
            if (rowLabel === normalizedLabel) {
                count += 1;
            }
        }
        
        return `${normalizedLabel}${count + 1}`;
    };

    const showCurrentPage = async () => {
        while (planList.firstChild) planList.removeChild(planList.firstChild);
        
        if (currentPlanPage < 0 || currentPlanPage >= allPlanRows.length) {
            currentPlanPage = 0;
        }
        
        const row = allPlanRows[currentPlanPage];
        if (!row) return;
        
        const displayPlan = await getDisplayPlanForRow(row);
        const li = document.createElement('li');
        li.className = 'journey-plan-item';

        const path = el('div', 'journey-plan-path');
        await appendJourneyPath(path, row, displayPlan);

        path.addEventListener('mouseenter', () => {
            cancelHidePlanPreview();
            const previewKey = `row-${currentPlanPage}`;
            if (!pinnedTripPopoverKey || pinnedTripPopoverKey === previewKey) {
                showTripPopover({ anchorEl: path, row });
            }
            if (pinnedPlanPreviewKey && pinnedPlanPreviewKey !== previewKey) return;
            applyJourneyPlanPreview({ row, previewKey, pin: false, interaction: 'hover' });
        });
        path.addEventListener('mouseleave', () => {
            const previewKey = `row-${currentPlanPage}`;
            if (pinnedTripPopoverKey !== previewKey) {
                scheduleHideTripPopover();
            }
            if (!pinnedPlanPreviewKey) {
                scheduleClearJourneyPlanPreview(120);
            }
        });

        path.addEventListener('click', async (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            cancelHidePlanPreview();
            const previewKey = `row-${currentPlanPage}`;

            if (pinnedTripPopoverKey === previewKey) {
                pinnedTripPopoverKey = '';
                scheduleHideTripPopover();
            } else {
                pinnedTripPopoverKey = previewKey;
                showTripPopover({ anchorEl: path, row });
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

        li.appendChild(path);

        const brief = el('div', 'journey-plan-brief');
        
        const head = el('div', 'journey-plan-head');
        head.appendChild(el('span', 'journey-plan-duration', { text: formatDuration(displayPlan?.durationMs) }));
        const transferText = Number(displayPlan?.transfers) > 0
            ? `${Number(displayPlan.transfers)}次换乘`
            : '直达';
        head.appendChild(el('span', 'journey-plan-transfer', { text: transferText }));

        // 计算总共需要乘坐多少站（基于详细停站 blocks）
        try {
            const detailBlocks = await buildPlanDetailBlocks({
                plan: row.plan,
                legsOverride: displayPlan?.legs,
                sectionsOverride: displayPlan?.sections,
                serviceDay: row.serviceDay,
                originStationId: row.originStationId
            });
            let seq = [];
            for (const b of Array.isArray(detailBlocks) ? detailBlocks : []) {
                if (b?.kind !== 'ride') continue;
                const rows = Array.isArray(b.rows) ? b.rows : [];
                for (const r of rows) {
                    const sid = normalizeText(r?.stationId || '');
                    if (!sid) continue;
                    if (seq.length && seq[seq.length - 1] === sid) continue;
                    seq.push(sid);
                }
            }
            const stationCount =  seq.length - 1 - (displayPlan?.transfers || 0);
            head.appendChild(el('span', 'journey-plan-stations-count', { text: `${stationCount}站` }));
            
        } catch (e) {
            // ignore
        }

        head.appendChild(el('span', 'journey-plan-arrive', { text: `${toHHMM(displayPlan?.arrivalMs)}到达` }));


        const tagLabels = Array.isArray(row?.tagLabels)
            ? row.tagLabels.map((x) => normalizeText(x)).filter(Boolean)
            : [normalizeText(row?.label)].filter(Boolean);
        if (tagLabels.length) {
            const tagsWrap = el('div', 'journey-plan-tags');
            for (const tagText of tagLabels) {
                let addText = tagText + "  ";
                tagsWrap.appendChild(el('div', 'journey-plan-tag', { text: addText }));
            }
            brief.appendChild(tagsWrap);
        }
        brief.appendChild(head);
        brief.appendChild(planPagination);

        li.appendChild(brief);

        planList.appendChild(li);
    };

    const updatePaginationButtons = () => {
        while (planPagination.firstChild) planPagination.removeChild(planPagination.firstChild);
        
        if (allPlanRows.length <= 1) return;
        
        for (let i = 0; i < allPlanRows.length; i += 1) {
            const btn = document.createElement('button');
            btn.className = 'journey-plan-page-btn';
            btn.type = 'button';
            btn.textContent = generatePaginationButtonLabel(allPlanRows[i]?.label || '推荐', i);
            
            if (i === currentPlanPage) {
                btn.classList.add('is-active');
            }
            
            btn.addEventListener('click', async () => {
                currentPlanPage = i;
                await showCurrentPage();
                updatePaginationButtons();
            });
            
            planPagination.appendChild(btn);
        }
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
        const legsForDisplay = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
        const stationCodeMap = await getJourneyStationCodeMap();
        let shouldAppendDirectionForNextNote = true;
        let currentSectionIndex = 0;
        let currentLegIndex = 0;
        let hasRenderedSectionLineNote = false;
        let previousRideLineKey = '';

        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
            const block = blocks[blockIndex] || {};
            if (block.kind === 'transfer') {
                const transferRow = el('div', 'journey-trip-transfer-row');
                transferRow.appendChild(el('span', 'journey-trip-transfer-label', { text: '换乘' }));
                tripPopoverBody.appendChild(transferRow);
                shouldAppendDirectionForNextNote = true;
                currentSectionIndex += 1;
                hasRenderedSectionLineNote = false;
                previousRideLineKey = '';
                continue;
            }

            const sectionThroughMeta = sectionThroughMetaList[currentSectionIndex] || null;
            const isSpecialThroughCategory = sectionThroughMeta?.category === 'ShonanShinjuku' || sectionThroughMeta?.category === 'UenoTokyo';
            const blockLineKey = normalizeText(block.lineDisplayName || block.lineName || '');
            const shouldRenderBoundaryLineNote = !!(
                !isSpecialThroughCategory
                && hasRenderedSectionLineNote
                && previousRideLineKey
                && blockLineKey
                && previousRideLineKey !== blockLineKey
            );
            const lineText = normalizeText(
                shouldRenderBoundaryLineNote
                    ? (block.lineDisplayName || block.lineName)
                    : (sectionThroughMeta?.name || block.lineDisplayName || block.lineName)
            );
            const lineColorResolved = normalizeText(
                shouldRenderBoundaryLineNote
                    ? (block.lineColor || '')
                    : (sectionThroughMeta?.color || block.lineColor || '')
            );
            const shouldRenderLineNote = !hasRenderedSectionLineNote || shouldRenderBoundaryLineNote;

            const blockRows = Array.isArray(block?.rows) ? block.rows : [];
            const blockLast = blockRows.length ? blockRows[blockRows.length - 1] : null;
            let directionDestination = '';
            if (shouldAppendDirectionForNextNote && !shouldRenderBoundaryLineNote) {
                const fallbackDirection = normalizeText(getStationNameById(overallDestinationStationId) || blockLast?.stationName || blockLast?.stationId || '');
                if (sectionsForDisplay.length) {
                    const section = sectionsForDisplay[currentSectionIndex] || null;
                    directionDestination = await resolveJourneyDirectionDestination({
                        tripIds: collectSectionCandidateTripIds(section),
                        serviceDay: row?.serviceDay,
                        fallbackStationName: fallbackDirection
                    });
                } else {
                    const leg = legsForDisplay[currentLegIndex] || legsForDisplay[legsForDisplay.length - 1] || null;
                    directionDestination = await resolveJourneyDirectionDestination({
                        tripIds: collectLegCandidateTripIds(leg),
                        serviceDay: row?.serviceDay,
                        fallbackStationName: fallbackDirection
                    });
                }
            }
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
                    directionText: shouldRenderBoundaryLineNote
                        ? ''
                        : (directionDestination ? ` 往 ${directionDestination}` : '')
                });
                if (travelIsDarkThemeActive() && isLocalTypeName(block.typeName)) {
                    const noteTypeEl = note.querySelector('.journey-trip-note-type');
                    if (noteTypeEl instanceof HTMLElement) noteTypeEl.style.color = '#fff';
                }
                if (shouldAppendDirectionForNextNote && !shouldRenderBoundaryLineNote) shouldAppendDirectionForNextNote = false;
                hasRenderedSectionLineNote = true;
                if (!sectionsForDisplay.length && !shouldRenderBoundaryLineNote) currentLegIndex += 1;
                tripPopoverBody.appendChild(note);
            }

            if (blockLineKey) previousRideLineKey = blockLineKey;

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
        planPagination.classList.add('is-hidden');
    };

    const hidePlanResultsIfEmptyInputs = ({ clearMapPreview = false } = {}) => {
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        clearPlanList({ clearMapPreview });
        planResults.classList.add('is-hidden');
        planPagination.classList.add('is-hidden');
    };

    const appendJourneyPath = async (container, row, displayPlan) => {
        const effectiveServiceDay = normalizeText(row?.serviceDay || displayPlan?.serviceDay || 'Weekday') || 'Weekday';
        const sectionsForDisplay = Array.isArray(displayPlan?.sections) ? displayPlan.sections : [];
        const legsForDisplay = Array.isArray(displayPlan?.legs) ? displayPlan.legs : [];
        const sectionThroughMetaList = sectionsForDisplay.length
            ? await Promise.all(sectionsForDisplay.map((section) => detectJourneyThroughCategoryMeta({
                tripIds: collectSectionCandidateTripIds(section),
                serviceDay: effectiveServiceDay
            })))
            : [];
        const hasSpecialThroughSection = sectionThroughMetaList.some((meta) => {
            const category = normalizeText(meta?.category || '');
            return category === 'UenoTokyo' || category === 'ShonanShinjuku';
        });
        const blocks = await buildPlanDetailBlocks({
            plan: row?.plan,
            legsOverride: displayPlan?.legs,
            sectionsOverride: displayPlan?.sections,
            serviceDay: effectiveServiceDay,
            originStationId: row?.originStationId
        });

        const rideBlocks = Array.isArray(blocks) ? blocks.filter((b) => b?.kind === 'ride') : [];
        if (!rideBlocks.length) {
            container.appendChild(el('div', 'journey-plan-empty', { text: '无路径详情' }));
            return;
        }

        const layout = el('div', 'journey-plan-path-layout');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('journey-plan-railway-mark');
        const rowsWrap = el('div', 'journey-plan-path-rows');
        layout.appendChild(svg);
        layout.appendChild(rowsWrap);
        container.appendChild(layout);

        const stationMarkerRows = [];
        const markerSegments = [];
        let pendingSegment = null;

        const resolveStationName = (rowData) => {
            const stationId = normalizeText(rowData?.stationId || '');
            return normalizeText(rowData?.stationName || getStationNameById(stationId) || stationId || '未知站');
        };

        const resolveRowTime = (rowData, prefer) => {
            const dep = normalizeText(rowData?.depText || '');
            const arr = normalizeText(rowData?.arrText || '');
            if (prefer === 'dep') return dep || arr || '--:--';
            return arr || dep || '--:--';
        };

        const calcTransferWaitMinutes = (prevTimeText, nextTimeText) => {
            const arr = hhmmToOffsetMinutes(prevTimeText);
            const dep = hhmmToOffsetMinutes(nextTimeText);
            if (!Number.isFinite(arr) || !Number.isFinite(dep)) return null;
            let diff = dep - arr;
            if (diff < 0) diff += 24 * 60;
            return Math.max(0, diff);
        };

        const appendStationRow = ({ stationName, timeText }) => {
            const rowEl = el('div', 'station-row');
            rowEl.appendChild(el('div', 'station-title-box', { text: stationName }));
            rowEl.appendChild(el('div', 'station-time-box', { text: timeText }));
            rowsWrap.appendChild(rowEl);

            const markerIndex = stationMarkerRows.length;
            stationMarkerRows.push(rowEl);

            if (markerIndex > 0) {
                const seg = pendingSegment || { kind: 'ride', color: '#9a9a9a' };
                markerSegments.push({
                    from: markerIndex - 1,
                    to: markerIndex,
                    kind: seg.kind,
                    color: seg.color
                });
            }
            pendingSegment = null;
        };

        const appendTrainRow = ({ lineText, lineColor, typeText, typeColor, directionText, stationCount = null }) => {
            const rowEl = el('div', 'station-row');
            const title = el('div', 'train-title-box');
            const lineLabel = el('span', 'train-line-label', { text: lineText || '线路' });
            if (lineColor) lineLabel.style.color = String(lineColor);
            title.appendChild(lineLabel);
            if (typeText) {
                title.appendChild(document.createTextNode(' '));
                const typeLabel = el('span', 'train-type-label', { text: typeText });
                if (typeColor) {
                    const bg = String(resolveJourneyColorForTheme(typeColor));
                    typeLabel.style.background = bg;
                    typeLabel.style.color = resolveJourneyBadgeTextColor(bg);
                }
                title.appendChild(typeLabel);
            }
            if (directionText) title.appendChild(document.createTextNode(` 往${directionText}`));
            // 如果传入了 stationCount 属性，则在行内显示乘坐站数
            if (Number.isFinite(Number(stationCount)) && Number(stationCount) > 0) {
                title.appendChild(document.createTextNode(` 乘坐${Number(stationCount)}站`));
            }
            rowEl.appendChild(title);
            rowsWrap.appendChild(rowEl);
        };

        const createWalkRow = ({ minutes, toText, isDestination = false }) => {
            if (!Number.isFinite(Number(minutes)) || Number(minutes) <= 0) return null;
            const rowEl = el('div', 'station-row is-walk');
            const title = el('div', 'train-title-box');
            const img = el('img', 'journey-walk-icon', { alt: '' });
            img.style.width = '14px';
            img.style.height = '14px';
            img.style.display = 'inline-block';
            img.style.verticalAlign = 'middle';
            try { setJourneyIconFromCache(img, 'walk.svg'); } catch {}
            title.appendChild(img);
            const txt = isDestination
                ? ` 步行${Math.max(0, Math.round(Number(minutes)))}分钟至终点`
                : ` 步行${Math.max(0, Math.round(Number(minutes)))}分钟至${toText || '起始站'}站`;
            title.appendChild(document.createTextNode(txt));
            rowEl.appendChild(title);
            return rowEl;
        };

        const appendSpecialLineRow = (text) => {
            const specialText = normalizeText(text);
            if (!specialText) return;
            const rowEl = el('div', 'station-row is-special');
            rowEl.appendChild(el('div', 'journey-plan-special-line', { text: specialText }));
            rowsWrap.appendChild(rowEl);
        };

        const appendTransferRow = (waitMinutes) => {
            const rowEl = el('div', 'station-row is-transfer');
            const text = Number.isFinite(waitMinutes)
                ? `转车并等待 ${Math.max(0, Math.round(waitMinutes))}分`
                : '转车并等待';
            rowEl.appendChild(el('div', 'train-title-box', { text }));
            rowsWrap.appendChild(rowEl);
        };

        const nextRideBlockAfter = (startIndex) => {
            for (let i = startIndex; i < blocks.length; i += 1) {
                const candidate = blocks[i];
                if (candidate?.kind === 'ride') return candidate;
            }
            return null;
        };

        const collectRideBlocksUntilTransfer = (startIndex) => {
            const out = [];
            for (let i = Math.max(0, Number(startIndex) || 0); i < blocks.length; i += 1) {
                const candidate = blocks[i] || {};
                if (candidate.kind === 'transfer') break;
                if (candidate.kind === 'ride') out.push(candidate);
            }
            return out;
        };

        const countStationsFromRideBlocks = (rideBlocks) => {
            const ids = [];
            for (const rb of Array.isArray(rideBlocks) ? rideBlocks : []) {
                const rows = Array.isArray(rb?.rows) ? rb.rows : [];
                for (const r of rows) {
                    const sid = normalizeText(r?.stationId || '');
                    if (!sid) continue;
                    if (ids.length && ids[ids.length - 1] === sid) continue;
                    ids.push(sid);
                }
            }
            return Math.max(0, ids.length - 1);
        };

        const renderRailwayMark = () => {
            if (!(rowsWrap instanceof HTMLElement)) return;
            const markerCount = stationMarkerRows.length;
            if (!markerCount) {
                while (svg.firstChild) svg.removeChild(svg.firstChild);
                return;
            }

            const wrapRect = rowsWrap.getBoundingClientRect();
            const points = stationMarkerRows.map((rowEl) => {
                const rect = rowEl.getBoundingClientRect();
                return (rect.top - wrapRect.top) + rect.height / 2;
            });
            const height = Math.max(1, Math.ceil(rowsWrap.scrollHeight || (points[points.length - 1] + 8)));
            const ns = 'http://www.w3.org/2000/svg';
            const x = 12;

            svg.setAttribute('viewBox', `0 0 24 ${height}`);
            svg.setAttribute('width', '24');
            svg.setAttribute('height', String(height));

            while (svg.firstChild) svg.removeChild(svg.firstChild);

            // 越靠近起点的图层越显示在前面 (通过反转绘图顺序，使索引小的线段后绘图从而盖在上方)
            const drawnSegments = markerSegments.slice().reverse();
            for (const seg of drawnSegments) {
                const fromY = points[seg.from];
                const toY = points[seg.to];
                if (!Number.isFinite(fromY) || !Number.isFinite(toY)) continue;
                const lineEl = document.createElementNS(ns, 'line');
                lineEl.setAttribute('x1', String(x));
                lineEl.setAttribute('x2', String(x));
                lineEl.setAttribute('y1', String(fromY));
                lineEl.setAttribute('y2', String(toY));
                if (seg.kind === 'transfer') {
                    lineEl.setAttribute('stroke', '#7f7f7f');
                    lineEl.setAttribute('stroke-width', '4');
                    lineEl.setAttribute('stroke-dasharray', '4 4');
                } else {
                    lineEl.setAttribute('stroke', String(seg.color || '#9a9a9a'));
                    lineEl.setAttribute('stroke-width', '10');
                    lineEl.setAttribute('stroke-linecap', 'round');
                }
                svg.appendChild(lineEl);
            }

            for (const y of points) {
                if (!Number.isFinite(y)) continue;
                const dot = document.createElementNS(ns, 'circle');
                dot.setAttribute('cx', String(x));
                dot.setAttribute('cy', String(y));
                dot.setAttribute('r', '3');
                dot.setAttribute('fill', '#ffffff');
                svg.appendChild(dot);
            }
        };

        if (svg instanceof SVGElement) {
            while (svg.firstChild) svg.removeChild(svg.firstChild);
        }

        const calcTransferWaitMinutesByBlocks = (currBlock, nextBlock) => {
            const currRows = Array.isArray(currBlock?.rows) ? currBlock.rows : [];
            const nextRows = Array.isArray(nextBlock?.rows) ? nextBlock.rows : [];
            const currLast = currRows[currRows.length - 1] || null;
            const nextFirst = nextRows[0] || null;
            const arr = hhmmToOffsetMinutes(resolveRowTime(currLast, 'arr'));
            const dep = hhmmToOffsetMinutes(resolveRowTime(nextFirst, 'dep'));
            if (!Number.isFinite(arr) || !Number.isFinite(dep)) return null;
            let diff = dep - arr;
            if (diff < 0) diff += 24 * 60;
            return Math.max(0, diff);
        };

        let currentSectionIndex = 0;
        let currentLegIndex = 0;
        let hasRenderedSectionLineNote = false;
        let previousRideLineKey = '';
        let shouldAppendStartStation = true;
        let lastRideBlock = null;

        // 如果有估算步行时间，先在最前端插入“步行至起点站”行
        try {
            const w = Number(row?.__walkOriginMinutes) || 0;
            if (w > 0) {
                const originName = normalizeText(getStationNameById(row?.originStationId) || row?.originStationId || '起点');
                const walkRow = createWalkRow({ minutes: w, toText: originName, isDestination: false });
                if (walkRow) rowsWrap.appendChild(walkRow);
            }
        } catch (e) {
            // ignore
        }

        for (let i = 0; i < blocks.length; i += 1) {
            const block = blocks[i] || {};
            if (block.kind === 'transfer') {
                if (lastRideBlock) {
                    const last = lastRideBlock.rows[lastRideBlock.rows.length - 1];
                    appendStationRow({ stationName: resolveStationName(last), timeText: resolveRowTime(last, 'arr') });
                }
                const nextRide = nextRideBlockAfter(i + 1);
                appendTransferRow(calcTransferWaitMinutesByBlocks(lastRideBlock, nextRide));
                pendingSegment = { kind: 'transfer', color: '#7f7f7f' };

                if (sectionsForDisplay.length) currentSectionIndex += 1;
                hasRenderedSectionLineNote = false;
                previousRideLineKey = '';
                shouldAppendStartStation = true;
                lastRideBlock = null;
                continue;
            }

            if (block.kind !== 'ride') continue;

            const blockRows = Array.isArray(block?.rows) ? block.rows : [];
            if (!blockRows.length) continue;

            const sectionThroughMeta = sectionThroughMetaList[currentSectionIndex] || null;
            const isSpecialThroughCategory = sectionThroughMeta?.category === 'ShonanShinjuku' || sectionThroughMeta?.category === 'UenoTokyo';
            const blockLineKey = normalizeText(block.lineDisplayName || block.lineName || '');
            const shouldRenderBoundaryLineNote = !!(
                !isSpecialThroughCategory
                && hasRenderedSectionLineNote
                && previousRideLineKey
                && blockLineKey
                && previousRideLineKey !== blockLineKey
            );

            if (shouldRenderBoundaryLineNote) {
                if (lastRideBlock) {
                    const last = lastRideBlock.rows[lastRideBlock.rows.length - 1];
                    appendStationRow({ stationName: resolveStationName(last), timeText: resolveRowTime(last, 'arr') });
                }
                shouldAppendStartStation = true;
            }

            if (shouldAppendStartStation) {
                if (!shouldRenderBoundaryLineNote) {
                    const first = blockRows[0];
                    appendStationRow({ stationName: resolveStationName(first), timeText: resolveRowTime(first, 'dep') });
                }

                const lineText = normalizeText(
                    shouldRenderBoundaryLineNote
                        ? (block.lineDisplayName || block.lineName)
                        : (sectionThroughMeta?.name || block.lineDisplayName || block.lineName)
                ) || '线路';
                const rideColor = normalizeText(
                    shouldRenderBoundaryLineNote
                        ? (block.lineColor || '')
                        : (sectionThroughMeta?.color || block.lineColor || '')
                ) ? String(resolveJourneyColorForTheme(shouldRenderBoundaryLineNote ? block.lineColor : (sectionThroughMeta?.color || block.lineColor))) : '#9a9a9a';

                let directionText = '';
                if (!shouldRenderBoundaryLineNote) {
                    const last = blockRows[blockRows.length - 1];
                    directionText = resolveStationName(last);
                }

                // 乘坐站数规则：
                // 1) 常规：显示当前段 block 的乘坐站数
                // 2) 直通（同一 section/同一连续 ride 组存在多个子线路）：只在起始行显示整组总站数
                // 3) 子线路边界行（无“往xx”）：不显示乘坐站数
                let stationCountForDisplay = null;
                if (!shouldRenderBoundaryLineNote) {
                    const rideGroupBlocks = collectRideBlocksUntilTransfer(i);
                    const isThroughGroup = rideGroupBlocks.length > 1;
                    stationCountForDisplay = isThroughGroup
                        ? countStationsFromRideBlocks(rideGroupBlocks)
                        : countStationsFromRideBlocks([block]);
                }

                appendTrainRow({
                    lineText,
                    lineColor: rideColor,
                    typeText: normalizeText(block?.typeName || ''),
                    typeColor: normalizeText(block?.typeColor || ''),
                    directionText,
                    stationCount: stationCountForDisplay
                });

                const specialTripIds = sectionsForDisplay.length
                    ? collectSectionCandidateTripIds(sectionsForDisplay[currentSectionIndex] || null)
                    : collectLegCandidateTripIds(legsForDisplay[currentLegIndex] || legsForDisplay[legsForDisplay.length - 1] || null);
                const specialText = await detectJourneySpecialNameText({
                    tripIds: specialTripIds,
                    serviceDay: effectiveServiceDay
                });
                appendSpecialLineRow(specialText);

                pendingSegment = { kind: 'ride', color: rideColor };
                shouldAppendStartStation = false;
            }

            if (blockLineKey) previousRideLineKey = blockLineKey;
            hasRenderedSectionLineNote = true;
            lastRideBlock = block;
            if (!sectionsForDisplay.length && !shouldRenderBoundaryLineNote) currentLegIndex += 1;
        }

        if (lastRideBlock) {
            const last = lastRideBlock.rows[lastRideBlock.rows.length - 1];
            appendStationRow({ stationName: resolveStationName(last), timeText: resolveRowTime(last, 'arr') });
        }

        // 如果有估算步行时间，插入“步行至终点”行到最后
        try {
            const w2 = Number(row?.__walkDestinationMinutes) || 0;
            if (w2 > 0) {
                const destName = normalizeText(row?.destinationName || '终点');
                const walkEndRow = createWalkRow({ minutes: w2, toText: destName, isDestination: true });
                if (walkEndRow) rowsWrap.appendChild(walkEndRow);
            }
        } catch (e) {
            // ignore
        }

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(renderRailwayMark);
        });
    };

    const renderPlanResults = async (rows) => {
        clearPlanList();
        if (!rows.length) {
            showPlanMessage('无可用路线');
            return;
        }

        allPlanRows = rows;
        currentPlanPage = 0;
        
        await showCurrentPage();
        updatePaginationButtons();
        planResults.classList.remove('is-hidden');
        if (allPlanRows.length > 1) {
            planPagination.classList.remove('is-hidden');
        } else {
            planPagination.classList.add('is-hidden');
        }
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

        const originSeeds = Array.from(new Set(
            Array.isArray(selectedOriginCandidateIds) && selectedOriginCandidateIds.length
                ? selectedOriginCandidateIds.map((x) => normalizeText(x)).filter(Boolean)
                : (originId ? [originId] : [])
        )).slice(0, 3);
        const destinationSeeds = Array.from(new Set(
            Array.isArray(selectedDestinationCandidateIds) && selectedDestinationCandidateIds.length
                ? selectedDestinationCandidateIds.map((x) => normalizeText(x)).filter(Boolean)
                : (destinationId ? [destinationId] : [])
        )).slice(0, 3);

        if (!originSeeds.length || !destinationSeeds.length) {
            if (!normalizeText(originInput.value) && !normalizeText(destinationInput.value)) {
                hidePlanResultsIfEmptyInputs();
                return;
            }

            if (normalizeText(originInput.value) && normalizeText(destinationInput.value)) {
                showPlanMessage('2公里内未找到可用站点');
            }
            return;
        }

        showPlanMessage('正在计算路线...');

        const serviceDay = readServiceDayFromPanel();
        const { departureMs } = readDepartureBase();
        const key = `${originSeeds.join('|')}||${destinationSeeds.join('|')}||${serviceDay}||${Math.floor(departureMs / 60000)}`;

        const token = ++planComputeToken;
        lastPlanComputeKey = key;

        await ensurePlannerStaticData();

        const pairBestPlans = [];
        const pairBestWrappers = []; // { plan, originStationId, destinationStationId, originWalkMin, destWalkMin }

        // 判断是否有任一端是通过地图坐标选取（即没有明确 stationId，但存在候选站点）
        const isOriginCoordinatePick = !originId && Array.isArray(selectedOriginCandidateIds) && selectedOriginCandidateIds.length > 0;
        const isDestinationCoordinatePick = !destinationId && Array.isArray(selectedDestinationCandidateIds) && selectedDestinationCandidateIds.length > 0;
        const coordinateMode = isOriginCoordinatePick || isDestinationCoordinatePick;

        for (const originStationId of originSeeds) {
            if (token !== planComputeToken) return;

            let sourceStops = getGroupStops(originStationId);
            sourceStops.add(originStationId);
            sourceStops = filterNearbyStops(originStationId, sourceStops, 800);
            if (!sourceStops.size) continue;

            for (const destinationStationId of destinationSeeds) {
                if (token !== planComputeToken) return;
                if (originStationId === destinationStationId) continue;

                const destinationStops = getGroupStops(destinationStationId);
                destinationStops.add(destinationStationId);
                if (!destinationStops.size || sameSet(sourceStops, destinationStops)) continue;

                const plans = await collectJourneyCandidates({
                    sourceStops,
                    destinationStops,
                    serviceDay,
                    baseDepartureMs: departureMs
                });

                if (token !== planComputeToken) return;
                if (!Array.isArray(plans) || !plans.length) continue;

                if (coordinateMode) {
                    // 坐标模式：对每对候选站只取最短的方案，并把估算的步行时间加入到 duration
                    const shortestPlan = plans.slice().sort((a, b) => a.durationMs - b.durationMs || a.transfers - b.transfers || a.arrivalMs - b.arrivalMs)[0] || null;
                    if (!shortestPlan) continue;
                    const oMeta = (Array.isArray(selectedOriginCandidateMeta) ? selectedOriginCandidateMeta : []).find((m) => normalizeText(m?.stationId) === normalizeText(originStationId));
                    const dMeta = (Array.isArray(selectedDestinationCandidateMeta) ? selectedDestinationCandidateMeta : []).find((m) => normalizeText(m?.stationId) === normalizeText(destinationStationId));
                    const originWalkMin = Number.isFinite(Number(oMeta?.walkMinutes)) ? Number(oMeta.walkMinutes) : 0;
                    const destWalkMin = Number.isFinite(Number(dMeta?.walkMinutes)) ? Number(dMeta.walkMinutes) : 0;

                    try {
                        if (Number.isFinite(shortestPlan.durationMs)) shortestPlan.durationMs = Number(shortestPlan.durationMs) + (originWalkMin + destWalkMin) * 60000;
                        if (Number.isFinite(shortestPlan.arrivalMs)) shortestPlan.arrivalMs = Number(shortestPlan.arrivalMs) + destWalkMin * 60000;
                    } catch (e) {}

                    shortestPlan.__walkOriginMinutes = originWalkMin;
                    shortestPlan.__walkDestinationMinutes = destWalkMin;

                    pairBestPlans.push(shortestPlan);
                    pairBestWrappers.push({ plan: shortestPlan, originStationId, destinationStationId, originWalkMin, destWalkMin });
                } else {
                    // 站点模式（两端均为明确站点）：保留该对的所有优选 bucket（多个备选）以供汇总选择
                    try {
                        const buckets = pickPlanBuckets(plans) || [];
                        for (const b of buckets) {
                            if (b && b.plan) pairBestPlans.push(b.plan);
                        }
                    } catch (e) {
                        // 兜底，直接推入所有计划
                        for (const p of plans) pairBestPlans.push(p);
                    }
                }
            }
        }

        if (token !== planComputeToken) return;
        if (!pairBestPlans.length) {
            showPlanMessage('无可用路线');
            return;
        }

        const bestPlansOrdered = pickPlanBuckets(pairBestPlans);
        const picked = bestPlansOrdered.slice(0, 3).map((x, idx) => {
            const plan = x?.plan || null;
            const tagLabels = [normalizeText(x?.label || `方案${idx + 1}`) || `方案${idx + 1}`];
            if (plan?.hasSurcharge) tagLabels.push('额外费用！');

            const wrapper = pairBestWrappers.find((w) => w.plan === plan) || {};
            const originStationResolved = wrapper.originStationId || originId || (originSeeds[0] || '');
            const destinationStationResolved = wrapper.destinationStationId || destinationId || (destinationSeeds[0] || '');

            return {
                ...x,
                tagLabels,
                serviceDay,
                baseDepartureMs: departureMs,
                originStationId: originStationResolved,
                destinationStationId: destinationStationResolved,
                originName: normalizeText(originInput.value) || originSeeds.map(getStationNameById).find(Boolean) || originInput.value,
                destinationName: normalizeText(destinationInput.value) || destinationSeeds.map(getStationNameById).find(Boolean) || destinationInput.value,
                __walkOriginMinutes: Number.isFinite(Number(wrapper.originWalkMin)) ? Number(wrapper.originWalkMin) : (Number.isFinite(Number(plan?.__walkOriginMinutes)) ? Number(plan.__walkOriginMinutes) : 0),
                __walkDestinationMinutes: Number.isFinite(Number(wrapper.destWalkMin)) ? Number(wrapper.destWalkMin) : (Number.isFinite(Number(plan?.__walkDestinationMinutes)) ? Number(plan.__walkDestinationMinutes) : 0)
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
        selectedOriginCandidateIds = [];
        selectedDestinationCandidateIds = [];
        lastPlanComputeKey = '';
        setMapPickTarget(null);
        hideTripPopover();
        clearPlanList({ clearMapPreview: false });
        planResults.classList.add('is-hidden');
        results.classList.add('is-hidden');
        try {
            window?.TokyoRailSearchMapActions?.clearJourneyPickPin?.();
        } catch {
            // ignore
        }
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

    const selectStation = (item) => {
        if (!item || (!item.id && !item.text)) return;

        const input = getActiveInput();

        if (!item.id) {
            input.value = String(item.text || '');
            refresh();
            try { input.focus?.(); } catch { /* ignore */ }
            return;
        }

        // 同时保留用户输入的文本记录和点击的实体记录
        addTravelHistory(input.value);
        addTravelHistory(item);

        input.value = String(item?.text ?? '');
        input.dataset.stationId = String(item?.id ?? '');

        try {
            window?.TokyoRailSearchMapActions?.showJourneyPickPin?.({ stationId: String(item?.id ?? ''), type: activeField });
        } catch {
            // ignore
        }

        if (activeField === 'origin') {
            selectedOriginId = String(item?.id ?? '');
            selectedOriginCandidateIds = [];
        } else {
            selectedDestinationId = String(item?.id ?? '');
            selectedDestinationCandidateIds = [];
        }

        results.classList.add('is-hidden');
        try {
            window?.TokyoRailSearchMapActions?.clearJourneyPickPin?.(activeField);
        } catch {
            // ignore
        }
        maybeComputePlans();
    };

    const createStationResultRow = (item, lineMetas) => {
        const row = el('div', 'search-result-item');
        const icon = item?.id ? buildStationIcon(item?.isTransfer === true) : el('span', 'search-result-icon');
        const text = el('div', 'search-result-text journey-station-result-text');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'journey-station-result-name';
        nameSpan.textContent = String(item?.text ?? '');
        text.appendChild(nameSpan);

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
        return row;
    };

    const renderHistoryResults = async () => {
        const history = loadTravelHistory().filter(item => item.type !== 'line' && item.type !== 'company');
        if (!history.length) {
            clearList();
            results.classList.add('is-hidden');
            return;
        }

        const itemsWithMetas = await Promise.all(history.map(async (item) => {
            const lineMetas = item.lineIds ? await getLineMetaByIds(item.lineIds) : [];
            return { item, lineMetas };
        }));

        clearList();

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

        const isDark = travelIsDarkThemeActive();

        for (const { item, lineMetas } of itemsWithMetas) {
            const li = document.createElement('li');
            const row = createStationResultRow(item, lineMetas);
            row.querySelector('.search-result-text').style.flex = '1 1 auto';

            const del = el('button', '', { type: 'button', 'aria-label': '删除记录' });
            const delIcon = el('img', '', { alt: '' });
            delIcon.style.width = '12px';
            delIcon.style.height = '12px';
            delIcon.style.display = 'block';
            if (isDark) delIcon.style.filter = 'invert(1)';
            setImageElementFromCache(delIcon, getIconCandidates('x.svg'), {
                cacheKey: 'icon:x.svg'
            }).catch(() => { del.textContent = 'x'; });

            del.style.marginLeft = 'auto';
            del.style.background = 'transparent';
            del.style.border = 'none';
            del.style.padding = '0 2px';
            del.style.cursor = 'pointer';
            del.style.color = 'inherit';
            del.style.fontSize = '15px';
            del.style.lineHeight = '1';
            del.style.opacity = '0.7';
            del.appendChild(delIcon);

            del.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                const next = loadTravelHistory().filter((x) => (x.id && item.id ? x.id !== item.id : x.text !== item.text));
                saveTravelHistory(next);
                renderHistoryResults();
            });

            row.appendChild(del);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                selectStation(item);
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

        window.requestAnimationFrame(() => {
            refreshJourneyStationLineAlignment(list);
        });

        results.classList.remove('is-hidden');
    };

    const renderStationResults = async (items) => {
        const token = ++stationResultRequestToken;
        const itemsWithMetas = await Promise.all(items.map(async (item) => {
            const lineMetas = await getLineMetaByIds(item?.lineIds);
            return { item, lineMetas };
        }));

        if (token !== stationResultRequestToken) return;

        clearList();
        if (!items.length) {
            renderEmpty('暂无站点结果');
            return;
        }

        for (const { item, lineMetas } of itemsWithMetas) {
            const li = document.createElement('li');
            const row = createStationResultRow(item, lineMetas);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                selectStation(item);
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
            stationResultRequestToken += 1;
            clearList();
            await renderHistoryResults();
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

            if (isOrigin) {
                selectedOriginId = '';
                selectedOriginCandidateIds = [];
            } else {
                selectedDestinationId = '';
                selectedDestinationCandidateIds = [];
            }

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
        const prevOriginCandidates = Array.isArray(selectedOriginCandidateIds) ? selectedOriginCandidateIds.slice() : [];
        const prevDestinationCandidates = Array.isArray(selectedDestinationCandidateIds) ? selectedDestinationCandidateIds.slice() : [];

        originInput.value = prevDestinationText;
        destinationInput.value = prevOriginText;

        originInput.dataset.stationId = prevDestinationId;
        destinationInput.dataset.stationId = prevOriginId;

        selectedOriginId = prevDestinationId;
        selectedDestinationId = prevOriginId;
        selectedOriginCandidateIds = prevDestinationCandidates;
        selectedDestinationCandidateIds = prevOriginCandidates;

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
