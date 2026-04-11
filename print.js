/*
 * print.js
 *
 * 导出当前 trip-preview 高亮要素为 SVG（点击左上角“截图”按钮）：
 * - 高亮线段（trip-preview-source -> lineFc）
 * - 停靠站点（trip-preview-stops-source -> stopFc）
 * - 站名（由 stations.json 映射，按停靠站集合绘制）
 *
 * 与 app.js 的联动方式：
 * - app.js 暴露 window.__TokyoRailMap
 * - app.js 在 previewTripPath(payload) 计算 built 后派发事件 __TokyoRailTripPreviewUpdated
 *
 * 本文件只负责：缓存最近一次 trip-preview 的 built 数据，并在点击“截图（导出 SVG）”按钮时导出 SVG 并下载。
 */

(() => {
    'use strict';

    const getCachedJsonSafe = async (url) => {
        try {
            const api = window?.TokyoRailFetchCache;
            if (typeof api?.getCachedJson === 'function') {
                const data = await api.getCachedJson(url);
                if (data != null) return data;
            }
            const resp = await fetch(url);
            if (!resp.ok) return null;
            return await resp.json();
        } catch {
            return null;
        }
    };

    const cachedFetchSafe = async (url) => {
        try {
            return await fetch(url);
        } catch {
            return null;
        }
    };

    const setIconFromCache = (img, iconFile) => {
        const file = String(iconFile ?? '').trim();
        if (!(img instanceof HTMLImageElement) || !file) return;

        const apply = () => {
            const api = window?.TokyoRailFetchCache;
            if (!api) return false;

            const getIconCandidates = typeof api.getIconCandidates === 'function' ? api.getIconCandidates : null;
            const getPreferredCachedImageSrc = typeof api.getPreferredCachedImageSrc === 'function'
                ? api.getPreferredCachedImageSrc
                : null;
            const setImageElementFromCache = typeof api.setImageElementFromCache === 'function'
                ? api.setImageElementFromCache
                : null;

            if (!getIconCandidates || !getPreferredCachedImageSrc) return false;

            const candidates = getIconCandidates(file);
            if (!Array.isArray(candidates) || !candidates.length) return false;

            const cacheKey = `icon:${file}`;
            const preferred = getPreferredCachedImageSrc(candidates, { cacheKey }) || '';
            if (preferred) img.src = preferred;

            if (setImageElementFromCache) {
                setImageElementFromCache(img, candidates, {
                    cacheKey,
                    fallbackSrc: preferred || candidates[0] || ''
                }).catch(() => null);
            }

            return true;
        };

        if (apply()) return;
        window.addEventListener('__TokyoRailFetchCacheReady', () => {
            apply();
        }, { once: true });
    };

    const EXPORT_EVENT = '__TokyoRailTripPreviewUpdated';
    const CLEAR_EVENT = '__TokyoRailTripPreviewCleared';
    const BASE_HL_EVENT = '__TokyoRailBaseHighlightUpdated';
    const BASE_HL_CLEAR_EVENT = '__TokyoRailBaseHighlightCleared';
    const EXPORT_UI_STORAGE_KEY = 'tokyorail.export.ui';

    // ---- virtual backend map (offscreen) ----

    /** @type {Promise<{ map: any, container: HTMLDivElement }> | null} */
    let virtualMapPromise = null;

    const buildRasterStyle = (dark) => {
        const tiles = dark ? [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
        ] : [
            'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
        ];

        return {
            version: 8,
            sources: {
                'export-raster': {
                    type: 'raster',
                    tiles,
                    tileSize: 256
                }
            },
            layers: [
                {
                    id: 'export-raster-layer',
                    type: 'raster',
                    source: 'export-raster'
                }
            ]
        };
    };

    const ensureVirtualMap = () => {
        if (virtualMapPromise) return virtualMapPromise;
        virtualMapPromise = (async () => {
            const maplibregl = window.maplibregl;
            if (!maplibregl?.Map) throw new Error('MapLibre not available');

            const container = document.createElement('div');
            container.setAttribute('data-virtual-export-map', '1');
            container.style.position = 'fixed';
            container.style.left = '-100000px';
            container.style.top = '0';
            container.style.width = '1px';
            container.style.height = '1px';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            container.style.overflow = 'hidden';
            document.body.appendChild(container);

            const style = buildRasterStyle(isDarkTheme());

            const map = new maplibregl.Map({
                container,
                style,
                center: [139.767, 35.681],
                zoom: 11,
                interactive: false,
                attributionControl: false,
                preserveDrawingBuffer: true,
                pixelRatio: 1
            });

            await new Promise((resolve) => {
                if (map.loaded?.()) return resolve();
                map.once('load', () => resolve());
            });

            return { map, container };
        })();
        return virtualMapPromise;
    };

    // 尽量提前预热虚拟地图，避免首次点击时异步 load 造成下载被浏览器视为“非用户手势”。
    setTimeout(() => {
        ensureVirtualMap().catch(() => {});
    }, 0);

    const escapeXml = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

    const isDarkTheme = () => {
        try {
            return document.documentElement.getAttribute('data-theme') === 'dark';
        } catch {
            return false;
        }
    };

    const resolveLineColorForTheme = (props, fallback = '#0a84ff') => {
        const p = props && typeof props === 'object' ? props : {};
        const raw = isDarkTheme() ? (p._dark_color ?? p.color) : p.color;
        const out = String(raw ?? '').trim();
        return out || String(fallback || '#0a84ff');
    };

    const toText = (v) => String(v ?? '').trim();

    const normalizeArrayLike = (value) => {
        if (Array.isArray(value)) return value;
        if (value == null) return [];
        return [value];
    };

    const parseCssColorToRgb = (input) => {
        const s = toText(input);
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

    const rgbToHex = ({ r, g, b }) => {
        const to2 = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, '0');
        return `#${to2(r)}${to2(g)}${to2(b)}`;
    };

    const relativeLuminance = ({ r, g, b }) => {
        const toLinear = (v) => {
            const x = Math.max(0, Math.min(255, Number(v) || 0)) / 255;
            return x <= 0.03928 ? (x / 12.92) : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        const lr = toLinear(r);
        const lg = toLinear(g);
        const lb = toLinear(b);
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };

    const DARK_INVERT_TRIGGER_LUMINANCE = (() => {
        const ref = parseCssColorToRgb('#005AAA');
        return ref ? relativeLuminance(ref) : 0.102;
    })();

    const adjustColorForDarkThemeIfNeeded = (color) => {
        const parsed = parseCssColorToRgb(color);
        if (!parsed) return String(color || '');

        const lum = relativeLuminance(parsed);
        if (!(lum < DARK_INVERT_TRIGGER_LUMINANCE)) return String(color || '');

        return rgbToHex({
            r: 255 - parsed.r,
            g: 255 - parsed.g,
            b: 255 - parsed.b
        });
    };

    const resolveRailColorForTheme = (color, options = {}) => {
        const raw = toText(color);
        if (!raw) return raw;
        const dark = options.isDarkThemeActive === true || (options.isDarkThemeActive == null && isDarkTheme());
        if (!dark) return raw;
        return adjustColorForDarkThemeIfNeeded(raw);
    };

    const resolvePrimaryStationLineId = (props) => {
        const platform = normalizeArrayLike(props?.platform_line_id).map((x) => toText(x)).filter(Boolean);
        if (platform.length) return platform[0];
        const serving = normalizeArrayLike(props?.serving_ids).map((x) => toText(x)).filter(Boolean);
        return serving.length ? serving[0] : '';
    };

    const getCurrentStationLabelMode = () => {
        try {
            const host = document.querySelector('.settings-item.settings-item-station-label');
            const active = host?.querySelector('button.is-active');
            const t = String(active?.textContent || '').trim();
            if (t.includes('隐藏')) return 'off';
            if (t.includes('全显')) return 'all';
            if (t.includes('自动')) return 'auto';
        } catch {
            // ignore
        }
        return 'auto';
    };

    // ---- text measure + simple collision filter (export only) ----
    const __textMeasure = (() => {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            return { ctx, cache: new Map() };
        } catch {
            return { ctx: null, cache: new Map() };
        }
    })();

    const measureTextWidthPx = (text, font) => {
        const s = String(text ?? '');
        const f = String(font ?? '');
        const key = `${f}::${s}`;
        const cached = __textMeasure.cache.get(key);
        if (typeof cached === 'number') return cached;
        const ctx = __textMeasure.ctx;
        if (!ctx) {
            const fallback = Math.max(1, s.length * 7);
            __textMeasure.cache.set(key, fallback);
            return fallback;
        }
        ctx.font = f || '12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        const w = Math.max(1, Number(ctx.measureText(s).width) || 1);
        __textMeasure.cache.set(key, w);
        return w;
    };

    const bboxesIntersect = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    const gridKey = (cx, cy) => `${cx},${cy}`;

    const pickVisibleLabelIdsByCollision = ({ map, candidates, gridCellPx = 80 }) => {
        const list = Array.isArray(candidates) ? candidates : [];
        if (!list.length) return new Set();

        const sorted = list.slice().sort((a, b) => {
            const pa = Number(a?.priority || 0);
            const pb = Number(b?.priority || 0);
            if (pb !== pa) return pb - pa;
            return String(a?.text || '').localeCompare(String(b?.text || ''));
        });

        const grid = new Map();
        const visible = new Set();

        for (const item of sorted) {
            const coord = item?.coordinates;
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const text = String(item?.text || '').trim();
            if (!text) continue;
            const id = String(item?.id || '').trim();
            if (!id) continue;

            const x = Number(coord[0]);
            const y = Number(coord[1]);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

            const fontPx = Number(item?.fontPx || 12);
            const font = String(item?.font || `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`);
            const w = Number(item?.widthPx || 0) || measureTextWidthPx(text, font);
            const h = Number(item?.heightPx || 0) || fontPx;

            const p = map.project({ lng: x, lat: y });
            const px = Number(p?.x);
            const py = Number(p?.y);
            if (!Number.isFinite(px) || !Number.isFinite(py)) continue;

            // label baseline y = py - dy
            const dy = Number(item?.labelDyPx || 0);
            const bottom = py - dy;
            const top = bottom - h;
            const left = px - w / 2;
            const right = px + w / 2;
            const bbox = { left, right, top, bottom };

            const minCx = Math.floor(left / gridCellPx);
            const maxCx = Math.floor(right / gridCellPx);
            const minCy = Math.floor(top / gridCellPx);
            const maxCy = Math.floor(bottom / gridCellPx);

            let collides = false;
            for (let cx = minCx; cx <= maxCx && !collides; cx += 1) {
                for (let cy = minCy; cy <= maxCy && !collides; cy += 1) {
                    const key = gridKey(cx, cy);
                    const bucket = grid.get(key);
                    if (!bucket) continue;
                    for (let i = 0; i < bucket.length; i += 1) {
                        if (bboxesIntersect(bbox, bucket[i])) {
                            collides = true;
                            break;
                        }
                    }
                }
            }
            if (collides) continue;

            visible.add(id);
            for (let cx = minCx; cx <= maxCx; cx += 1) {
                for (let cy = minCy; cy <= maxCy; cy += 1) {
                    const key = gridKey(cx, cy);
                    if (!grid.has(key)) grid.set(key, []);
                    grid.get(key).push(bbox);
                }
            }
        }

        return visible;
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
        .replace(/[^A-Za-z0-9_.\-]/g, '_')
        .slice(0, 120);

    // SVG 导出为手工几何绘制，无法可靠复刻 GPU line-offset 表达式；
    // 因此导出时默认回退：站点/站名/换乘胶囊使用原始未偏移坐标。
    const EXPORT_NO_OFFSET_OVERLAY = true;

    // ---- station id -> name index ----
    let stationsIndexPromise = null;
    const getStationNameById = async () => {
        if (stationsIndexPromise) return stationsIndexPromise;
        stationsIndexPromise = (async () => {
            try {
                const list = await getCachedJsonSafe('./data/stations.json');
                const map = new Map();
                for (const s of Array.isArray(list) ? list : []) {
                    const id = String(s?.id ?? '').trim();
                    if (!id) continue;
                    const t = s?.title || {};
                    const name = String(t['zh-Hans'] || t.zh || t.ja || t.en || '').trim();
                    if (name) map.set(id, name);
                }
                return map;
            } catch {
                return new Map();
            }
        })();
        return stationsIndexPromise;
    };

    // 尽量提前预热 stations.json，避免点击导出时触发网络请求导致“非用户手势下载”被浏览器拦截。
    setTimeout(() => {
        getStationNameById().catch(() => {});
    }, 0);

    let rawStationsCoordByIdPromise = null;
    const getRawStationsCoordById = async () => {
        if (rawStationsCoordByIdPromise) return rawStationsCoordByIdPromise;
        rawStationsCoordByIdPromise = (async () => {
            const out = new Map();
            try {
                const list = await getCachedJsonSafe('./data/stations.json');
                for (const s of Array.isArray(list) ? list : []) {
                    const id = String(s?.id || '').trim();
                    const c = Array.isArray(s?.coord) ? s.coord : null;
                    if (!id || !c || c.length < 2) continue;
                    const lng = Number(c[0]);
                    const lat = Number(c[1]);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                    out.set(id, [lng, lat]);
                }
            } catch {
                // ignore
            }
            return out;
        })();
        return rawStationsCoordByIdPromise;
    };

    // ---- geometry helpers ----

    const lerp = (a, b, t) => a + (b - a) * t;

    const expSizeAtZoom = (zoom, baseAtZ12, maxAtZ16) => {
        const z = Number(zoom);
        const a = Number(baseAtZ12);
        const b = Number(maxAtZ16);
        if (!Number.isFinite(z) || !Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return a;
        const growthPerZoom = Math.pow(b / a, 1 / 4);
        return a * Math.pow(growthPerZoom, z - 12);
    };

    const lineBaseWidthForZoom = (zoom) => {
        const at12 = 4;
        const at16 = 4 * (5 / 3.5);
        return expSizeAtZoom(zoom, at12, at16);
    };

    const lineLowlightWidthForZoom = (zoom) => {
        const at12 = 1.2;
        const at16 = 1.2 * (5 / 3.5);
        return expSizeAtZoom(zoom, at12, at16);
    };

    const radiusForStop = (zoom, servingCount) => {
        return expSizeAtZoom(zoom, 3.5, 5);
    };

    const stopStrokeWidth = (zoom, servingCount) => {
        const sc = Number(servingCount || 1);
        if (sc > 1) return 0;
        return expSizeAtZoom(zoom, 2, 2.8);
    };

    let stationStyleContextPromise = null;

    const getStationStyleContext = async (map) => {
        if (stationStyleContextPromise) return stationStyleContextPromise;
        stationStyleContextPromise = (async () => {
            const baseMap = window.__TokyoRailMap || map;
            const lineColorById = new Map();
            const stationPrimaryLineIdByStationId = new Map();

            if (baseMap) {
                const linesFc = await getGeoJsonSourceData(baseMap, 'lines-source');
                for (const f of Array.isArray(linesFc?.features) ? linesFc.features : []) {
                    const props = f?.properties || {};
                    const lineId = toText(props.id);
                    if (!lineId || lineColorById.has(lineId)) continue;
                    const c = toText(props.color || props._dark_color);
                    if (c) lineColorById.set(lineId, c);
                }

                const stationsFc = await getGeoJsonSourceData(baseMap, 'stations-source');
                for (const f of Array.isArray(stationsFc?.features) ? stationsFc.features : []) {
                    const props = f?.properties || {};
                    const stationId = toText(props.id);
                    if (!stationId || stationPrimaryLineIdByStationId.has(stationId)) continue;
                    const primary = resolvePrimaryStationLineId(props);
                    if (primary) stationPrimaryLineIdByStationId.set(stationId, primary);
                }
            }

            return { lineColorById, stationPrimaryLineIdByStationId };
        })();
        return stationStyleContextPromise;
    };

    const stationServingCountForStyle = (props) => {
        const serving = normalizeArrayLike(props?.serving_ids).map((x) => toText(x)).filter(Boolean);
        if (serving.length) return Math.max(1, serving.length);
        const raw = Number(props?.serving_count);
        if (Number.isFinite(raw) && raw > 0) return Math.max(1, Math.round(raw));
        return 1;
    };

    const resolveStationFillColor = ({ props, styleContext }) => {
        const dark = isDarkTheme();
        const fallback = dark ? '#8e95a1' : '#fff';
        const sid = toText(props?.id);

        let lineId = resolvePrimaryStationLineId(props);
        if (!lineId && sid) lineId = toText(styleContext?.stationPrimaryLineIdByStationId?.get(sid));
        if (!lineId) return fallback;

        const rawColor = toText(styleContext?.lineColorById?.get(lineId));
        if (!rawColor) return fallback;

        return resolveRailColorForTheme(rawColor, { isDarkThemeActive: dark }) || fallback;
    };

    const stopStroke = () => (isDarkTheme() ? '#111' : '#fff');

    const labelFill = () => (isDarkTheme() ? '#f2f2f2' : '#111');
    const stationLabelBoxFill = () => (isDarkTheme() ? 'rgba(24, 26, 31, 0.88)' : 'rgba(255, 255, 255, 0.8)');
    const stationLabelBoxStroke = () => (isDarkTheme() ? 'rgba(210, 216, 226, 0.35)' : 'rgba(0, 0, 0, 0.2)');

    const getThemeCapsuleColors = () => {
        const isDark = isDarkTheme();
        return {
            outline: isDark ? '#fff' : '#111',
            inner: isDark ? '#111' : '#fff'
        };
    };

    const capsuleLineWidths = (z) => ({
        outline: expSizeAtZoom(z, 12, 24),
        inner: expSizeAtZoom(z, 8, 14)
    });

    const capsuleCircleRadii = (z) => ({
        outline: expSizeAtZoom(z, 6.8, 11.5),
        inner: expSizeAtZoom(z, 5.0, 8.6)
    });

    const remapStopFeatureCoordsToRawStations = async (stopFeatures) => {
        const fs = Array.isArray(stopFeatures) ? stopFeatures : [];
        if (!fs.length) return fs;
        const rawById = await getRawStationsCoordById();
        if (!(rawById instanceof Map) || !rawById.size) return fs;

        return fs.map((f) => {
            const sid = String(f?.properties?.id || f?.id || '').trim();
            const raw = sid ? rawById.get(sid) : null;
            if (!raw || raw.length < 2) return f;
            const lng = Number(raw[0]);
            const lat = Number(raw[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return f;
            return {
                ...f,
                geometry: {
                    ...(f?.geometry || {}),
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            };
        });
    };

    const project = (map, lngLat) => {
        const p = map.project(lngLat);
        return { x: Number(p.x), y: Number(p.y) };
    };

    const appendTransferCapsulesSvg = ({ parts, map, z, capsuleLines, capsuleCentroids }) => {
        if (!capsuleLines?.length && !capsuleCentroids?.length) return;

        const colors = getThemeCapsuleColors();
        const widths = capsuleLineWidths(z);
        const radii = capsuleCircleRadii(z);

        // Draw Capsule Lines - Outline (排除 fallbackCircle)
        if (capsuleLines?.length) {
            parts.push(`<g id="capsules-outline" fill="none" stroke="${colors.outline}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${widths.outline}">`);
            for (const f of capsuleLines) {
                if (f.properties?.fallbackCircle === 1) continue;
                const d = pathFromCoords(map, f.geometry?.coordinates);
                if (d) parts.push(`<path d="${d}"/>`);
            }
            parts.push(`</g>`);

            // Draw Capsule Lines - Inner (排除 fallbackCircle)
            parts.push(`<g id="capsules-inner" fill="none" stroke="${colors.inner}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${widths.inner}">`);
            for (const f of capsuleLines) {
                if (f.properties?.fallbackCircle === 1) continue;
                const d = pathFromCoords(map, f.geometry?.coordinates);
                if (d) parts.push(`<path d="${d}"/>`);
            }
            parts.push(`</g>`);
        }

        // Draw Fallback Circles (Centroids marked with fallbackCircle = 1)
        const fallbacks = (capsuleCentroids || []).filter(f => f.properties?.fallbackCircle === 1);
        if (fallbacks.length) {
            parts.push(`<g id="capsules-fallback-outline" fill="${colors.outline}">`);
            for (const f of fallbacks) {
                const c = f.geometry?.coordinates;
                if (!Array.isArray(c) || c.length < 2) continue;
                const p = project(map, { lng: Number(c[0]), lat: Number(c[1]) });
                if (Number.isFinite(p.x)) parts.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${radii.outline.toFixed(2)}"/>`);
            }
            parts.push(`</g>`);

            parts.push(`<g id="capsules-fallback-inner" fill="${colors.inner}">`);
            for (const f of fallbacks) {
                const c = f.geometry?.coordinates;
                if (!Array.isArray(c) || c.length < 2) continue;
                const p = project(map, { lng: Number(c[0]), lat: Number(c[1]) });
                if (Number.isFinite(p.x)) parts.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${radii.inner.toFixed(2)}"/>`);
            }
            parts.push(`</g>`);
        }
    };

    const appendStationLabelBoxesSvg = ({ parts, groupId, map, candidates, visibleIds }) => {
        const list = Array.isArray(candidates) ? candidates : [];
        if (!list.length) return;

        const visible = visibleIds instanceof Set
            ? visibleIds
            : new Set(list.map((x) => String(x?.id || '').trim()).filter(Boolean));

        const fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
        const padX = 4;
        const radius = 3;

        parts.push(`<g id="${escapeXml(groupId)}">`);
        for (const item of list) {
            const id = String(item?.id || '').trim();
            if (!id || !visible.has(id)) continue;

            const coord = item?.coordinates;
            if (!Array.isArray(coord) || coord.length < 2) continue;
            const text = String(item?.text || '').trim();
            if (!text) continue;

            const p = project(map, { lng: Number(coord[0]), lat: Number(coord[1]) });
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

            const fontPx = Number(item?.fontPx || 12);
            const y = p.y - Number(item?.labelDyPx || 0);
            const boxW = Math.max(8, Number(item?.widthPx || 0) || (measureTextWidthPx(text, `${fontPx}px ${fontFamily}`) + padX * 2));
            const boxH = Math.max(12, Number(item?.heightPx || 0) || Math.ceil(fontPx * 1.2 + 2));
            const boxX = p.x - boxW / 2;
            const boxY = y - boxH;
            const textY = boxY + boxH / 2;

            parts.push(
                `<rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" rx="${radius}" ry="${radius}" fill="${stationLabelBoxFill()}" stroke="${stationLabelBoxStroke()}" stroke-width="1"/>`
            );
            parts.push(
                `<text x="${p.x.toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-family="${fontFamily}" font-size="${fontPx}" fill="${labelFill()}">${escapeXml(text)}</text>`
            );
        }
        parts.push(`</g>`);
    };

    const pathFromCoords = (map, coords) => {
        const pts = (Array.isArray(coords) ? coords : []).filter((c) => Array.isArray(c) && c.length >= 2);
        if (pts.length < 2) return '';

        let d = '';
        for (let i = 0; i < pts.length; i += 1) {
            const ll = pts[i];
            const xy = project(map, { lng: Number(ll[0]), lat: Number(ll[1]) });
            if (!Number.isFinite(xy.x) || !Number.isFinite(xy.y)) continue;
            d += (d ? ' L ' : 'M ') + `${xy.x.toFixed(2)} ${xy.y.toFixed(2)}`;
        }
        return d;
    };

    const downloadBlob = ({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    // 增加 capsules 参数
    const buildSvgFromBuilt = async ({ map, payload, built, backgroundImageHref, transparentBackground = false, capsules }) => {
        const container = map.getContainer?.();
        const rect = container?.getBoundingClientRect?.();
        const width = Math.max(1, Math.round(rect?.width || 0));
        const height = Math.max(1, Math.round(rect?.height || 0));

        const z = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
        const stationStyleContext = await getStationStyleContext(map);

        const stationNameById = await getStationNameById();

        const lineFc = built?.lineFc;
        const stopFc = built?.stopFc;
        const lineFeatures = Array.isArray(lineFc?.features) ? lineFc.features : [];
        const stopFeatures = Array.isArray(stopFc?.features) ? stopFc.features : [];

        const bg = isDarkTheme() ? '#000' : '#fff';

        const title = (() => {
            const lineId = String(payload?.selectedLineId || '').trim();
            const tripKey = String(payload?.tripKey || '').trim();
            if (lineId && tripKey) return `trip ${lineId} || ${tripKey}`;
            return 'trip preview';
        })();

        const lowlightLineFeatures = Array.isArray(built?._exportLowlightLines) ? built._exportLowlightLines : [];

        const parts = [];
        parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden">`);
        parts.push(`<title>${escapeXml(title)}</title>`);
        parts.push(`<defs>`);
        parts.push(`<clipPath id="export-clip"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath>`);
        parts.push(`</defs>`);
        parts.push(`<g clip-path="url(#export-clip)">`);
        if (!transparentBackground) {
            parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`);
            if (backgroundImageHref) {
                const href = escapeXml(String(backgroundImageHref));
                parts.push(`<image x="0" y="0" width="${width}" height="${height}" href="${href}" xlink:href="${href}" preserveAspectRatio="none"/>`);
            }
        }

        // lowlight base lines (grey)
        if (lowlightLineFeatures.length) {
            const stroke = isDarkTheme() ? '#666' : '#999';
            parts.push(`<g id="base-lines-lowlight" fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2" opacity="0.45">`);
            for (const f of lowlightLineFeatures) {
                const geom = f?.geometry;
                if (!geom) continue;
                if (geom.type === 'LineString') {
                    const d = pathFromCoords(map, geom.coordinates);
                    if (!d) continue;
                    parts.push(`<path d="${d}"/>`);
                } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                    for (const line of geom.coordinates) {
                        const d = pathFromCoords(map, line);
                        if (!d) continue;
                        parts.push(`<path d="${d}"/>`);
                    }
                }
            }
            parts.push(`</g>`);
        }

        // lines
        const linesSorted = lineFeatures.slice().sort((a, b) => {
            const ra = String(a?.properties?.role || '');
            const rb = String(b?.properties?.role || '');
            if (ra === rb) return 0;
            if (ra === 'connector') return -1;
            if (rb === 'connector') return 1;
            return 0;
        });

        parts.push(`<g id="trip-preview-lines" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
        for (const f of linesSorted) {
            const geom = f?.geometry;
            if (!geom) continue;
            const role = String(f?.properties?.role || 'line');
            const color = resolveLineColorForTheme(f?.properties, '#0a84ff');
            const opacity = role === 'connector' ? 0.95 : 1;
            const strokeWidth = role === 'connector'
                ? lineLowlightWidthForZoom(z)
                : lineBaseWidthForZoom(z);

            if (geom.type === 'LineString') {
                const d = pathFromCoords(map, geom.coordinates);
                if (!d) continue;
                parts.push(`<path d="${d}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`);
            } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                for (const line of geom.coordinates) {
                    const d = pathFromCoords(map, line);
                    if (!d) continue;
                    parts.push(`<path d="${d}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" opacity="${opacity}"/>`);
                }
            }
        }
        parts.push(`</g>`);

        // capsules: above lines, below stops/labels
        appendTransferCapsulesSvg({
            parts,
            map,
            z,
            capsuleLines: capsules?.lines,
            capsuleCentroids: capsules?.centroids
        });

        // stops
        parts.push(`<g id="trip-preview-stops">`);
        for (const f of stopFeatures) {
            const geom = f?.geometry;
            if (!geom || geom.type !== 'Point') continue;
            const c = geom.coordinates;
            if (!Array.isArray(c) || c.length < 2) continue;

            const servingCount = Number(f?.properties?.serving_count ?? 1);
            const r = radiusForStop(z, servingCount);
            const sw = stopStrokeWidth(z, servingCount);
            const fill = resolveStationFillColor({ props: f?.properties || {}, styleContext: stationStyleContext });

            const p = project(map, { lng: Number(c[0]), lat: Number(c[1]) });
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

            parts.push(
                `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${escapeXml(fill)}" stroke="${stopStroke()}" stroke-width="${sw.toFixed(2)}"/>`
            );
        }
        parts.push(`</g>`);

        // labels
        {
            const mode = getCurrentStationLabelMode();
            if (mode !== 'off') {
                const fontPx = 12;
                const font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

                const candidates = [];
                for (const f of stopFeatures) {
                    const sid = String(f?.properties?.id || '').trim();
                    if (!sid) continue;
                    const geom = f?.geometry;
                    if (!geom || geom.type !== 'Point') continue;
                    const c = geom.coordinates;
                    if (!Array.isArray(c) || c.length < 2) continue;

                    const name = stationNameById.get(sid) || sid;
                    if (!name) continue;
                    const servingCount = Number(f?.properties?.serving_count ?? 1);
                    const r = radiusForStop(z, servingCount);
                    const textW = measureTextWidthPx(name, font);

                    candidates.push({
                        id: sid,
                        text: name,
                        priority: servingCount,
                        coordinates: [Number(c[0]), Number(c[1])],
                        fontPx,
                        font,
                        widthPx: textW + 8,
                        heightPx: Math.ceil(fontPx * 1.2 + 2),
                        labelDyPx: r + 6
                    });
                }

                const visible = mode === 'auto'
                    ? pickVisibleLabelIdsByCollision({ map, candidates, gridCellPx: 80 })
                    : new Set(candidates.map((c) => c.id));
                appendStationLabelBoxesSvg({
                    parts,
                    groupId: 'trip-preview-labels',
                    map,
                    candidates,
                    visibleIds: visible
                });
            }
        }

        parts.push(`</g>`);
        parts.push(`</svg>`);
        return parts.join('\n');
    };

    const getGeoJsonSourceData = async (map, sourceId) => {
        try {
            const src = map?.getSource?.(sourceId);
            if (!src) return null;
            let data = src._data || src._options?.data || null;
            if (!data && typeof src.serialize === 'function') {
                const spec = src.serialize();
                if (spec && typeof spec === 'object') data = spec.data || null;
            }
            if (!data) return null;
            if (typeof data === 'string') {
                const resp = await cachedFetchSafe(data);
                if (!resp || !resp.ok) return null;
                return await resp.json();
            }
            return data;
        } catch {
            return null;
        }
    };

    const featureBboxIntersects = (coords, bbox) => {
        if (!Array.isArray(coords) || coords.length < 2 || !bbox) return false;
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const eat = (c) => {
            if (!Array.isArray(c) || c.length < 2) return;
            const lng = Number(c[0]);
            const lat = Number(c[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            if (lng < minLng) minLng = lng;
            if (lat < minLat) minLat = lat;
            if (lng > maxLng) maxLng = lng;
            if (lat > maxLat) maxLat = lat;
        };

        for (const c of coords) eat(c);

        if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) return false;
        return !(maxLng < bbox.minLng || minLng > bbox.maxLng || maxLat < bbox.minLat || minLat > bbox.maxLat);
    };

    const pickLowlightLinesInBbox = async ({ baseMap, bbox, excludeLineIds }) => {
        const fc = await getGeoJsonSourceData(baseMap, 'lines-source');
        const features = Array.isArray(fc?.features) ? fc.features : [];
        if (!features.length) return [];

        const ex = excludeLineIds instanceof Set ? excludeLineIds : new Set();
        const out = [];

        for (const f of features) {
            const props = f?.properties || {};
            if (Number(props.hidden_by_opacity_zero) === 1) continue;
            const id = String(props.id || '').trim();
            if (id && ex.has(id)) continue;

            const g = f?.geometry;
            if (!g) continue;
            if (g.type === 'LineString') {
                if (featureBboxIntersects(g.coordinates, bbox)) out.push(f);
            } else if (g.type === 'MultiLineString' && Array.isArray(g.coordinates)) {
                // Map data is LineString, but keep generic
                let hit = false;
                for (const line of g.coordinates) {
                    if (featureBboxIntersects(line, bbox)) {
                        hit = true;
                        break;
                    }
                }
                if (hit) out.push(f);
            }
        }

        return out;
    };

    const calcBboxFromBuilt = (built) => {
        const lineFc = built?.lineFc;
        const stopFc = built?.stopFc;
        const lineFeatures = Array.isArray(lineFc?.features) ? lineFc.features : [];
        const stopFeatures = Array.isArray(stopFc?.features) ? stopFc.features : [];

        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const eat = (lng, lat) => {
            const x = Number(lng);
            const y = Number(lat);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (x < minLng) minLng = x;
            if (y < minLat) minLat = y;
            if (x > maxLng) maxLng = x;
            if (y > maxLat) maxLat = y;
        };

        const eatCoords = (coords) => {
            if (!Array.isArray(coords)) return;
            if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                eat(coords[0], coords[1]);
                return;
            }
            for (const c of coords) eatCoords(c);
        };

        for (const f of lineFeatures) {
            const g = f?.geometry;
            if (!g) continue;
            if (g.type === 'LineString' || g.type === 'MultiLineString') eatCoords(g.coordinates);
        }

        for (const f of stopFeatures) {
            const g = f?.geometry;
            if (!g || g.type !== 'Point') continue;
            eatCoords(g.coordinates);
        }

        if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) return null;
        return { minLng, minLat, maxLng, maxLat };
    };

    const normalizeBbox = (bbox) => {
        if (!bbox) return null;
        const minLng = Number(bbox.minLng);
        const minLat = Number(bbox.minLat);
        const maxLng = Number(bbox.maxLng);
        const maxLat = Number(bbox.maxLat);
        if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
        const eps = 1e-6;
        const a0 = Math.min(minLng, maxLng);
        const a1 = Math.max(minLng, maxLng);
        const b0 = Math.min(minLat, maxLat);
        const b1 = Math.max(minLat, maxLat);
        return {
            minLng: a0,
            minLat: b0,
            maxLng: (a1 - a0) < eps ? (a1 + eps) : a1,
            maxLat: (b1 - b0) < eps ? (b1 + eps) : b1,
        };
    };

    const approxBboxAspect = (bbox) => {
        const b = normalizeBbox(bbox);
        if (!b) return 1;
        const dLng = Math.abs(b.maxLng - b.minLng);
        const dLat = Math.abs(b.maxLat - b.minLat);
        const meanLatRad = (((b.minLat + b.maxLat) / 2) * Math.PI) / 180;
        const w = dLng * Math.max(0.01, Math.cos(meanLatRad));
        const h = Math.max(1e-9, dLat);
        return w / h;
    };

    const chooseAspectRatio = (w, h) => {
        const ww = Math.max(1, Number(w));
        const hh = Math.max(1, Number(h));
        const a = ww / hh;
        const r1 = 16 / 9;
        const r2 = 9 / 16;
        // 选择更接近 bbox 比例的一个（用 log 距离避免对称性问题）
        const d1 = Math.abs(Math.log(a / r1));
        const d2 = Math.abs(Math.log(a / r2));
        return d1 <= d2 ? r1 : r2;
    };

    const clampCanvasSize = ({ w, h }) => {
        // 常见浏览器单边上限约 16384；这里留一点余量
        const MAX_SIDE = 16384;
        const ww = Math.max(1, Math.min(MAX_SIDE, Math.round(Number(w) || 1)));
        const hh = Math.max(1, Math.min(MAX_SIDE, Math.round(Number(h) || 1)));
        return { w: ww, h: hh };
    };

    const projectLngLat = (map, lng, lat) => {
        const p = map.project({ lng: Number(lng), lat: Number(lat) });
        return { x: Number(p.x), y: Number(p.y) };
    };

    const calcPixelBboxForGeoBbox = (map, geoBbox) => {
        const b = normalizeBbox(geoBbox);
        if (!b) return null;
        const pts = [
            projectLngLat(map, b.minLng, b.minLat),
            projectLngLat(map, b.minLng, b.maxLat),
            projectLngLat(map, b.maxLng, b.minLat),
            projectLngLat(map, b.maxLng, b.maxLat),
        ].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (pts.length < 2) return null;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
        return { minX, minY, maxX, maxY };
    };

    const pickCenterForBbox = (map, geoBbox, paddingPx, bearing, pitch) => {
        const b = normalizeBbox(geoBbox);
        if (!b) return null;
        const fallback = {
            lng: (b.minLng + b.maxLng) / 2,
            lat: (b.minLat + b.maxLat) / 2,
        };
        try {
            if (typeof map.cameraForBounds === 'function') {
                const cam = map.cameraForBounds(
                    [[b.minLng, b.minLat], [b.maxLng, b.maxLat]],
                    { padding: Math.max(0, Number(paddingPx) || 0), bearing: Number(bearing) || 0, pitch: Number(pitch) || 0 }
                );
                if (cam?.center && Number.isFinite(cam.center.lng) && Number.isFinite(cam.center.lat)) return cam.center;
            }
        } catch {
            // ignore
        }
        return fallback;
    };

    const computeExportSizeAtFixedZoom = ({ map, container, geoBbox, baseW, baseH, paddingPx, zoom, bearing, pitch }) => {
        let w = Math.max(1, Math.round(Number(baseW) || 1));
        let h = Math.max(1, Math.round(Number(baseH) || 1));
        const pad = Math.max(0, Math.round(Number(paddingPx) || 0));

        const applySize = (ww, hh) => {
            if (!container) return;
            container.style.width = `${ww}px`;
            container.style.height = `${hh}px`;
            map.resize?.();
        };

        // 等比放大画布，直到 bbox 在当前 zoom 下能放下
        for (let i = 0; i < 8; i += 1) {
            ({ w, h } = clampCanvasSize({ w, h }));

            applySize(w, h);

            const center = pickCenterForBbox(map, geoBbox, pad, bearing, pitch);
            map.jumpTo?.({ center, zoom: Number(zoom) || 0, bearing: Number(bearing) || 0, pitch: Number(pitch) || 0 });

            const px = calcPixelBboxForGeoBbox(map, geoBbox);
            if (!px) break;

            const needW = (px.maxX - px.minX) + pad * 2;
            const needH = (px.maxY - px.minY) + pad * 2;

            if (needW <= w && needH <= h) return { w, h, center };

            const scale = Math.max(needW / Math.max(1, w), needH / Math.max(1, h)) * 1.02;
            w = Math.ceil(w * scale);
            h = Math.ceil(h * scale);

            // 如果已经到上限，别死循环
            const atLimit = w >= 16384 || h >= 16384;
            if (atLimit) break;
        }

        const center = pickCenterForBbox(map, geoBbox, pad, bearing, pitch);
        ({ w, h } = clampCanvasSize({ w, h }));
        applySize(w, h);
        return { w, h, center };
    };

    const waitForEventOnce = (target, eventName, timeoutMs) => new Promise((resolve) => {
        let done = false;
        const onDone = () => {
            if (done) return;
            done = true;
            try { target.off?.(eventName, onDone); } catch {}
            try { target.removeEventListener?.(eventName, onDone); } catch {}
            resolve();
        };

        try {
            if (typeof target.once === 'function') {
                target.once(eventName, onDone);
            } else if (typeof target.on === 'function') {
                target.on(eventName, onDone);
            } else if (typeof target.addEventListener === 'function') {
                target.addEventListener(eventName, onDone, { once: true });
            }
        } catch {
            // ignore
        }

        setTimeout(onDone, Math.max(0, Number(timeoutMs) || 0));
    });

    const canvasToPngBlob = (canvas) => new Promise((resolve, reject) => {
        try {
            canvas.toBlob((b) => {
                if (b) resolve(b);
                else reject(new Error('toBlob returned null'));
            }, 'image/png');
        } catch (e) {
            reject(e);
        }
    });

    const loadImage = (url) => new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
    });

    const compositePngAndSvgToPngBlob = async ({ backgroundPngBlob, overlaySvgText, width, height }) => {
        const bgUrl = URL.createObjectURL(backgroundPngBlob);
        const svgUrl = URL.createObjectURL(new Blob([overlaySvgText], { type: 'image/svg+xml;charset=utf-8' }));

        try {
            const [bgImg, svgImg] = await Promise.all([loadImage(bgUrl), loadImage(svgUrl)]);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Number(width) || 1);
            canvas.height = Math.max(1, Number(height) || 1);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('2d context not available');
            ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
            ctx.drawImage(svgImg, 0, 0, canvas.width, canvas.height);
            return await canvasToPngBlob(canvas);
        } finally {
            try { URL.revokeObjectURL(bgUrl); } catch {}
            try { URL.revokeObjectURL(svgUrl); } catch {}
        }
    };

    const ensureStyleMatchesTheme = async (map) => {
        const style = buildRasterStyle(isDarkTheme());
        if (typeof map.setStyle !== 'function') return;
        map.setStyle(style);
        await waitForEventOnce(map, 'load', 5000);
    };

    const readExportPrefs = () => {
        try {
            const raw = window.localStorage.getItem(EXPORT_UI_STORAGE_KEY);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return null;
            const format = obj.format === 'png' ? 'png' : 'svg+png';
            const res = obj.resolution === '1080p' ? '1080p' : '4k';
            const zoomMode = obj.zoomMode === 'auto' ? 'auto' : 'current';
            return { format, resolution: res, zoomMode };
        } catch {
            return null;
        }
    };

    const writeExportPrefs = (prefs) => {
        try {
            window.localStorage.setItem(EXPORT_UI_STORAGE_KEY, JSON.stringify(prefs));
        } catch {
            // ignore
        }
    };

    // ---- receive trip preview updates from app.js; cache the latest snapshot ----
    let exporting = false;

    /** @type {{ payload: any, built: any } | null} */
    let lastSnapshot = null;
    let lastSnapshotAt = 0;

    /** @type {{ kind: string, lineIds: Set<string>, label: string } | null} */
    let lastBaseHighlight = null;
    let lastBaseHighlightAt = 0;

    const normalizeFeatureCollection = (fc) => ({
        type: 'FeatureCollection',
        features: Array.isArray(fc?.features) ? fc.features : []
    });

    const buildLineIdSetFromLineFeatures = (lineFeatures) => {
        const out = new Set();
        const fs = Array.isArray(lineFeatures) ? lineFeatures : [];
        for (const f of fs) {
            const props = f?.properties || {};
            const lineId = String(props?.lineId || props?.id || f?.id || '').trim();
            if (lineId) out.add(lineId);
        }
        return out;
    };

    const normalizeBuiltSnapshot = (built) => {
        const lineFc = normalizeFeatureCollection(built?.lineFc);
        const stopFc = normalizeFeatureCollection(built?.stopFc);
        const lineFeatures = lineFc.features;
        const stopFeatures = stopFc.features;

        if (!lineFeatures.length && !stopFeatures.length) return null;

        const lineIds = built?.lineIds instanceof Set
            ? new Set(Array.from(built.lineIds).map((x) => String(x || '').trim()).filter(Boolean))
            : buildLineIdSetFromLineFeatures(lineFeatures);

        const stopIds = built?.stopIds instanceof Set
            ? new Set(Array.from(built.stopIds).map((x) => String(x || '').trim()).filter(Boolean))
            : new Set(
                stopFeatures
                    .map((f) => String(f?.properties?.id || f?.id || '').trim())
                    .filter(Boolean)
            );

        return {
            ...(built && typeof built === 'object' ? built : {}),
            lineFc,
            stopFc,
            lineIds,
            stopIds
        };
    };

    const normalizePayloadSnapshot = (payload, built) => {
        const p = payload && typeof payload === 'object' ? payload : {};
        const lineIdsFromBuilt = built?.lineIds instanceof Set ? Array.from(built.lineIds) : [];
        const selectedLineId = String(
            p?.selectedLineId
            || p?.mainLineId
            || lineIdsFromBuilt[0]
            || ''
        ).trim();

        let tripKey = String(p?.tripKey || '').trim();
        if (!tripKey) {
            const source = String(p?.previewSource || p?.__previewSource || '').trim();
            if (source) tripKey = `source:${source}`;
        }
        if (!tripKey) {
            tripKey = `snapshot:${Date.now()}`;
        }

        return {
            ...p,
            selectedLineId,
            selectedLineName: String(p?.selectedLineName || p?.lineName || p?.mainLineName || selectedLineId || '').trim(),
            tripKey
        };
    };

    const normalizeTripSnapshot = (snapshot) => {
        const built = normalizeBuiltSnapshot(snapshot?.built);
        if (!built) return null;
        const payload = normalizePayloadSnapshot(snapshot?.payload, built);
        return { payload, built };
    };

    const ensureBuiltHasRenderableFeatures = async (baseMap, built) => {
        const normalizedBuilt = normalizeBuiltSnapshot(built);
        const hasLine = Array.isArray(normalizedBuilt?.lineFc?.features) && normalizedBuilt.lineFc.features.length > 0;
        const hasStop = Array.isArray(normalizedBuilt?.stopFc?.features) && normalizedBuilt.stopFc.features.length > 0;
        if (hasLine || hasStop) return normalizedBuilt;

        const lineFcFromSource = await getGeoJsonSourceData(baseMap, 'trip-preview-source');
        const stopFcFromSource = await getGeoJsonSourceData(baseMap, 'trip-preview-stops-source');
        const hydrated = normalizeBuiltSnapshot({
            ...(normalizedBuilt && typeof normalizedBuilt === 'object' ? normalizedBuilt : {}),
            lineFc: lineFcFromSource,
            stopFc: stopFcFromSource
        });
        return hydrated;
    };

    const exportSnapshot = async (snapshot, options, extra = {}) => {
        if (exporting) return;
        const baseMap = window.__TokyoRailMap;
        if (!baseMap) return;

        const normalized = normalizeTripSnapshot(snapshot);
        const payload = normalized?.payload;
        const built = await ensureBuiltHasRenderableFeatures(baseMap, normalized?.built);
        if (!payload || !built) return;

        const lineId = String(payload?.selectedLineId || '').trim();
        const tripKey = String(payload?.tripKey || '').trim();

        const geoBboxRaw = calcBboxFromBuilt(built);
        let geoBbox = normalizeBbox(geoBboxRaw);
        if (!geoBbox) return;

        const baseHighlightLineIds = extra?.baseHighlight?.lineIds instanceof Set
            ? extra.baseHighlight.lineIds
            : null;

        const format = options?.format === 'png' ? 'png' : 'svg+png';
        const zoomMode = options?.zoomMode === 'auto' ? 'auto' : 'current';
        exporting = true;
        try {
            let baseHighlightLineFeatures = [];
            if (baseHighlightLineIds && baseHighlightLineIds.size) {
                try {
                    baseHighlightLineFeatures = await pickLineFeaturesByIds({ baseMap, lineIds: baseHighlightLineIds });
                    const baseBbox = normalizeBbox(calcBboxFromLineFeatures(baseHighlightLineFeatures));
                    if (baseBbox) {
                        geoBbox = {
                            minLng: Math.min(geoBbox.minLng, baseBbox.minLng),
                            minLat: Math.min(geoBbox.minLat, baseBbox.minLat),
                            maxLng: Math.max(geoBbox.maxLng, baseBbox.maxLng),
                            maxLat: Math.max(geoBbox.maxLat, baseBbox.maxLat),
                        };
                    }
                } catch {
                    baseHighlightLineFeatures = [];
                }
            }

            const baseZoom = (typeof baseMap.getZoom === 'function') ? baseMap.getZoom() : 11;
            const baseBearing = (typeof baseMap.getBearing === 'function') ? baseMap.getBearing() : 0;
            const basePitch = (typeof baseMap.getPitch === 'function') ? baseMap.getPitch() : 0;
            const { map: vmap, container: vcontainer } = await ensureVirtualMap();

            const baseName = [
                'trip',
                sanitizeFilePart(lineId || 'unknown'),
                sanitizeFilePart(tripKey || 'unknown'),
                nowIsoCompact()
            ].join('_');
            const pngName = `${baseName}.png`;
            const svgName = `${baseName}.svg`;
            const zipName = `${baseName}.zip`;

            // 选择导出方向（16:9 或 9:16）
            const a = approxBboxAspect(geoBbox);
            const targetRatio = chooseAspectRatio(a, 1);
            const isLandscape = targetRatio >= 1;

            const tryExportPng = async ({ baseW, baseH, paddingPx }) => {
                await ensureStyleMatchesTheme(vmap);

                if (zoomMode === 'auto') {
                    // 自动：使用 fitBounds 自适应缩放，输出尺寸严格等于 baseW/baseH
                    const w = Math.max(1, Math.round(Number(baseW) || 1));
                    const h = Math.max(1, Math.round(Number(baseH) || 1));
                    vcontainer.style.width = `${w}px`;
                    vcontainer.style.height = `${h}px`;
                    vmap.resize?.();

                    // 先同步角度，再 fitBounds（fitBounds 会调 zoom）
                    vmap.jumpTo?.({
                        center: [(geoBbox.minLng + geoBbox.maxLng) / 2, (geoBbox.minLat + geoBbox.maxLat) / 2],
                        zoom: Number(baseZoom) || 11,
                        bearing: Number(baseBearing) || 0,
                        pitch: Number(basePitch) || 0,
                    });

                    vmap.fitBounds?.(
                        [[geoBbox.minLng, geoBbox.minLat], [geoBbox.maxLng, geoBbox.maxLat]],
                        { padding: Math.max(0, Number(paddingPx) || 0), duration: 0 }
                    );
                } else {
                    // 当前：保持与当前视图一致的 zoom，不用 fitBounds（fitBounds 会自动改 zoom）
                    const size = computeExportSizeAtFixedZoom({
                        map: vmap,
                        container: vcontainer,
                        geoBbox,
                        baseW,
                        baseH,
                        paddingPx,
                        zoom: baseZoom,
                        bearing: baseBearing,
                        pitch: basePitch,
                    });

                    vmap.jumpTo?.({
                        center: size.center,
                        zoom: Number(baseZoom) || 11,
                        bearing: Number(baseBearing) || 0,
                        pitch: Number(basePitch) || 0,
                    });
                }

                await waitForEventOnce(vmap, 'moveend', 2000);
                await waitForEventOnce(vmap, 'idle', 8000);

                const canvas = vmap.getCanvas?.();
                if (!canvas) throw new Error('canvas not available');
                if (zoomMode === 'auto') {
                    return { blob: await canvasToPngBlob(canvas), w: Math.round(Number(baseW) || 1), h: Math.round(Number(baseH) || 1) };
                }
                // zoomMode === 'current': 使用实际画布尺寸
                return { blob: await canvasToPngBlob(canvas), w: canvas.width, h: canvas.height };
            };

            const resolution = String(options?.resolution || '4k');

            // 4K：优先 4K，失败回退 1080P；1080P：直接 1080P（不尝试 4K）
            let pngBlob = null;
            let outW = isLandscape ? 3840 : 2160;
            let outH = isLandscape ? 2160 : 3840;
            if (resolution === '1080p') {
                const r = await tryExportPng({
                    baseW: isLandscape ? 1920 : 1080,
                    baseH: isLandscape ? 1080 : 1920,
                    paddingPx: 60,
                });
                pngBlob = r.blob;
                outW = r.w;
                outH = r.h;
            } else {
                try {
                    const r = await tryExportPng({
                        baseW: isLandscape ? 3840 : 2160,
                        baseH: isLandscape ? 2160 : 3840,
                        paddingPx: 120,
                    });
                    pngBlob = r.blob;
                    outW = r.w;
                    outH = r.h;
                } catch {
                    const r = await tryExportPng({
                        baseW: isLandscape ? 1920 : 1080,
                        baseH: isLandscape ? 1080 : 1920,
                        paddingPx: 60,
                    });
                    pngBlob = r.blob;
                    outW = r.w;
                    outH = r.h;
                }
            }

            // 低亮基础线路：取自主地图 lines-source，按“最终导出视野”过滤
            let builtForSvg = built;
            let capsules = null;
            try {
                const bounds = vmap.getBounds?.();
                const baseMap = window.__TokyoRailMap;
                if (bounds && baseMap) {
                    const viewBbox = {
                        minLng: bounds.getWest(),
                        minLat: bounds.getSouth(),
                        maxLng: bounds.getEast(),
                        maxLat: bounds.getNorth(),
                    };

                    const lowlightLines = await pickLowlightLinesInBbox({
                        baseMap,
                        bbox: viewBbox,
                        excludeLineIds: built?.lineIds,
                    });

                    let mergedLineFeatures = Array.isArray(built?.lineFc?.features) ? built.lineFc.features.slice() : [];
                    let mergedStopFeatures = Array.isArray(built?.stopFc?.features) ? built.stopFc.features.slice() : [];
                    const mergedLineIds = built?.lineIds instanceof Set ? new Set(built.lineIds) : new Set();

                    if (baseHighlightLineIds && baseHighlightLineIds.size) {
                        const extraBaseLines = baseHighlightLineFeatures.length
                            ? baseHighlightLineFeatures
                            : await pickLineFeaturesByIds({ baseMap, lineIds: baseHighlightLineIds });

                        const baseLineOut = [];
                        for (const f of extraBaseLines) {
                            const props = f?.properties || {};
                            const id = String(props.id || '').trim();
                            const color = resolveLineColorForTheme(props, '#0a84ff');
                            if (!id) continue;
                            baseLineOut.push({
                                type: 'Feature',
                                properties: {
                                    role: 'base-highlight',
                                    lineId: id,
                                    color
                                },
                                geometry: f?.geometry || null
                            });
                            mergedLineIds.add(id);
                        }

                        if (baseLineOut.length) {
                            mergedLineFeatures = mergedLineFeatures.concat(baseLineOut);
                        }

                        try {
                            const baseStations = await pickStationsInBboxForLineIds({
                                baseMap,
                                bbox: viewBbox,
                                lineIds: baseHighlightLineIds
                            });
                            if (Array.isArray(baseStations) && baseStations.length) {
                                const seenStopIds = new Set(
                                    mergedStopFeatures
                                        .map((sf) => String(sf?.properties?.id || '').trim())
                                        .filter(Boolean)
                                );
                                for (const sf of baseStations) {
                                    const props = sf?.properties || {};
                                    const sid = String(props.id || '').trim();
                                    const g = sf?.geometry;
                                    const c = g?.coordinates;
                                    if (!sid || !g || g.type !== 'Point' || !Array.isArray(c) || c.length < 2) continue;
                                    if (seenStopIds.has(sid)) continue;
                                    seenStopIds.add(sid);
                                    mergedStopFeatures.push({
                                        type: 'Feature',
                                        properties: {
                                            id: sid,
                                            serving_count: Number(stationServingCount(props) || 1)
                                        },
                                        geometry: {
                                            type: 'Point',
                                            coordinates: [Number(c[0]), Number(c[1])]
                                        }
                                    });
                                }
                            }
                        } catch {
                            // ignore
                        }
                    }

                    if (EXPORT_NO_OFFSET_OVERLAY) {
                        mergedStopFeatures = await remapStopFeatureCoordsToRawStations(mergedStopFeatures);
                    }

                    const visibleStationIdsForCapsules = new Set(
                        mergedStopFeatures
                            .map((f) => String(f?.properties?.id || f?.id || '').trim())
                            .filter(Boolean)
                    );

                    capsules = await pickCapsulesInBbox(baseMap, viewBbox, {
                        noOffset: EXPORT_NO_OFFSET_OVERLAY,
                        visibleStationIds: visibleStationIdsForCapsules
                    });

                    builtForSvg = Object.assign({}, built, {
                        lineFc: { type: 'FeatureCollection', features: mergedLineFeatures },
                        stopFc: { type: 'FeatureCollection', features: mergedStopFeatures },
                        lineIds: mergedLineIds,
                        _exportLowlightLines: lowlightLines
                    });
                }
            } catch {
                // ignore
            }

            if (format === 'png') {
                // 纯 PNG：将（透明背景的）SVG 叠加层光栅化并与底图 PNG 合成
                try {
                    const overlaySvgText = await buildSvgFromBuilt({
                        map: vmap,
                        payload,
                        built: builtForSvg,
                        backgroundImageHref: null,
                        transparentBackground: true,
                        capsules
                    });
                    const merged = await compositePngAndSvgToPngBlob({
                        backgroundPngBlob: pngBlob,
                        overlaySvgText,
                        width: outW,
                        height: outH,
                    });
                    downloadBlob({ blob: merged, filename: pngName });
                } catch {
                    // 部分浏览器可能限制 SVG -> Canvas；兜底至少提供底图 PNG
                    downloadBlob({ blob: pngBlob, filename: pngName });
                }
                return;
            }

            const svgText = await buildSvgFromBuilt({ map: vmap, payload, built: builtForSvg, backgroundImageHref: pngName,capsules });

            const JSZipCtor = window.JSZip;
            if (!JSZipCtor) {
                // 无 JSZip：退化为分别下载
                downloadBlob({ blob: pngBlob, filename: pngName });
                downloadBlob({ blob: new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), filename: svgName });
                return;
            }

            const zip = new JSZipCtor();
            zip.file(pngName, pngBlob);
            zip.file(svgName, svgText);
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
            downloadBlob({ blob: zipBlob, filename: zipName });
        } catch {
            // ignore
        } finally {
            exporting = false;
        }
    };

    window.addEventListener(EXPORT_EVENT, (evt) => {
        const normalized = normalizeTripSnapshot({
            payload: evt?.detail?.payload,
            built: evt?.detail?.built
        });
        if (!normalized) return;
        lastSnapshot = normalized;
        lastSnapshotAt = Date.now();
    });

    window.addEventListener(CLEAR_EVENT, () => {
        lastSnapshot = null;
        lastSnapshotAt = 0;
    });

    window.addEventListener(BASE_HL_EVENT, (evt) => {
        const kind = String(evt?.detail?.kind || '').trim() || 'unknown';
        const lineIdsRaw = evt?.detail?.lineIds;
        const ids = Array.isArray(lineIdsRaw) ? lineIdsRaw.map(String).filter(Boolean) : [];
        if (!ids.length) return;
        const selectedLineId = evt?.detail?.selectedLineId ? String(evt.detail.selectedLineId) : '';
        const selectedCompany = evt?.detail?.selectedCompany ? String(evt.detail.selectedCompany) : '';
        const label = selectedLineId || selectedCompany || kind;
        lastBaseHighlight = { kind, lineIds: new Set(ids), label };
        lastBaseHighlightAt = Date.now();
    });

    window.addEventListener(BASE_HL_CLEAR_EVENT, () => {
        lastBaseHighlight = null;
        lastBaseHighlightAt = 0;
    });

    const isTripPreviewActiveNow = () => {
        try {
            const map = window.__TokyoRailMap;
            if (!map) return false;

            const fromSourceData = (() => {
                const src = map.getSource?.('trip-preview-source');
                const data = src?._data || src?._options?.data || null;
                const features = Array.isArray(data?.features) ? data.features : [];
                return features.length > 0;
            })();
            if (fromSourceData) return true;

            const fromQuery = (() => {
                try {
                    const fs = map.querySourceFeatures?.('trip-preview-source');
                    return Array.isArray(fs) && fs.length > 0;
                } catch {
                    return false;
                }
            })();
            if (fromQuery) return true;

            const fromSnapshot = (() => {
                if (!lastSnapshot || !lastSnapshotAt) return false;
                if (Date.now() - lastSnapshotAt > 15000) return false;
                const lineFeatures = Array.isArray(lastSnapshot?.built?.lineFc?.features)
                    ? lastSnapshot.built.lineFc.features
                    : [];
                return lineFeatures.length > 0;
            })();
            if (fromSnapshot) return true;

            const src = map.getSource?.('trip-preview-source');
            return !!src;
        } catch {
            return false;
        }
    };

    const isMultiSelectModeEnabledNow = () => {
        try {
            return window.__TokyoRailMultiSelectEnabled === true;
        } catch {
            return false;
        }
    };

    const calcBboxFromLineFeatures = (features) => {
        const fs = Array.isArray(features) ? features : [];
        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        const eat = (lng, lat) => {
            const x = Number(lng);
            const y = Number(lat);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (x < minLng) minLng = x;
            if (y < minLat) minLat = y;
            if (x > maxLng) maxLng = x;
            if (y > maxLat) maxLat = y;
        };

        const eatCoords = (coords) => {
            if (!Array.isArray(coords)) return;
            if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                eat(coords[0], coords[1]);
                return;
            }
            for (const c of coords) eatCoords(c);
        };

        for (const f of fs) {
            const g = f?.geometry;
            if (!g) continue;
            if (g.type === 'LineString' || g.type === 'MultiLineString') eatCoords(g.coordinates);
        }

        if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) return null;
        return { minLng, minLat, maxLng, maxLat };
    };

    const pickLineFeaturesByIds = async ({ baseMap, lineIds }) => {
        const fc = await getGeoJsonSourceData(baseMap, 'lines-source');
        const features = Array.isArray(fc?.features) ? fc.features : [];
        if (!features.length) return [];
        const ids = lineIds instanceof Set ? lineIds : new Set();
        const out = [];
        for (const f of features) {
            const props = f?.properties || {};
            if (Number(props.hidden_by_opacity_zero) === 1) continue;
            const id = String(props.id || '').trim();
            if (!id || !ids.has(id)) continue;
            out.push(f);
        }
        return out;
    };

    const pointInBbox = (lng, lat, bbox) => {
        const x = Number(lng);
        const y = Number(lat);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !bbox) return false;
        return x >= bbox.minLng && x <= bbox.maxLng && y >= bbox.minLat && y <= bbox.maxLat;
    };

    const stationServesAnyLineId = (props, lineIds) => {
        const ids = lineIds instanceof Set ? lineIds : new Set();
        if (!ids.size) return false;

        // 优先使用 platform_line_id（站点“所属线路 id”），避免换乘站的“其他线路站点”被 serving_ids 误判为命中。
        const platform = props?.platform_line_id;
        if (platform != null) {
            if (Array.isArray(platform)) {
                for (const v of platform) {
                    const s = String(v ?? '').trim();
                    if (s && ids.has(s)) return true;
                }
                return false;
            }
            const s = String(platform ?? '').trim();
            return s ? ids.has(s) : false;
        }

        const serving = props?.serving_ids;
        if (Array.isArray(serving)) {
            for (const v of serving) {
                const s = String(v ?? '').trim();
                if (s && ids.has(s)) return true;
            }
            return false;
        }
        // 兜底：少数数据可能是单个字符串
        const s = String(serving ?? '').trim();
        return s ? ids.has(s) : false;
    };

    const stationServingCount = (props) => {
        const serving = props?.serving_ids;
        if (Array.isArray(serving)) return Math.max(1, serving.length);
        const s = String(serving ?? '').trim();
        return s ? 1 : 1;
    };

    const pickStationsInBboxForLineIds = async ({ baseMap, bbox, lineIds }) => {
        const fc = await getGeoJsonSourceData(baseMap, 'stations-source');
        const features = Array.isArray(fc?.features) ? fc.features : [];
        if (!features.length) return [];

        const ids = lineIds instanceof Set ? lineIds : new Set();
        const out = [];
        for (const f of features) {
            const props = f?.properties || {};
            if (Number(props.hidden_by_opacity_zero) === 1) continue;
            const g = f?.geometry;
            if (!g || g.type !== 'Point') continue;
            const c = g.coordinates;
            if (!Array.isArray(c) || c.length < 2) continue;
            const lng = Number(c[0]);
            const lat = Number(c[1]);
            if (!pointInBbox(lng, lat, bbox)) continue;
            if (!stationServesAnyLineId(props, ids)) continue;
            out.push(f);
        }

        // 去重：换乘站往往会有多个“站点要素”（不同铁路/站台），但名称相同且位置很近。
        // 导出时只保留同名且近距离的一份，避免“换乘站的其他站点”被一起导出。
        const CELL_M = 160; // 约一个站区范围
        const seen = new Set();
        const deduped = [];
        for (const f of out) {
            const props = f?.properties || {};
            const g = f?.geometry;
            const c = g?.coordinates;
            if (!Array.isArray(c) || c.length < 2) continue;
            const lng = Number(c[0]);
            const lat = Number(c[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

            const nameKey = String(props.name || props.name_zh || props.name_ja || props.id || '').trim() || 'station';

            // 简易米制投影（足够用于 100~200m 的格网去重）
            const rad = (lat * Math.PI) / 180;
            const x = lng * 111320 * Math.cos(rad);
            const y = lat * 110540;
            const cx = Math.floor(x / CELL_M);
            const cy = Math.floor(y / CELL_M);

            const key = `${nameKey}|${cx}|${cy}`;
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(f);
        }

        return deduped;
    };

    const normalizeGroupChunksForExport = (group) => {
        if (!Array.isArray(group)) return [];
        const out = [];
        const seen = new Set();
        for (const chunk of group) {
            if (!Array.isArray(chunk)) continue;
            for (const sid of chunk) {
                const id = String(sid || '').trim();
                if (!id || seen.has(id)) continue;
                seen.add(id);
                out.push(id);
            }
        }
        return out;
    };

    const euclideanDistanceSqLngLat = (a, b) => {
        const dx = Number(a?.[0]) - Number(b?.[0]);
        const dy = Number(a?.[1]) - Number(b?.[1]);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Number.POSITIVE_INFINITY;
        return dx * dx + dy * dy;
    };

    const buildMstEdgesForExport = (points) => {
        const n = Array.isArray(points) ? points.length : 0;
        if (n <= 1) return [];
        const visited = new Set([0]);
        const edges = [];

        while (visited.size < n) {
            let bestFrom = -1;
            let bestTo = -1;
            let bestDist = Number.POSITIVE_INFINITY;
            for (const i of visited) {
                const from = points[i]?.coordinates;
                if (!Array.isArray(from) || from.length < 2) continue;
                for (let j = 0; j < n; j += 1) {
                    if (visited.has(j)) continue;
                    const to = points[j]?.coordinates;
                    if (!Array.isArray(to) || to.length < 2) continue;
                    const d = euclideanDistanceSqLngLat(from, to);
                    if (d < bestDist) {
                        bestDist = d;
                        bestFrom = i;
                        bestTo = j;
                    }
                }
            }
            if (bestFrom < 0 || bestTo < 0) break;
            visited.add(bestTo);
            edges.push([bestFrom, bestTo]);
        }

        return edges;
    };

    const buildNoOffsetCapsulesGeoJSON = async (visibleStationIds) => {
        const stationsById = await getRawStationsCoordById();
        const groups = await getCachedJsonSafe('./data/station-groups.json');
        if (!(stationsById instanceof Map) || !stationsById.size || !Array.isArray(groups)) {
            return { lines: [], centroids: [] };
        }

        const lineFeatures = [];
        const centroidFeatures = [];

        for (const rawGroup of groups) {
            const ids = normalizeGroupChunksForExport(rawGroup);
            if (ids.length < 2) continue;

            const pickedIds = visibleStationIds instanceof Set
                ? ids.filter((id) => visibleStationIds.has(id))
                : ids;
            if (!pickedIds.length) continue;

            const points = pickedIds
                .map((id) => {
                    const c = stationsById.get(id);
                    if (!Array.isArray(c) || c.length < 2) return null;
                    const lng = Number(c[0]);
                    const lat = Number(c[1]);
                    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
                    return { stationId: id, coordinates: [lng, lat] };
                })
                .filter(Boolean);

            if (!points.length) continue;

            let isSameLocation = true;
            if (points.length > 1) {
                const first = points[0].coordinates;
                for (let i = 1; i < points.length; i += 1) {
                    if (euclideanDistanceSqLngLat(first, points[i].coordinates) > 1e-12) {
                        isSameLocation = false;
                        break;
                    }
                }
            }

            if (points.length === 1 || isSameLocation) {
                centroidFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: points[0].coordinates.slice() },
                    properties: { fallbackCircle: 1 }
                });
                continue;
            }

            const edges = buildMstEdgesForExport(points);
            for (const [i, j] of edges) {
                const a = points[i]?.coordinates;
                const b = points[j]?.coordinates;
                if (!a || !b) continue;
                lineFeatures.push({
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: [a.slice(), b.slice()] },
                    properties: { fallbackCircle: 0 }
                });
            }

            let sumLng = 0;
            let sumLat = 0;
            for (const p of points) {
                sumLng += p.coordinates[0];
                sumLat += p.coordinates[1];
            }
            centroidFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [sumLng / points.length, sumLat / points.length] },
                properties: { fallbackCircle: 0 }
            });
        }

        return { lines: lineFeatures, centroids: centroidFeatures };
    };

    const pickCapsulesInBbox = async (baseMap, bbox, options = {}) => {
        const noOffset = options?.noOffset === true;
        const visibleStationIds = options?.visibleStationIds instanceof Set ? options.visibleStationIds : null;

        const sourceCapsules = noOffset
            ? await buildNoOffsetCapsulesGeoJSON(visibleStationIds)
            : {
                lines: await getGeoJsonSourceData(baseMap, 'transfer-capsule-lines-source'),
                centroids: await getGeoJsonSourceData(baseMap, 'transfer-capsule-centroids-source')
            };

        const linesFc = noOffset
            ? { type: 'FeatureCollection', features: Array.isArray(sourceCapsules?.lines) ? sourceCapsules.lines : [] }
            : sourceCapsules.lines;
        const centsFc = noOffset
            ? { type: 'FeatureCollection', features: Array.isArray(sourceCapsules?.centroids) ? sourceCapsules.centroids : [] }
            : sourceCapsules.centroids;

        const filterFeatures = (fc, isPoint) => {
            const out = [];
            for (const f of (Array.isArray(fc?.features) ? fc.features : [])) {
                if (!f?.geometry) continue;
                if (isPoint) {
                    if (f.geometry.type !== 'Point') continue;
                    const c = f.geometry.coordinates;
                    if (pointInBbox(c[0], c[1], bbox)) out.push(f);
                } else {
                    if (f.geometry.type === 'LineString' && featureBboxIntersects(f.geometry.coordinates, bbox)) {
                        out.push(f);
                    }
                }
            }
            return out;
        };

        return {
            lines: filterFeatures(linesFc, false),
            centroids: filterFeatures(centsFc, true)
        };
    };
    // 同样增加 capsules 参数
    const buildSvgFromBaseHighlight = async ({ map, kind, highlightLineFeatures, lowlightLineFeatures, stationFeatures, backgroundImageHref, transparentBackground = false, capsules }) => {        const container = map.getContainer?.();
        const rect = container?.getBoundingClientRect?.();
        const width = Math.max(1, Math.round(rect?.width || 0));
        const height = Math.max(1, Math.round(rect?.height || 0));

        const z = (typeof map.getZoom === 'function') ? map.getZoom() : 14;
        const stationStyleContext = await getStationStyleContext(map);
        const stationNameById = await getStationNameById();

        const bg = isDarkTheme() ? '#000' : '#fff';
        const title = kind ? `base highlight: ${String(kind)}` : 'base highlight';

        const parts = [];
        parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
        parts.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" overflow="hidden">`);
        parts.push(`<title>${escapeXml(title)}</title>`);
        parts.push(`<defs>`);
        parts.push(`<clipPath id="export-clip"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath>`);
        parts.push(`</defs>`);
        parts.push(`<g clip-path="url(#export-clip)">`);

        if (!transparentBackground) {
            parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`);
            if (backgroundImageHref) {
                const href = escapeXml(String(backgroundImageHref));
                parts.push(`<image x="0" y="0" width="${width}" height="${height}" href="${href}" xlink:href="${href}" preserveAspectRatio="none"/>`);
            }
        }

        // lowlight base lines (grey)
        const lowlight = Array.isArray(lowlightLineFeatures) ? lowlightLineFeatures : [];
        if (lowlight.length) {
            const stroke = isDarkTheme() ? '#666' : '#999';
            parts.push(`<g id="base-lines-lowlight" fill="none" stroke="${stroke}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${lineLowlightWidthForZoom(z)}" opacity="0.45">`);
            for (const f of lowlight) {
                const geom = f?.geometry;
                if (!geom) continue;
                if (geom.type === 'LineString') {
                    const d = pathFromCoords(map, geom.coordinates);
                    if (!d) continue;
                    parts.push(`<path d="${d}"/>`);
                } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                    for (const line of geom.coordinates) {
                        const d = pathFromCoords(map, line);
                        if (!d) continue;
                        parts.push(`<path d="${d}"/>`);
                    }
                }
            }
            parts.push(`</g>`);
        }

        // highlighted lines (by their own colors)
        const highlights = Array.isArray(highlightLineFeatures) ? highlightLineFeatures : [];
        parts.push(`<g id="base-lines-highlight" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
        for (const f of highlights) {
            const geom = f?.geometry;
            if (!geom) continue;
            const color = resolveLineColorForTheme(f?.properties, '#0a84ff');
            const strokeWidth = lineBaseWidthForZoom(z);
            if (geom.type === 'LineString') {
                const d = pathFromCoords(map, geom.coordinates);
                if (!d) continue;
                parts.push(`<path d="${d}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" opacity="1"/>`);
            } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
                for (const line of geom.coordinates) {
                    const d = pathFromCoords(map, line);
                    if (!d) continue;
                    parts.push(`<path d="${d}" stroke="${escapeXml(color)}" stroke-width="${strokeWidth}" opacity="1"/>`);
                }
            }
        }
        parts.push(`</g>`);

        appendTransferCapsulesSvg({ 
            parts, map, z, 
            capsuleLines: capsules?.lines, 
            capsuleCentroids: capsules?.centroids 
        });

        // stations
        const stations = Array.isArray(stationFeatures) ? stationFeatures : [];
        if (stations.length) {
            parts.push(`<g id="base-stations">`);
            for (const f of stations) {
                const g = f?.geometry;
                if (!g || g.type !== 'Point') continue;
                const c = g.coordinates;
                if (!Array.isArray(c) || c.length < 2) continue;
                const p = project(map, { lng: Number(c[0]), lat: Number(c[1]) });
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

                const sc = stationServingCount(f?.properties || {});
                const r = radiusForStop(z, sc);
                const sw = stopStrokeWidth(z, sc);
                const fill = resolveStationFillColor({ props: f?.properties || {}, styleContext: stationStyleContext });
                parts.push(
                    `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${escapeXml(fill)}" stroke="${stopStroke()}" stroke-width="${sw.toFixed(2)}"/>`
                );
            }
            parts.push(`</g>`);

            {
                const mode = getCurrentStationLabelMode();
                if (mode !== 'off') {
                    const fontPx = 12;
                    const font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
                    const candidates = [];

                    for (const f of stations) {
                        const props = f?.properties || {};
                        const sid = String(props?.id || '').trim();
                        if (!sid) continue;
                        const g = f?.geometry;
                        if (!g || g.type !== 'Point') continue;
                        const c = g.coordinates;
                        if (!Array.isArray(c) || c.length < 2) continue;

                        const name = stationNameById.get(sid) || sid;
                        if (!name) continue;
                        const sc = stationServingCount(props);
                        const r = radiusForStop(z, sc);
                        const textW = measureTextWidthPx(name, font);

                        candidates.push({
                            id: sid,
                            text: name,
                            priority: sc,
                            coordinates: [Number(c[0]), Number(c[1])],
                            fontPx,
                            font,
                            widthPx: textW + 8,
                            heightPx: Math.ceil(fontPx * 1.2 + 2),
                            labelDyPx: r + 6
                        });
                    }

                    const visible = mode === 'auto'
                        ? pickVisibleLabelIdsByCollision({ map, candidates, gridCellPx: 80 })
                        : new Set(candidates.map((c) => c.id));
                    appendStationLabelBoxesSvg({
                        parts,
                        groupId: 'base-station-labels',
                        map,
                        candidates,
                        visibleIds: visible
                    });
                }
            }
        }

        parts.push(`</g>`);
        parts.push(`</svg>`);
        return parts.join('\n');
    };

    const exportBaseHighlight = async (snapshot, options) => {
        if (exporting) return;
        const baseMap = window.__TokyoRailMap;
        if (!baseMap) return;
        const kind = snapshot?.kind || 'unknown';
        const label = String(snapshot?.label || kind || 'highlight');
        const lineIds = snapshot?.lineIds;
        if (!(lineIds instanceof Set) || !lineIds.size) return;

        const format = options?.format === 'png' ? 'png' : 'svg+png';
        const zoomMode = options?.zoomMode === 'auto' ? 'auto' : 'current';
        exporting = true;
        try {
            const highlightFeatures = await pickLineFeaturesByIds({ baseMap, lineIds });
            const bboxRaw = calcBboxFromLineFeatures(highlightFeatures);
            const geoBbox = normalizeBbox(bboxRaw);
            if (!geoBbox) return;

            const baseZoom = (typeof baseMap.getZoom === 'function') ? baseMap.getZoom() : 11;
            const baseBearing = (typeof baseMap.getBearing === 'function') ? baseMap.getBearing() : 0;
            const basePitch = (typeof baseMap.getPitch === 'function') ? baseMap.getPitch() : 0;
            const { map: vmap, container: vcontainer } = await ensureVirtualMap();

            const baseName = ['highlight', sanitizeFilePart(label), nowIsoCompact()].join('_');
            const pngName = `${baseName}.png`;
            const svgName = `${baseName}.svg`;
            const zipName = `${baseName}.zip`;

            const a = approxBboxAspect(geoBbox);
            const targetRatio = chooseAspectRatio(a, 1);
            const isLandscape = targetRatio >= 1;

            const tryExportPng = async ({ baseW, baseH, paddingPx }) => {
                await ensureStyleMatchesTheme(vmap);
                if (zoomMode === 'auto') {
                    const w = Math.max(1, Math.round(Number(baseW) || 1));
                    const h = Math.max(1, Math.round(Number(baseH) || 1));
                    vcontainer.style.width = `${w}px`;
                    vcontainer.style.height = `${h}px`;
                    vmap.resize?.();
                    vmap.jumpTo?.({
                        center: [(geoBbox.minLng + geoBbox.maxLng) / 2, (geoBbox.minLat + geoBbox.maxLat) / 2],
                        zoom: Number(baseZoom) || 11,
                        bearing: Number(baseBearing) || 0,
                        pitch: Number(basePitch) || 0,
                    });
                    vmap.fitBounds?.(
                        [[geoBbox.minLng, geoBbox.minLat], [geoBbox.maxLng, geoBbox.maxLat]],
                        { padding: Math.max(0, Number(paddingPx) || 0), duration: 0 }
                    );
                } else {
                    const size = computeExportSizeAtFixedZoom({
                        map: vmap,
                        container: vcontainer,
                        geoBbox,
                        baseW,
                        baseH,
                        paddingPx,
                        zoom: baseZoom,
                        bearing: baseBearing,
                        pitch: basePitch,
                    });
                    vmap.jumpTo?.({
                        center: size.center,
                        zoom: Number(baseZoom) || 11,
                        bearing: Number(baseBearing) || 0,
                        pitch: Number(basePitch) || 0,
                    });
                }

                await waitForEventOnce(vmap, 'moveend', 2000);
                await waitForEventOnce(vmap, 'idle', 8000);

                const canvas = vmap.getCanvas?.();
                if (!canvas) throw new Error('canvas not available');
                if (zoomMode === 'auto') {
                    return { blob: await canvasToPngBlob(canvas), w: Math.round(Number(baseW) || 1), h: Math.round(Number(baseH) || 1) };
                }
                return { blob: await canvasToPngBlob(canvas), w: canvas.width, h: canvas.height };
            };

            const resolution = String(options?.resolution || '4k');
            let pngBlob = null;
            let outW = isLandscape ? 3840 : 2160;
            let outH = isLandscape ? 2160 : 3840;
            if (resolution === '1080p') {
                const r = await tryExportPng({
                    baseW: isLandscape ? 1920 : 1080,
                    baseH: isLandscape ? 1080 : 1920,
                    paddingPx: 60,
                });
                pngBlob = r.blob;
                outW = r.w;
                outH = r.h;
            } else {
                try {
                    const r = await tryExportPng({
                        baseW: isLandscape ? 3840 : 2160,
                        baseH: isLandscape ? 2160 : 3840,
                        paddingPx: 120,
                    });
                    pngBlob = r.blob;
                    outW = r.w;
                    outH = r.h;
                } catch {
                    const r = await tryExportPng({
                        baseW: isLandscape ? 1920 : 1080,
                        baseH: isLandscape ? 1080 : 1920,
                        paddingPx: 60,
                    });
                    pngBlob = r.blob;
                    outW = r.w;
                    outH = r.h;
                }
            }

            // lowlight lines + stations inside export view
            let lowlightLines = [];
            let stationFeatures = [];
            let capsules = null;
            try {
                const bounds = vmap.getBounds?.();
                if (bounds) {
                    const viewBbox = {
                        minLng: bounds.getWest(),
                        minLat: bounds.getSouth(),
                        maxLng: bounds.getEast(),
                        maxLat: bounds.getNorth(),
                    };
                    lowlightLines = await pickLowlightLinesInBbox({ baseMap, bbox: viewBbox, excludeLineIds: lineIds });
                    stationFeatures = await pickStationsInBboxForLineIds({ baseMap, bbox: viewBbox, lineIds });
                    if (EXPORT_NO_OFFSET_OVERLAY) {
                        stationFeatures = await remapStopFeatureCoordsToRawStations(stationFeatures);
                    }

                    const visibleStationIdsForCapsules = new Set(
                        (Array.isArray(stationFeatures) ? stationFeatures : [])
                            .map((f) => String(f?.properties?.id || f?.id || '').trim())
                            .filter(Boolean)
                    );
                    capsules = await pickCapsulesInBbox(baseMap, viewBbox, {
                        noOffset: EXPORT_NO_OFFSET_OVERLAY,
                        visibleStationIds: visibleStationIdsForCapsules
                    });
                }
            } catch {
                // ignore
            }

            if (format === 'png') {
                try {
                    const overlaySvgText = await buildSvgFromBaseHighlight({
                        map: vmap,
                        kind,
                        highlightLineFeatures: highlightFeatures,
                        lowlightLineFeatures: lowlightLines,
                        stationFeatures,
                        backgroundImageHref: null,
                        transparentBackground: true,
                        capsules,
                    });
                    const merged = await compositePngAndSvgToPngBlob({
                        backgroundPngBlob: pngBlob,
                        overlaySvgText,
                        width: outW,
                        height: outH,
                    });
                    downloadBlob({ blob: merged, filename: pngName });
                } catch {
                    downloadBlob({ blob: pngBlob, filename: pngName });
                }
                return;
            }

            const svgText = await buildSvgFromBaseHighlight({
                map: vmap,
                kind,
                highlightLineFeatures: highlightFeatures,
                lowlightLineFeatures: lowlightLines,
                stationFeatures,
                backgroundImageHref: pngName,
                transparentBackground: false,
                capsules,
            });

            const JSZipCtor = window.JSZip;
            if (!JSZipCtor) {
                downloadBlob({ blob: pngBlob, filename: pngName });
                downloadBlob({ blob: new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), filename: svgName });
                return;
            }

            const zip = new JSZipCtor();
            zip.file(pngName, pngBlob);
            zip.file(svgName, svgText);
            const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
            downloadBlob({ blob: zipBlob, filename: zipName });
        } catch {
            // ignore
        } finally {
            exporting = false;
        }
    };

    const exportCurrentSelection = async (options) => {
        const tripActive = isTripPreviewActiveNow();
        const baseActive = !!(lastBaseHighlight && lastBaseHighlightAt && lastBaseHighlight.lineIds instanceof Set && lastBaseHighlight.lineIds.size);
        const multiSelect = isMultiSelectModeEnabledNow();
        const baseMap = window.__TokyoRailMap;

        const ensureSnapshotFromMapSources = async () => {
            if (!baseMap) return null;
            const lineFc = await getGeoJsonSourceData(baseMap, 'trip-preview-source');
            const stopFc = await getGeoJsonSourceData(baseMap, 'trip-preview-stops-source');
            const normalizedBuilt = normalizeBuiltSnapshot({ lineFc, stopFc });
            if (!normalizedBuilt) return null;
            const normalized = normalizeTripSnapshot({
                payload: lastSnapshot?.payload || {},
                built: normalizedBuilt
            });
            if (!normalized) return null;
            lastSnapshot = normalized;
            lastSnapshotAt = Date.now();
            return normalized;
        };

        // 逻辑1：单独导出基础图层
        if (!tripActive && baseActive) {
            await exportBaseHighlight(lastBaseHighlight, options);
            return true;
        }

        // 逻辑2/3：直通活跃时，默认单独导出直通；仅在“多选模式 + 基础也活跃”时合并导出
        if (tripActive) {
            if (!lastSnapshot || !lastSnapshotAt) {
                const hydrated = await ensureSnapshotFromMapSources();
                if (!hydrated) return false;
            }

            // 逻辑3：同时导出直通和基础图层
            if (multiSelect && baseActive) {
                await exportSnapshot(lastSnapshot, options, { baseHighlight: lastBaseHighlight });
            } else {
                // 逻辑2：单独导出直通图层（原逻辑）
                await exportSnapshot(lastSnapshot, options);
            }
            return true;
        }

        return false;
    };

    // ---- export UI (settings-fab-like hover menu) ----

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = String(text);
        return node;
    };

    const mountExportMenu = () => {
        const existing = document.querySelector('.export-ui');
        if (existing) return existing;

        const root = el('div', 'export-ui is-collapsed');

        const fab = el('button', 'export-fab');
        fab.type = 'button';
        fab.setAttribute('aria-label', '导出');

        const fabIcon = document.createElement('img');
        fabIcon.className = 'export-fab-icon';
        fabIcon.alt = '';
        setIconFromCache(fabIcon, 'camera.svg');
        fab.appendChild(fabIcon);

        const content = el('div', 'settings-content export-content is-hidden');

        const prefs = readExportPrefs() || { format: 'svg+png', resolution: '4k', zoomMode: 'current' };
        let format = prefs.format;
        let resolution = prefs.resolution;
        let zoomMode = prefs.zoomMode;

        let refreshResolutionDisabled = null;

        const mkSeg = (opts, getValue, setValue) => {
            const seg = el('div', 'settings-seg');
            for (const o of opts) {
                const b = el('button', '', o.label);
                b.type = 'button';
                const refresh = () => {
                    b.classList.toggle('is-active', getValue() === o.value);
                };
                refresh();
                b.addEventListener('click', (evt) => {
                    evt.preventDefault?.();
                    evt.stopPropagation?.();
                    setValue(o.value);
                    seg.querySelectorAll('button').forEach((x) => x.classList.remove('is-active'));
                    b.classList.add('is-active');
                    writeExportPrefs({ format, resolution, zoomMode });
                    try { refreshResolutionDisabled?.(); } catch {}
                });
                seg.appendChild(b);
            }
            return seg;
        };

        const rowFormat = el('div', 'settings-item');
        rowFormat.appendChild(el('div', 'settings-item-title', '图片格式'));
        {
            const ctrl = el('div', 'settings-item-control');
            ctrl.appendChild(mkSeg(
                [
                    { label: 'svg+png', value: 'svg+png' },
                    { label: 'png', value: 'png' },
                ],
                () => format,
                (v) => { format = v; }
            ));
            rowFormat.appendChild(ctrl);
        }

        const rowRes = el('div', 'settings-item');
        rowRes.appendChild(el('div', 'settings-item-title', '分辨率'));
        {
            const ctrl = el('div', 'settings-item-control');
            ctrl.appendChild(mkSeg(
                [
                    { label: '1080P', value: '1080p' },
                    { label: '4K', value: '4k' },
                ],
                () => resolution,
                (v) => { resolution = v; }
            ));
            rowRes.appendChild(ctrl);
        }

        const rowZoom = el('div', 'settings-item');
        rowZoom.appendChild(el('div', 'settings-item-title', '放大倍率'));
        {
            const ctrl = el('div', 'settings-item-control');
            ctrl.appendChild(mkSeg(
                [
                    { label: '当前', value: 'current' },
                    { label: '自动', value: 'auto' },
                ],
                () => zoomMode,
                (v) => { zoomMode = v; }
            ));
            rowZoom.appendChild(ctrl);
        }

        refreshResolutionDisabled = () => {
            const disabled = (format === 'svg+png') && (zoomMode === 'current');
            rowRes.classList.toggle('is-disabled', disabled);
            // 禁用鼠标/触摸交互（整行）
            rowRes.style.pointerEvents = disabled ? 'none' : '';
        };
        refreshResolutionDisabled();

        const rowExport = el('div', 'settings-item-control');
        const btn = el('button', 'settings-time-picker-btn settings-time-picker-btn-confirm', '导出');
        btn.type = 'button';

        const setLoading = (loading) => {
            const on = loading === true;
            root.classList.toggle('is-loading', on);
            try {
                fab.disabled = on;
                fab.setAttribute('aria-busy', on ? 'true' : 'false');
            } catch {
                // ignore
            }
        };

        btn.addEventListener('click', async (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();

            // 点击导出后立刻收回菜单
            try { collapse?.(); } catch {}

            // 避免重复触发
            if (exporting) return;

            setLoading(true);
            try {
                await exportCurrentSelection({ resolution, format, zoomMode });
            } finally {
                setLoading(false);
            }
        });
        rowExport.appendChild(btn);
        

        content.appendChild(rowFormat);
        content.appendChild(rowZoom);
        content.appendChild(rowRes);
        content.appendChild(rowExport);

        root.appendChild(fab);
        root.appendChild(content);
        document.body.appendChild(root);


        let collapseTimer = null;
        const expand = () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            root.classList.remove('is-collapsed');
            content.classList.remove('is-hidden');
        };
        const collapse = () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            root.classList.add('is-collapsed');
            content.classList.add('is-hidden');
        };
        const scheduleCollapse = () => {
            if (collapseTimer) window.clearTimeout(collapseTimer);
            collapseTimer = window.setTimeout(() => {
                collapseTimer = null;
                collapse();
            }, 120);
        };

        root.addEventListener('mouseenter', () => {
            if (collapseTimer) {
                window.clearTimeout(collapseTimer);
                collapseTimer = null;
            }
            expand();
        });
        root.addEventListener('mouseleave', () => scheduleCollapse());

        fab.addEventListener('pointerdown', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (root.classList.contains('is-collapsed')) expand();
            else collapse();
        });
        fab.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (root.classList.contains('is-collapsed')) expand();
            else collapse();
        });

        document.addEventListener('pointerdown', (evt) => {
            if (root.classList.contains('is-collapsed')) return;
            const t = evt?.target;
            if (t && root.contains(t)) return;
            collapse();
        }, true);

        return root;
    };

    mountExportMenu();
})();
