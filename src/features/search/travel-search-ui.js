import { searchRailEntities, getLineMetaByIds, mergeStationSearchItems } from './search.js';
import {
    collectJourneyCandidatesRaptor,
    getReachableStopsWithinMinutes,
    pickPlanBuckets,
    ensurePlannerStaticData,
    getGroupStops,
    filterNearbyStops,
    getNearbyStationsForJourneyPick,
    shouldBlockJourneyPlanning,
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
import { getCachedJson, getIconCandidates, getPreferredCachedImageSrc, setImageElementFromCache } from '../../lib/fetch.js';
import { createTimetableNoteRow } from '../panel/panelTimetableCore.js';
import { buildCompactTripDetailTransferLineItemHtmls } from '../panel/panelTripDetailTransfers.js';
import {
    detectThroughServiceCategoryFromTrips,
    THROUGH_SERVICE_DISPLAY,
    THROUGH_SERVICE_CONFIGS_OBJECT
} from '../../lib/throughServiceManager.js';
import { createJourneyPickController } from './journeyPickController.js';
import { logJourneyFareEstimates } from './journeyFareLogger.js';
import { createJourneyPlanPreviewController } from './journeyPlanPreviewController.js';
import {
    appendJourneyPairPlans,
    collectJourneyCandidatePlans,
    createJourneyComputeKey,
    createJourneyPairPlanRequest,
    createPickedJourneyResultRows,
    getMissingJourneySeedState,
    normalizeJourneyComputeInput,
    prepareOriginStopSet
} from './journeyComputeOrchestrator.js';
import {
    countJourneyPlanRideStations,
    createJourneyPlanBrief,
    createJourneyPaginationLabeler,
    createJourneyPlanMessageItem,
    createJourneyPlanPageButton,
    createJourneySpecialLinePathRow,
    createJourneyStationPathRow,
    createJourneyTrainPathRow,
    createJourneyTripEmptyRow,
    createJourneyTripStationRow,
    createJourneyTripTransferRow,
    createJourneyTransferPathRow,
    createJourneyWalkPathRow
} from './journeyPlanRenderer.js';
import { createReachableStopsController } from './reachableStopsController.js';
import { travelSearchMapActions } from './travelSearchMapActions.js';
import {
    buildDisplayPlanFromExpandedLegs,
    buildRailPreviewSegment,
    buildTripPreviewPayloadFromSegments
} from '../../domain/routePlanning/displayRows.js';
import { exportJourneyPopoverToPng } from './journeyCaptureExport.js';
import { journeyRuntimeAdapter } from './journeyRuntimeAdapter.js';
import { isDarkThemeActive } from '../../map/element_ui.js';
import { JOURNEY_CLEAR_REQUEST_EVENT } from '../../store/events.js';
import { createMobileJourneyPlanSheet } from '../../ui/mobileJourneyPlanSheet.js';

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

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const appendJourneyStationLineIconGroup = (textEl, lineMetas) => {
    const itemHtmls = buildCompactTripDetailTransferLineItemHtmls(lineMetas, { escapeHtml });
    if (!itemHtmls.length) return;

    const wrap = document.createElement('span');
    wrap.className = 'journey-station-result-lines journey-station-result-line-icons';
    wrap.innerHTML = `<span class="panel-trip-detail-transfer-items panel-trip-detail-transfer-items-main"><span class="panel-trip-detail-transfer-row">${itemHtmls.join('')}</span></span>`;
    textEl.appendChild(wrap);
};

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

const getTravelHistoryItemKey = (item) => (
    item?.id
        ? `${normalizeText(item.type || 'station')}:${normalizeText(item.id)}`
        : `text:${normalizeText(item?.text)}`
);

const sortTravelHistoryItems = (items) => {
    const arr = Array.isArray(items) ? items.slice() : [];
    return arr.sort((a, b) => {
        const af = a?.favorite === true ? 1 : 0;
        const bf = b?.favorite === true ? 1 : 0;
        return bf - af;
    });
};

const normalizeTravelHistoryItem = (item) => {
    if (typeof item === 'string') return { text: normalizeText(item).slice(0, 120), favorite: false };
    if (!item || typeof item !== 'object') return null;
    return {
        id: item.id ? String(item.id) : undefined,
        text: normalizeText(item.text).slice(0, 120),
        type: item.type || 'station',
        isTransfer: !!item.isTransfer,
        lineIds: Array.isArray(item.lineIds) ? item.lineIds.map(String) : undefined,
        stationGroupKey: item.stationGroupKey ? String(item.stationGroupKey) : undefined,
        favorite: item.favorite === true
    };
};

const loadTravelHistory = () => {
    try {
        const raw = window.localStorage?.getItem?.(TRAVEL_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return sortTravelHistoryItems(mergeStationSearchItems(parsed.map(normalizeTravelHistoryItem).filter(Boolean))).slice(0, TRAVEL_MAX_HISTORY);
    } catch {
        return [];
    }
};

const saveTravelHistory = (items) => {
    try {
        const list = sortTravelHistoryItems(mergeStationSearchItems(Array.isArray(items) ? items.map(normalizeTravelHistoryItem).filter(Boolean) : []));
        window.localStorage?.setItem?.(TRAVEL_HISTORY_KEY, JSON.stringify(list.slice(0, TRAVEL_MAX_HISTORY)));
    } catch {
        // ignore
    }
};

const addTravelHistory = (item) => {
    const value = normalizeTravelHistoryItem(item);
    if (!value || !value.text) return;
    const list = loadTravelHistory();
    const valueKey = getTravelHistoryItemKey(value);
    const existing = list.find((x) => getTravelHistoryItemKey(x) === valueKey) || null;
    if (existing?.favorite === true) value.favorite = true;
    const next = mergeStationSearchItems([
        value,
        ...list.filter((x) => getTravelHistoryItemKey(x) !== valueKey)
    ]).slice(0, TRAVEL_MAX_HISTORY);
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
        return journeyRuntimeAdapter.getJourneyUI();
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

    const mobileTripDetail = el('section', 'journey-plan-trip-detail is-hidden', {
        'aria-label': '路线班次详情'
    });
    const mobileTripDetailBody = el('div', 'journey-trip-body journey-plan-trip-detail-body');
    mobileTripDetail.appendChild(mobileTripDetailBody);

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
    let selectedOriginLngLat = null;
    let selectedDestinationLngLat = null;
    let composingOrigin = false;
    let composingDestination = false;
    let mapPickTarget = null; // 'origin' | 'destination' | null
    const journeyPickController = createJourneyPickController({
        formatCoordinates: formatJourneyMapCoordinates,
        getNearbyStationsForJourneyPick,
        mapActions: travelSearchMapActions,
        normalizeText
    });
    let lastPlanComputeKey = '';
    let planComputeToken = 0;
    let reachableStopsController = null;
    let scheduleDestinationReachableStopsTestRef = null;
    let popoverHideTimer = null;
    let pinnedTripPopoverKey = '';
    let tripPopoverHoverTimer = null;
    let mobileTripDetailOpen = false;
    let currentPlanPage = 0;
    let allPlanRows = [];
    let journeyPlanPreviewController = null;
    const getPaginationButtonLabel = createJourneyPaginationLabeler({
        getRows: () => allPlanRows,
        normalizeText
    });

    const isMobileJourneyPresentation = () => {
        const rootDataset = document.documentElement?.dataset || {};
        const bodyDataset = document.body?.dataset || {};
        return (rootDataset.mobileUi === '1' || bodyDataset.mobileUi === '1')
            && (rootDataset.mobileNavActive === 'search' || bodyDataset.mobileNavActive === 'search')
            && (rootDataset.mobileSearchMode === 'journey' || bodyDataset.mobileSearchMode === 'journey');
    };

    const setMobileJourneyPlanResultsActive = (active) => {
        const enabled = active === true && isMobileJourneyPresentation();
        root.classList.toggle('is-mobile-plan-results', enabled);
        const rootDataset = document.documentElement?.dataset;
        const bodyDataset = document.body?.dataset;
        if (enabled) {
            if (rootDataset) rootDataset.mobileJourneyPlanResults = '1';
            if (bodyDataset) bodyDataset.mobileJourneyPlanResults = '1';
        } else {
            if (rootDataset) delete rootDataset.mobileJourneyPlanResults;
            if (bodyDataset) delete bodyDataset.mobileJourneyPlanResults;
        }
        return enabled;
    };

    const isMobileJourneyPlanResultsActive = () => (
        isMobileJourneyPresentation()
        && (
            root.classList.contains('is-mobile-plan-results')
            || document.documentElement?.dataset?.mobileJourneyPlanResults === '1'
            || document.body?.dataset?.mobileJourneyPlanResults === '1'
        )
    );

    const setMobileJourneyTripDetailActive = (active) => {
        const enabled = active === true && isMobileJourneyPlanResultsActive();
        mobileTripDetailOpen = enabled;
        mobileTripDetail.classList.toggle('is-hidden', !enabled);
        if (enabled) {
            planResults.setAttribute('data-journey-trip-detail-open', '1');
        } else {
            planResults.removeAttribute('data-journey-trip-detail-open');
        }
        return enabled;
    };

    const closeMobileJourneyTripDetail = () => {
        if (!mobileTripDetailOpen && mobileTripDetail.classList.contains('is-hidden')) return false;
        setMobileJourneyTripDetailActive(false);
        while (mobileTripDetailBody.firstChild) mobileTripDetailBody.removeChild(mobileTripDetailBody.firstChild);
        return true;
    };

    const getJourneyPlanEndpointText = (kind, row = null) => {
        const input = kind === 'destination' ? destinationInput : originInput;
        const rowId = kind === 'destination'
            ? normalizeText(row?.destinationStationId || '')
            : normalizeText(row?.originStationId || '');
        const rowName = kind === 'destination'
            ? normalizeText(row?.destinationName || '')
            : normalizeText(row?.originName || '');
        return normalizeText(input?.value || '')
            || rowName
            || getStationNameById(rowId)
            || rowId
            || (kind === 'destination' ? '终点' : '起点');
    };

    const buildJourneyPlanSheetTitleText = (row = null) => (
        `${getJourneyPlanEndpointText('origin', row)} → ${getJourneyPlanEndpointText('destination', row)}`
    );

    const journeyPlanSheet = createMobileJourneyPlanSheet({
        rootEl: planResults,
        win: window,
        isEnabled: isMobileJourneyPresentation,
        isVisible: () => !planResults.classList.contains('is-hidden')
    });

    const appendPlanSheetHandle = (containerEl, { row = null } = {}) => {
        if (!(containerEl instanceof HTMLElement)) return null;
        const handle = el('div', 'journey-plan-sheet-handle', {
            'data-journey-plan-sheet-handle': '1'
        });
        const backBtn = el('button', 'journey-plan-sheet-back-btn', {
            type: 'button',
            'aria-label': '返回路线搜索'
        });
        const backIcon = el('img', 'journey-plan-sheet-back-icon', { alt: '' });
        setJourneyIconFromCache(backIcon, 'arrow-right.svg');
        backBtn.appendChild(backIcon);

        const title = el('div', 'journey-plan-sheet-title', {
            text: buildJourneyPlanSheetTitleText(row)
        });

        backBtn.addEventListener('pointerdown', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
        });
        backBtn.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (closeMobileJourneyTripDetail()) return;
            exitMobileJourneyPlanResults();
        });

        handle.appendChild(backBtn);
        handle.appendChild(title);
        containerEl.insertBefore(handle, containerEl.firstChild);
        journeyPlanSheet.bindHandle(handle);
        return handle;
    };

    const wrapPlanMessageItemDrawer = (itemEl) => {
        if (!(itemEl instanceof HTMLElement)) return itemEl;
        const drawer = el('div', 'journey-plan-drawer');
        appendPlanSheetHandle(drawer);
        while (itemEl.firstChild) drawer.appendChild(itemEl.firstChild);
        itemEl.appendChild(drawer);
        return itemEl;
    };

    journeyRuntimeAdapter.resetMapPickRuntimeFlags();

    const suppressStationSelectionOnce = (ms = 700) => {
        journeyRuntimeAdapter.suppressStationSelectionOnce(ms);
    };

    const setMapPickTarget = (target) => {
        mapPickTarget = target === 'origin' || target === 'destination' ? target : null;
        originMapPickBtn.classList.toggle('is-active', mapPickTarget === 'origin');
        destinationMapPickBtn.classList.toggle('is-active', mapPickTarget === 'destination');
        journeyRuntimeAdapter.setMapPickActive(!!mapPickTarget);
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
            selectedOriginLngLat = null;
            if (typeof scheduleDestinationReachableStopsTestRef === 'function') {
                scheduleDestinationReachableStopsTestRef();
            }
        } else {
            selectedDestinationId = resolvedId || '';
            selectedDestinationCandidateIds = [];
            selectedDestinationLngLat = null;
        }

        try {
            await journeyPickController.showStationPin({ stationId: resolvedId, type: key });
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
        const resolvedPick = await journeyPickController.resolveCoordinatePick({ lngLat });
        if (!resolvedPick) return;
        const { candidateIds, candidateMeta, coordsText, lngLat: normalizedLngLat } = resolvedPick;

        // 始终显示经纬度文本（格式化为一位小数），但保存候选站点 meta 供稍后计算步行时间
        input.value = coordsText;
        input.dataset.stationId = '';
        if (key === 'origin') {
            selectedOriginId = '';
            selectedOriginCandidateIds = candidateIds;
            selectedOriginCandidateMeta = candidateMeta;
            selectedOriginLngLat = normalizedLngLat;
        } else {
            selectedDestinationId = '';
            selectedDestinationCandidateIds = candidateIds;
            selectedDestinationCandidateMeta = candidateMeta;
            selectedDestinationLngLat = normalizedLngLat;
        }

        try {
            await journeyPickController.showCoordinatePin({ lngLat, type: key });
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
            if (typeof scheduleDestinationReachableStopsTestRef === 'function') {
                scheduleDestinationReachableStopsTestRef();
            }
        } else {
            selectedDestinationId = resolvedId || '';
            selectedDestinationCandidateIds = [];
        }

        try {
            journeyPickController.showStationPin({ stationId: resolvedId, type: key });
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
        const bound = journeyPickController.onMapPickClick((e) => {
            handleMapStationPick(e);
        });
        mapPickHookBound = bound !== false;
    };

    const mapPickBindTimer = window.setInterval(() => {
        ensureMapPickHook();
        if (mapPickHookBound) window.clearInterval(mapPickBindTimer);
    }, 400);

    const getActiveInput = () => (activeField === 'destination' ? destinationInput : originInput);

    const cancelTripPopoverHover = () => {
        if (!tripPopoverHoverTimer) return;
        window.clearTimeout(tripPopoverHoverTimer);
        tripPopoverHoverTimer = null;
    };

    const scheduleTripPopoverHover = ({ anchorEl, row }) => {
        cancelTripPopoverHover();
        cancelHideTripPopover();
        tripPopoverHoverTimer = window.setTimeout(() => {
            tripPopoverHoverTimer = null;
            if (!anchorEl || !row) return;
            showTripPopover({ anchorEl, row }).catch(() => {
                // ignore
            });
        }, 300);
    };

    const buildJourneyPlanPreviewPool = (rows) => {
        journeyPlanPreviewController?.buildPool?.(rows);
    };

    const bindJourneyPlanPageButton = (pageIndex, buttonEl) => {
        journeyPlanPreviewController?.bindPageButton?.(pageIndex, buttonEl);
    };

    const syncJourneyPlanVisibility = (pageIndex, { force = false } = {}) => {
        return journeyPlanPreviewController?.syncVisibility?.(pageIndex, { force }) === true;
    };

    const clearPlanList = ({ clearMapPreview = false } = {}) => {
        cancelTripPopoverHover();
        closeMobileJourneyTripDetail();
        if (clearMapPreview) {
            try {
                travelSearchMapActions.clearTripPathPreview();
            } catch {
                // ignore
            }
        }
        journeyPlanPreviewController?.resetAfterPlanListClear?.();
        while (planList.firstChild) planList.removeChild(planList.firstChild);
        while (planPagination.firstChild) planPagination.removeChild(planPagination.firstChild);
        currentPlanPage = 0;
        allPlanRows = [];
        hideTripPopover();
    };

    const generatePaginationButtonLabel = (label, index) => {
        return getPaginationButtonLabel(label, index);
    };

    const syncJourneyPickPinsForPlanRow = async (row) => {
        const destinationStationId = normalizeText(row?.destinationStationId || '');
        try {
            journeyPickController.clearPin('origin');
            if (destinationStationId) await journeyPickController.showStationPin({ stationId: destinationStationId, type: 'destination' });
        } catch {
            // ignore
        }
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
        const drawer = el('div', 'journey-plan-drawer');
        appendPlanSheetHandle(drawer, { row });

        const path = el('div', 'journey-plan-path');
        await appendJourneyPath(path, row, displayPlan);

        path.addEventListener('mouseenter', () => {
            if (isMobileJourneyPresentation()) return;
            scheduleTripPopoverHover({ anchorEl: path, row });
        });

        path.addEventListener('mouseleave', () => {
            if (isMobileJourneyPresentation()) return;
            cancelTripPopoverHover();
            scheduleHideTripPopover();
        });

        path.addEventListener('click', (evt) => {
            if (!isMobileJourneyPlanResultsActive()) return;
            evt.preventDefault?.();
            evt.stopPropagation?.();
            showMobileTripDetail({ row }).catch(() => null);
        });

        drawer.appendChild(path);
        drawer.appendChild(mobileTripDetail);
        li.appendChild(drawer);

        let stationCount = null;
        try {
            const detailBlocks = await buildPlanDetailBlocks({
                plan: row.plan,
                legsOverride: displayPlan?.legs,
                sectionsOverride: displayPlan?.sections,
                serviceDay: row.serviceDay,
                originStationId: row.originStationId
            });
            stationCount = countJourneyPlanRideStations({
                detailBlocks,
                normalizeText,
                transfers: displayPlan?.transfers
            });
        } catch (e) {
            // ignore
        }

        const brief = createJourneyPlanBrief({
            createElement: el,
            displayPlan,
            formatArrival: toHHMM,
            formatDuration,
            normalizeText,
            paginationEl: planPagination,
            row,
            stationCount
        });

        brief.addEventListener('click', (evt) => {
            if (!isMobileJourneyPlanResultsActive()) return;
            evt.preventDefault?.();
            evt.stopPropagation?.();
            showMobileTripDetail({ row }).catch(() => null);
        });

        li.appendChild(brief);

        planList.appendChild(li);
        await syncJourneyPickPinsForPlanRow(row);
    };

    const updatePaginationButtons = () => {
        while (planPagination.firstChild) planPagination.removeChild(planPagination.firstChild);
        
        if (allPlanRows.length <= 1) return;
        
        for (let i = 0; i < allPlanRows.length; i += 1) {
            const btn = createJourneyPlanPageButton({
                active: i === currentPlanPage,
                createLabel: (index) => generatePaginationButtonLabel(allPlanRows[index]?.label || '推荐', index),
                index: i,
                onClick: async (index) => {
                    if (index === currentPlanPage && journeyPlanPreviewController?.isHighlightedPage?.(index)) return;

                    // 切换到新页面
                    closeMobileJourneyTripDetail();
                    currentPlanPage = index;
                    await showCurrentPage();
                    updatePaginationButtons();

                    // 只高亮当前页，隐藏其他页
                    try {
                        syncJourneyPlanVisibility(index, { force: true });
                    } catch {
                        // ignore
                    }
                }
            });
            bindJourneyPlanPageButton(i, btn);
            
            planPagination.appendChild(btn);
        }
    };

    const clearTripDetailBody = (bodyEl = tripPopoverBody) => {
        while (bodyEl?.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    };

    const hideTripPopover = () => {
        tripPopover.classList.add('is-hidden');
        clearTripDetailBody(tripPopoverBody);
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
        journeyPlanPreviewController?.cancelHidePreview?.();
    };

    const clearJourneyPlanPreview = ({ force = false, clearMapPreview = true } = {}) => {
        journeyPlanPreviewController?.clearPreview?.({ force, clearMapPreview });
    };

    const scheduleClearJourneyPlanPreview = (delayMs = 120) => {
        journeyPlanPreviewController?.scheduleClearPreview?.(delayMs);
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

            const seg = buildRailPreviewSegment({
                lineId,
                stationIds,
                direction: segDir
            });
            if (seg) segments.push(seg);
        }

        return buildTripPreviewPayloadFromSegments({
            row,
            displayPlan,
            segments,
            toHHMM
        });
    };

    const getDisplayPlanForRow = async (row) => {
        if (!row || !row.plan) return null;
        if (row.__displayPlan) return row.__displayPlan;

        const expandedLegs = await expandLegsForDisplay({
            legs: row?.plan?.legs || [],
            serviceDay: row?.serviceDay,
            originStationId: row?.originStationId
        });

        const sectionListForDisplay = Array.isArray(row?.plan?.sections) ? row.plan.sections : [];
        row.__displayPlan = buildDisplayPlanFromExpandedLegs({
            expandedLegs,
            isThroughLegPairByMeta,
            plan: row.plan,
            row,
            sections: sectionListForDisplay
        });
        return row.__displayPlan;
    };

    journeyPlanPreviewController = createJourneyPlanPreviewController({
        buildTripPreviewPayloadFromDisplayPlan,
        getDisplayPlanForRow,
        mapActions: travelSearchMapActions,
        multiSelectApi: {
            isEnabled: () => travelSearchMapActions.isMultiSelectModeEnabled(),
            runLayerCommand: (action, itemId) => travelSearchMapActions.runMultiSelectLayerCommand(action, itemId)
        },
        normalizeText
    });

    const renderTripDetailBody = async ({ row, bodyEl = tripPopoverBody } = {}) => {
        clearTripDetailBody(bodyEl);
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
            bodyEl.appendChild(createJourneyTripEmptyRow({ createElement: el }));
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
                bodyEl.appendChild(createJourneyTripTransferRow({ createElement: el }));
                shouldAppendDirectionForNextNote = true;
                currentSectionIndex += 1;
                hasRenderedSectionLineNote = false;
                previousRideLineKey = '';
                continue;
            }

            const sectionThroughMeta = sectionThroughMetaList[currentSectionIndex] || null;
            const isSpecialThroughCategory = !!THROUGH_SERVICE_CONFIGS_OBJECT[sectionThroughMeta?.category];
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
                bodyEl.appendChild(note);
            }

            if (blockLineKey) previousRideLineKey = blockLineKey;

            for (let i = 0; i < block.rows.length; i += 1) {
                const s = block.rows[i];
                const isFirst = i === 0;
                const isLast = i === block.rows.length - 1;
                const stationId = normalizeText(s.stationId || '');
                const arriveText = normalizeText(s.arrText || '') || (isFirst ? normalizeText(s.depText || '') : '');
                const depText = overallDestinationStationId && stationId && overallDestinationStationId === stationId
                    ? ''
                    : (normalizeText(s.depText || '') || (isLast ? '-' : ''));
                const rowEl = createJourneyTripStationRow({
                    departureText: depText,
                    isPast: !!s?.isPast,
                    lineColor: lineColorResolved ? String(resolveJourneyColorForTheme(lineColorResolved)) : '',
                    showDestination: !!(overallDestinationStationId && stationId && overallDestinationStationId === stationId),
                    stationCode: normalizeText(stationCodeMap.get(stationId) || ''),
                    stationId,
                    stationName: normalizeText(s.stationName || s.stationId),
                    arrivalText: arriveText
                });
                if (rowEl) bodyEl.appendChild(rowEl);
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

    const showMobileTripDetail = async ({ row } = {}) => {
        if (!row || !isMobileJourneyPlanResultsActive()) return false;
        cancelTripPopoverHover();
        hideTripPopover();
        await renderTripDetailBody({ row, bodyEl: mobileTripDetailBody });
        setMobileJourneyTripDetailActive(true);
        journeyPlanSheet.show({ nextState: 'expanded' });
        return true;
    };

    const showPlanMessage = (message, { mobilePlanResults = false } = {}) => {
        clearPlanList();
        const item = createJourneyPlanMessageItem({ createElement: el, message });
        planList.appendChild(wrapPlanMessageItemDrawer(item));
        planResults.classList.remove('is-hidden');
        setMobileJourneyPlanResultsActive(mobilePlanResults);
        journeyPlanSheet.show({ nextState: 'expanded' });
        planPagination.classList.add('is-hidden');
    };

    const hidePlanResultsIfEmptyInputs = ({ clearMapPreview = false } = {}) => {
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        clearPlanList({ clearMapPreview });
        planResults.classList.add('is-hidden');
        setMobileJourneyPlanResultsActive(false);
        journeyPlanSheet.hide();
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
            return !!THROUGH_SERVICE_CONFIGS_OBJECT[category];
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

        const appendStationRow = ({ isThroughBoundary = false, stationName, timeText }) => {
            const rowEl = createJourneyStationPathRow({
                createElement: el,
                rowClass: isThroughBoundary ? 'station-row is-through-boundary' : 'station-row',
                stationName,
                timeText
            });
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
            const rowEl = createJourneyTrainPathRow({
                createElement: el,
                directionText,
                lineColor,
                lineText,
                resolveBadgeTextColor: resolveJourneyBadgeTextColor,
                resolveColor: resolveJourneyColorForTheme,
                stationCount,
                typeColor,
                typeText
            });
            rowsWrap.appendChild(rowEl);
        };

        const createWalkRow = ({ minutes, toText, isDestination = false }) => {
            return createJourneyWalkPathRow({
                createElement: el,
                isDestination,
                minutes,
                setIcon: setJourneyIconFromCache,
                toText
            });
        };

        const appendSpecialLineRow = (text) => {
            const rowEl = createJourneySpecialLinePathRow({
                createElement: el,
                normalizeText,
                text
            });
            if (!rowEl) return;
            rowsWrap.appendChild(rowEl);
        };

        const appendTransferRow = (waitMinutes) => {
            const rowEl = createJourneyTransferPathRow({
                createElement: el,
                waitMinutes
            });
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

            for (let markerIndex = 0; markerIndex < points.length; markerIndex += 1) {
                const y = points[markerIndex];
                if (!Number.isFinite(y)) continue;
                const rowEl = stationMarkerRows[markerIndex];
                if (rowEl?.classList?.contains?.('is-through-boundary')) continue;
                const dot = document.createElementNS(ns, 'circle');
                dot.setAttribute('cx', String(x));
                dot.setAttribute('cy', String(y));
                dot.setAttribute('r', '3');
                dot.setAttribute('fill', 'var(--ui-text-inverse)');
                svg.appendChild(dot);
            }

            for (let markerIndex = 0; markerIndex < points.length; markerIndex += 1) {
                const y = points[markerIndex];
                const rowEl = stationMarkerRows[markerIndex];
                if (!Number.isFinite(y) || !rowEl?.classList?.contains?.('is-through-boundary')) continue;
                const nextSeg = markerSegments.find((seg) => seg.from === markerIndex) || null;
                const nextY = nextSeg && Number.isFinite(points[nextSeg.to]) ? points[nextSeg.to] : y + 12;
                if (nextSeg && nextSeg.kind !== 'transfer') {
                    const lowerCover = document.createElementNS(ns, 'polygon');
                    const railLeft = x - 5;
                    const railRight = x + 5;
                    const coverBottom = Math.min(nextY, y + 14);
                    lowerCover.setAttribute('points', [
                        `${railLeft},${y + 6}`,
                        `${railRight},${y - 6}`,
                        `${railRight},${coverBottom}`,
                        `${railLeft},${coverBottom}`
                    ].join(' '));
                    lowerCover.setAttribute('fill', String(nextSeg?.color || '#9a9a9a'));
                    svg.appendChild(lowerCover);
                }

                const slashBase = document.createElementNS(ns, 'line');
                slashBase.setAttribute('x1', String(x - 6));
                slashBase.setAttribute('x2', String(x + 6));
                slashBase.setAttribute('y1', String(y + 7));
                slashBase.setAttribute('y2', String(y - 7));
                slashBase.setAttribute('stroke', 'var(--ui-frosted-background)');
                slashBase.setAttribute('stroke-width', '3');
                slashBase.setAttribute('stroke-linecap', 'round');
                svg.appendChild(slashBase);
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
            const isSpecialThroughCategory = !!THROUGH_SERVICE_CONFIGS_OBJECT[sectionThroughMeta?.category];
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
                    appendStationRow({
                        isThroughBoundary: true,
                        stationName: `${resolveStationName(last)}（无需换乘）`,
                        timeText: ''
                    });
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

    const enableMultiSelectMode = () => {
        journeyRuntimeAdapter.setMultiSelectInternalMode(true);
    };

    const disableMultiSelectMode = () => {
        try {
            journeyRuntimeAdapter.setMultiSelectInternalMode(false);
            // 清理多选的预览数据
            journeyPlanPreviewController?.clearPreview?.({ force: true });
        } catch {
            // ignore
        }
    };

    const highlightAllPlanResults = async (rows) => {
        await journeyPlanPreviewController?.highlightAll?.(rows);
    };

    const highlightSinglePlanResult = async (pageIndex) => {
        if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex >= allPlanRows.length) return;
        journeyPlanPreviewController?.syncVisibility?.(pageIndex);
    };
    const restoreAllPlanResults = async () => {
        if (!Array.isArray(allPlanRows) || !allPlanRows.length) return;
        journeyPlanPreviewController?.restoreAll?.();
    };
    const renderPlanResults = async (rows) => {
        clearPlanList();
        if (!rows.length) {
            showPlanMessage('无可用路线', { mobilePlanResults: true });
            return;
        }

        allPlanRows = rows;
        buildJourneyPlanPreviewPool(rows);
        currentPlanPage = 0;
        
        await showCurrentPage();
        updatePaginationButtons();
        planResults.classList.remove('is-hidden');
        setMobileJourneyPlanResultsActive(true);
        journeyPlanSheet.show({ nextState: 'expanded' });
        if (allPlanRows.length > 1) {
            planPagination.classList.remove('is-hidden');
        } else {
            planPagination.classList.add('is-hidden');
        }

        // 后台进入多选模式，显示所有结果高亮
        try {
            enableMultiSelectMode();
            await highlightAllPlanResults(rows);
            syncJourneyPlanVisibility(currentPlanPage, { force: true });
        } catch {
            // ignore highlighting errors
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

    reachableStopsController = createReachableStopsController({
        getDepartureBase: readDepartureBase,
        getDestinationRaw: () => destinationInput.value,
        getOriginStationId: () => selectedOriginId || originInput.dataset.stationId || '',
        getReachableStopsWithinMinutes,
        getServiceDay: readServiceDayFromPanel,
        mapActions: travelSearchMapActions,
        normalizeText
    });
    scheduleDestinationReachableStopsTestRef = () => reachableStopsController?.schedule?.();

    const maybeComputePlans = async () => {
        const {
            bothCoordinatePicks,
            bothStationPicks,
            coordinateMode,
            destinationId,
            destinationSeeds,
            originId,
            originSeeds
        } = normalizeJourneyComputeInput({
            destinationCandidateIds: selectedDestinationCandidateIds,
            destinationId: selectedDestinationId,
            destinationInputStationId: destinationInput.dataset.stationId,
            normalizeText,
            originCandidateIds: selectedOriginCandidateIds,
            originId: selectedOriginId,
            originInputStationId: originInput.dataset.stationId
        });

        const stationPickBlocked = bothStationPicks && shouldBlockJourneyPlanning({ originStationId: originId, destinationStationId: destinationId });
        const coordinatePickBlocked = bothCoordinatePicks && shouldBlockJourneyPlanning({ originLngLat: selectedOriginLngLat, destinationLngLat: selectedDestinationLngLat, maxDistanceMeters: 500 });

        if (stationPickBlocked || coordinatePickBlocked) {
            clearPlanList();
            showPlanMessage('出发站和终点站不能是同一个站');
            return;
        }

        const missingSeedState = getMissingJourneySeedState({
            destinationInputText: destinationInput.value,
            destinationSeeds,
            normalizeText,
            originInputText: originInput.value,
            originSeeds
        });
        if (missingSeedState) {
            if (missingSeedState.action === 'hide-if-empty') {
                hidePlanResultsIfEmptyInputs();
                return;
            }

            if (missingSeedState.action === 'show-message') {
                showPlanMessage(missingSeedState.message);
            }
            return;
        }

        // 同步执行规划前的初始化
        clearPlanList();
        disableMultiSelectMode();
        showPlanMessage('正在计算路线...', { mobilePlanResults: true });

        await new Promise(resolve => setTimeout(resolve, 300));

        const serviceDay = readServiceDayFromPanel();
        const { departureMs } = readDepartureBase();
        const key = createJourneyComputeKey({
            departureMs,
            destinationSeeds,
            originSeeds,
            serviceDay
        });

        const token = ++planComputeToken;
        lastPlanComputeKey = key;

        // 异步执行规划逻辑
        await ensurePlannerStaticData();
        
        const pairBestPlans = [];
        const pairBestWrappers = []; // { plan, originStationId, destinationStationId, originWalkMin, destWalkMin }

        for (const originStationId of originSeeds) {
            if (token !== planComputeToken) return;

            const sourceStops = prepareOriginStopSet({
                filterNearbyStops,
                getGroupStops,
                originStationId,
                radiusMeters: 800
            });
            if (!sourceStops) continue;

            for (const destinationStationId of destinationSeeds) {
                if (token !== planComputeToken) return;

                const pairRequest = createJourneyPairPlanRequest({
                    baseDepartureMs: departureMs,
                    destinationCandidateMeta: selectedDestinationCandidateMeta,
                    destinationStationId,
                    getGroupStops,
                    normalizeText,
                    originCandidateMeta: selectedOriginCandidateMeta,
                    originStationId,
                    sameSet,
                    serviceDay,
                    sourceStops
                });
                if (!pairRequest) continue;

                const plans = await collectJourneyCandidatePlans({
                    collectPlans: collectJourneyCandidatesRaptor,
                    request: pairRequest
                });

                if (token !== planComputeToken) return;
                if (!Array.isArray(plans) || !plans.length) continue;

                appendJourneyPairPlans({
                    coordinateMode,
                    destWalkMin: pairRequest.destWalkMin,
                    destinationStationId: pairRequest.destinationStationId,
                    originStationId: pairRequest.originStationId,
                    originWalkMin: pairRequest.originWalkMin,
                    pairBestPlans,
                    pairBestWrappers,
                    pickPlanBuckets,
                    plans
                });
            }
        }

        if (token !== planComputeToken) return;
        if (!pairBestPlans.length) {
            showPlanMessage('无可用路线', { mobilePlanResults: true });
            return;
        }

        const picked = createPickedJourneyResultRows({
            departureMs,
            destinationId,
            destinationInputText: destinationInput.value,
            destinationSeeds,
            getStationNameById,
            normalizeText,
            originId,
            originInputText: originInput.value,
            originSeeds,
            pairBestWrappers,
            pairBestPlans,
            pickPlanBuckets,
            serviceDay
        });
        await logJourneyFareEstimates({
            rows: picked,
            getDisplayPlanForRow
        }).catch(() => null);
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
        if (!mapPickTarget) hidePlanResultsIfEmptyInputs({ clearMapPreview: false });
    };

    const clearJourneyInputsAndCollapse = () => {
        try {
            reachableStopsController?.clear?.();
        } catch {
            // ignore
        }
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
        setMobileJourneyPlanResultsActive(false);
        journeyPlanSheet.hide();
        results.classList.add('is-hidden');
        disableMultiSelectMode();
        try {
            journeyPickController.clearPin();
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
            journeyPickController.showStationPin({ stationId: String(item?.id ?? ''), type: activeField });
        } catch {
            // ignore
        }

        if (activeField === 'origin') {
            selectedOriginId = String(item?.id ?? '');
            selectedOriginCandidateIds = [];
            if (typeof scheduleDestinationReachableStopsTestRef === 'function') {
                scheduleDestinationReachableStopsTestRef();
            }
        } else {
            selectedDestinationId = String(item?.id ?? '');
            selectedDestinationCandidateIds = [];
        }

        results.classList.add('is-hidden');
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

        appendJourneyStationLineIconGroup(text, lineMetas);

        row.appendChild(icon);
        row.appendChild(text);
        return row;
    };

    const resolveTravelHistoryStationItem = async (item) => {
        const base = normalizeTravelHistoryItem(item);
        if (!base || base.type === 'line' || base.type === 'company') return base;

        const currentLineIds = Array.isArray(base.lineIds)
            ? base.lineIds.map(String).filter(Boolean)
            : [];
        const candidates = await searchRailEntities(base.text || base.id || '', {
            limit: 20,
            allowedTypes: new Set(['station'])
        }).catch(() => []);
        const stationItems = Array.isArray(candidates) ? candidates : [];
        const match = stationItems.find((candidate) => (
            (base.id && candidate?.id && String(candidate.id) === String(base.id))
            || (base.text && normalizeText(candidate?.text) === normalizeText(base.text))
        )) || stationItems[0] || null;

        if (!match) return base;

        const mergedLineIds = Array.from(new Set([
            ...currentLineIds,
            ...(Array.isArray(match.lineIds) ? match.lineIds.map(String).filter(Boolean) : [])
        ]));
        return {
            ...base,
            id: match.id ? String(match.id) : (base.id || undefined),
            text: base.text || normalizeText(match.text),
            type: 'station',
            isTransfer: base.isTransfer || match.isTransfer === true,
            lineIds: mergedLineIds.length ? mergedLineIds : undefined,
            stationGroupKey: match.stationGroupKey ? String(match.stationGroupKey) : base.stationGroupKey,
            favorite: base.favorite === true
        };
    };

    const resolveTravelHistoryForRender = async () => {
        const history = loadTravelHistory().filter(item => item.type !== 'line' && item.type !== 'company');
        if (!history.length) return [];

        const resolved = mergeStationSearchItems((await Promise.all(history.map(resolveTravelHistoryStationItem))).filter(Boolean));
        const changed = resolved.length !== history.length || resolved.some((item, index) => {
            const prev = history[index] || {};
            const prevLineIds = Array.isArray(prev.lineIds) ? prev.lineIds.map(String).filter(Boolean) : [];
            const nextLineIds = Array.isArray(item?.lineIds) ? item.lineIds.map(String).filter(Boolean) : [];
            return String(prev.id || '') !== String(item?.id || '')
                || prev.isTransfer !== item?.isTransfer
                || prev.favorite !== item?.favorite
                || String(prev.stationGroupKey || '') !== String(item?.stationGroupKey || '')
                || nextLineIds.length !== prevLineIds.length
                || nextLineIds.some((lineId) => !prevLineIds.includes(lineId));
        });
        if (changed) {
            const blockedTypes = new Set(['line', 'company']);
            const nonStationHistory = loadTravelHistory().filter((item) => blockedTypes.has(item.type));
            saveTravelHistory([...resolved, ...nonStationHistory]);
        }
        return resolved;
    };

    const toggleTravelHistoryFavorite = (item) => {
        const value = normalizeTravelHistoryItem(item);
        if (!value) return;
        const key = getTravelHistoryItemKey(value);
        const next = loadTravelHistory().map((x) => {
            if (getTravelHistoryItemKey(x) !== key) return x;
            return {
                ...x,
                favorite: x.favorite !== true
            };
        });
        saveTravelHistory(next);
    };

    const createTravelHistoryFavoriteButton = (item) => {
        const favorite = item?.favorite === true;
        const btn = el('button', 'search-history-favorite', {
            type: 'button',
            'aria-label': favorite ? '取消收藏' : '收藏'
        });
        btn.textContent = favorite ? '★' : '☆';
        btn.style.marginLeft = '8px';
        btn.style.background = 'transparent';
        btn.style.border = 'none';
        btn.style.padding = '0 2px';
        btn.style.cursor = 'pointer';
        btn.style.color = favorite ? '#f5a400' : 'inherit';
        btn.style.fontSize = '16px';
        btn.style.lineHeight = '1';
        btn.style.opacity = favorite ? '1' : '0.6';
        btn.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            toggleTravelHistoryFavorite(item);
            renderHistoryResults();
        });
        return btn;
    };

    const renderHistoryResults = async () => {
        const history = await resolveTravelHistoryForRender();
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

            const favoriteBtn = createTravelHistoryFavoriteButton(item);
            row.appendChild(favoriteBtn);

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
                const itemKey = getTravelHistoryItemKey(item);
                const next = loadTravelHistory().filter((x) => getTravelHistoryItemKey(x) !== itemKey);
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

    const exitMobileJourneyPlanResults = () => {
        const shouldHandle = isMobileJourneyPlanResultsActive() || (
            isMobileJourneyPresentation() && !planResults.classList.contains('is-hidden')
        );
        if (!shouldHandle) return false;

        planComputeToken += 1;
        lastPlanComputeKey = '';
        activeField = 'origin';

        try {
            reachableStopsController?.clear?.();
        } catch {
            // ignore
        }

        originInput.value = '';
        destinationInput.value = '';
        originInput.dataset.stationId = '';
        destinationInput.dataset.stationId = '';
        selectedOriginId = '';
        selectedDestinationId = '';
        selectedOriginCandidateIds = [];
        selectedDestinationCandidateIds = [];
        selectedOriginCandidateMeta = [];
        selectedDestinationCandidateMeta = [];
        selectedOriginLngLat = null;
        selectedDestinationLngLat = null;
        setMapPickTarget(null);
        hideTripPopover();
        closeMobileJourneyTripDetail();
        clearPlanList({ clearMapPreview: true });
        planResults.classList.add('is-hidden');
        planPagination.classList.add('is-hidden');
        setMobileJourneyPlanResultsActive(false);
        journeyPlanSheet.hide();
        disableMultiSelectMode();
        try {
            journeyPickController.clearPin();
        } catch {
            // ignore
        }

        root.classList.remove('is-collapsed');
        try {
            document.documentElement.dataset.mobileSearchFocus = 'journey';
            document.body.dataset.mobileSearchFocus = 'journey';
        } catch {
            // ignore
        }
        renderHistoryResults().catch(() => null);
        return true;
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
            try {
                document.documentElement.dataset.mobileSearchFocus = 'journey';
                document.body.dataset.mobileSearchFocus = 'journey';
            } catch {
                // ignore
            }
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
                try {
                    reachableStopsController?.clear?.();
                } catch {
                    // ignore
                }
            } else {
                selectedDestinationId = '';
                selectedDestinationCandidateIds = [];
            }

            lastPlanComputeKey = '';

            refresh();

            if (!isOrigin) scheduleDestinationReachableStopsTestRef?.();
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

    const toggleMapPickMode = (target) => {
        const nextTarget = target === 'destination' ? 'destination' : 'origin';
        if (mapPickTarget === nextTarget) {
            try {
                journeyPickController.clearPin(nextTarget);
            } catch {
                // ignore
            }
            setMapPickTarget(null);
            return;
        }

        armMapPick(nextTarget);
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

        if (typeof scheduleDestinationReachableStopsTestRef === 'function') {
            scheduleDestinationReachableStopsTestRef();
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
        toggleMapPickMode('origin');
    });

    destinationMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        toggleMapPickMode('destination');
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

    window.addEventListener(JOURNEY_CLEAR_REQUEST_EVENT, () => {
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
        cancelTripPopoverHover();
    });
    tripPopover.addEventListener('mouseleave', () => {
        if (!pinnedTripPopoverKey) {
            scheduleHideTripPopover();
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
        clearAndCollapse: () => clearJourneyInputsAndCollapse(),
        handleMobileBackIntent: () => {
            if (closeMobileJourneyTripDetail()) return true;
            return exitMobileJourneyPlanResults();
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

    journeyRuntimeAdapter.publishJourneyUI(ui);
    return ui;
}

mountTravelSearchUI();
