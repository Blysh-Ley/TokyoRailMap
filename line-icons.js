/**
 * Line icons (code badges) for RW menu and other UI.
 *
 * - Reads ./data/routes.csv and maps route id -> { code, color }
 * - Reads ./data/railways.json for canonical line color (preferred over routes.csv)
 * - Generates icon styles:
 *   - JR/other: rounded rectangle, thin border
 *   - TokyoMetro/Toei: circle, thick border
 *   - Exceptions: Toei.Arakawa, Toei.NipporiToneri use rectangle style
 * - Light theme: white bg + black text
 * - Dark theme: black bg + white text
 * - Border color uses existing "invert-on-dark-if-too-dark" logic
 */

const toText = (v) => String(v ?? '').trim();

const specialMainByBranch = {
    'JR-East.KeiyoKoyaBranch': 'JR-East.Musashino',
    'JR-East.KeiyoFutamataBranch': 'JR-East.Musashino',
    'Seibu.S-Fukutoshin': 'Seibu.Ikebukuro',
    'Seibu.S-Yurakucho': 'Seibu.Ikebukuro',
    'Tobu.JRTobuConnection': 'Tobu.Nikko'
};

const isBranchLineId = (lineId) => typeof lineId === 'string' && lineId.endsWith('Branch');

const splitCamelWords = (s) => {
    if (!s) return [];
    const m = String(s).match(/[A-Z][a-z0-9]*/g);
    return Array.isArray(m) ? m : [];
};

export const resolveMainLineIdForIcon = (lineId, index = null) => {
    const id = toText(lineId);
    if (!id) return '';

    const exists = (cand) => {
        const c = toText(cand);
        if (!c) return false;
        if (!(index instanceof Map)) return true;
        return index.has(c);
    };

    const special = specialMainByBranch[id];
    if (special && exists(special)) return special;

    if (!isBranchLineId(id)) return id;

    const noBranch = id.slice(0, -'Branch'.length);
    const dot = noBranch.lastIndexOf('.');
    if (dot < 0) return exists(noBranch) ? noBranch : id;

    const prefix = noBranch.slice(0, dot + 1);
    const suffix = noBranch.slice(dot + 1);
    const words = splitCamelWords(suffix);
    if (!words.length) return exists(noBranch) ? noBranch : id;

    for (let n = words.length; n >= 1; n--) {
        const cand = prefix + words.slice(0, n).join('');
        if (exists(cand)) return cand;
    }

    return exists(noBranch) ? noBranch : id;
};



export const selectLineIconPreset = (routeId, code) => {
    const id = toText(routeId);
    if (!id) return 'default';

    if(
        id=='Toei.Arakawa'||
        id=='Toei.NipporiToneri'
    ) {
        return 'rectangle-border';
    }
    else if(
        id.startsWith('TokyoMetro.')||
        id.startsWith('Toei.')
    ) {
        return 'circle-border';
    }
    else if(
        id=='TWR.Rinkai'||
        id=='Yurikamome.Yurikamome' || 
        id.startsWith('YokohamaMunicipal.')
    ) {
        return 'circle';
    }
    else if(
        id.startsWith('MIR.')||
        id.startsWith('Sotetsu.')||
        id.startsWith('Tokyu.')||
        id.startsWith('JR-Central')||
        id=='Minatomirai.Minatomirai'
    ) {
        return 'rectangle';
    }
    else if(
        id.startsWith('Keikyu.')||
        id.startsWith('Keisei.')||
        id.startsWith('Hokuso.')||
        id.startsWith('Odakyu.')||
        id.startsWith('Keio.')||
        id.startsWith('ChibaMonorail.')||
        id=="Enoden.Enoden"
    ) {
        return 'circle-thin-border';
    }
    else{
        return 'rectangle-border';
    }
};

export const isDarkThemeActive = () => {
    try {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    } catch {
        return false;
    }
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

    const rgb = s.match(
        /^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i
    );
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
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const DARK_INVERT_TRIGGER_LUMINANCE = (() => {
    // Align with existing UI logic: use Keisei blue as reference threshold.
    const ref = parseCssColorToRgb('#005AAA');
    return ref ? relativeLuminance(ref) : 0.102;
})();

const adjustColorForDarkThemeIfNeeded = (color) => {
    const parsed = parseCssColorToRgb(color);
    if (!parsed) return toText(color);

    const lum = relativeLuminance(parsed);
    if (!(lum < DARK_INVERT_TRIGGER_LUMINANCE)) return toText(color);

    const inverted = { r: 255 - parsed.r, g: 255 - parsed.g, b: 255 - parsed.b };
    return rgbToHex(inverted);
};

export const resolveBorderColorForTheme = (color) => {
    const raw = toText(color);
    if (!raw) return raw;
    if (!isDarkThemeActive()) return raw;
    return adjustColorForDarkThemeIfNeeded(raw);
};

export const resolveLineColorForTheme = (color) => {
    // Same as border rule: in dark theme, invert too-dark colors for visibility.
    const raw = toText(color);
    if (!raw) return raw;
    if (!isDarkThemeActive()) return raw;
    return adjustColorForDarkThemeIfNeeded(raw);
};


const parseCsvLine = (line) => {
    // Minimal CSV parser supporting quoted fields.
    const out = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                const next = line[i + 1];
                if (next === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',') {
            out.push(cur);
            cur = '';
            continue;
        }
        cur += ch;
    }
    out.push(cur);
    return out;
};

const parseRoutesCsv = (text) => {
    const s = String(text ?? '');
    const lines = s.split(/\r?\n/).filter((x) => x && String(x).trim().length);
    if (!lines.length) return new Map();

    const header = parseCsvLine(lines[0]).map((x) => toText(x));
    const idxId = header.indexOf('id');
    const idxCode = header.indexOf('code');
    const idxColor = header.indexOf('color');

    const map = new Map();

    for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const id = idxId >= 0 ? toText(cols[idxId]) : '';
        if (!id) continue;

        const code = idxCode >= 0 ? toText(cols[idxCode]) : '';
        const rawColor = idxColor >= 0 ? toText(cols[idxColor]) : '';
        const color = rawColor ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '';

        map.set(id, { id, code, color });
    }

    return map;
};

let _routesIndexPromise = null;
let _routesIndex = null;
let _railwayColorIndexPromise = null;
let _railwayColorIndex = null;

export const getRoutesIndex = async (url = './data/routes.csv') => {
    if (_routesIndex instanceof Map) return _routesIndex;
    if (_routesIndexPromise) return _routesIndexPromise;

    _routesIndexPromise = (async () => {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`routes.csv fetch failed: ${resp.status}`);
            const text = await resp.text();
            _routesIndex = parseRoutesCsv(text);
        } catch {
            _routesIndex = new Map();
        } finally {
            _routesIndexPromise = null;
        }
        return _routesIndex;
    })();

    return _routesIndexPromise;
};

const getRailwayColorIndex = async (url = './data/railways.json') => {
    if (_railwayColorIndex instanceof Map) return _railwayColorIndex;
    if (_railwayColorIndexPromise) return _railwayColorIndexPromise;

    _railwayColorIndexPromise = (async () => {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`railways.json fetch failed: ${resp.status}`);
            const list = await resp.json();
            const map = new Map();
            for (const row of Array.isArray(list) ? list : []) {
                const id = toText(row?.id);
                if (!id) continue;
                const raw = toText(row?.color);
                const color = raw ? (raw.startsWith('#') ? raw : `#${raw}`) : '';
                map.set(id, color);
            }
            _railwayColorIndex = map;
        } catch {
            _railwayColorIndex = new Map();
        } finally {
            _railwayColorIndexPromise = null;
        }
        return _railwayColorIndex;
    })();

    return _railwayColorIndexPromise;
};

export const getResolvedRouteIconMeta = async (routeId, fallback = {}) => {
    const id = toText(routeId);
    if (!id) return null;

    const [index, railwayColorIndex] = await Promise.all([
        getRoutesIndex(),
        getRailwayColorIndex()
    ]);
    const resolvedId = resolveMainLineIdForIcon(id, index);
    const sourceMeta = index.get(id) || null;
    const mainMeta = index.get(resolvedId) || null;

    const sourceRailColor = toText(railwayColorIndex?.get?.(id) || '');
    const mainRailColor = toText(railwayColorIndex?.get?.(resolvedId) || '');

    if (!sourceMeta && !mainMeta && !sourceRailColor && !mainRailColor && !fallback?.code && !fallback?.color) return null;

    return {
        id: toText(sourceMeta?.id) || toText(mainMeta?.id) || resolvedId || id,
        code: toText(sourceMeta?.code) || toText(mainMeta?.code) || toText(fallback?.code),
        color: sourceRailColor || mainRailColor || toText(sourceMeta?.color) || toText(mainMeta?.color) || toText(fallback?.color)
    };
};

const applyIconStyleForTheme = (el) => {
    if (!(el instanceof HTMLElement)) return;

    const routeId = toText(el.dataset.routeId);
    const code = toText(el.dataset.code);
    const preset = el.dataset.preset || selectLineIconPreset(routeId, code);
    const routeColor = toText(el.dataset.routeColor);
    const dark = isDarkThemeActive();

    const borderColor = resolveBorderColorForTheme(routeColor) || routeColor;
    const fillColor = resolveLineColorForTheme(routeColor) || routeColor;

    const darkBackground = dark ?  'rgba(28, 28, 28, 0.94)' : '#fff';
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    el.style.flex = '0 0 auto';
    el.style.userSelect = 'none';

    if (!code) {
        el.textContent = '1';
        el.style.backgroundColor = darkBackground;
        el.style.color = 'transparent';

        el.style.border = `3.5px solid ${borderColor || 'transparent'}`;
        el.style.borderRadius = '4px';
        el.style.height = '25px';
        el.style.width = '25px';
        el.style.padding = '0';
        el.style.paddingBottom = '2px';
        el.style.fontSize = '12px';
        el.style.letterSpacing = '0';

        
        return;
    }

    // 每个 preset 一组完整样式
    switch (preset) {
        case 'rectangle': {
             {
            // D) rounded-rect ring, transparent background
            el.style.backgroundColor = fillColor || (dark ? '#000' : '#fff');
            el.style.color = dark ? '#000' : '#fff';

            el.style.border = '0';
            el.style.borderRadius = '4px';
            el.style.height = '25px';
            el.style.width = '25px';
            el.style.padding = '0 6px';
            el.style.paddingBottom = '2px';

            el.style.fontWeight = 'bold';
            if (code.length <= 1) {
                el.style.fontSize = '14px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '13px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '10px';
                el.style.letterSpacing = '-0.4px';
            }
            break;
        }
        }
        case 'circle': {
            // C) solid circle with route color background
            el.style.backgroundColor = fillColor || (dark ? '#000' : '#fff');
            el.style.color = dark ? '#000' : '#fff';

            el.style.border = '0';
            el.style.borderRadius = '9999px';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '1px';

            el.style.fontWeight = 'bold';
            el.style.fontSize =  '15px';
            el.style.letterSpacing = '0px';
            break;
        }
        case 'circle-border': {
            // B) circle thick ring, transparent background
            el.style.backgroundColor = darkBackground;
            el.style.color = dark ? '#fff' : '#000';

            el.style.border = `5px solid ${borderColor || 'transparent'}`;
            el.style.borderRadius = '9999px';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '1px';

            el.style.fontWeight = '800';
            if (code.length <= 1) {
                el.style.fontSize = '12px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '11px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '8px';
                el.style.letterSpacing = '-0.4px';
            }
            break;
        }
        case 'circle-thin-border': {
            el.style.backgroundColor =  darkBackground;
            el.style.color = dark ? '#fff' : '#000';

            el.style.border = `3px solid ${borderColor || 'transparent'}`;
            el.style.borderRadius = '9999px';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '2px';

            el.style.fontWeight = '800';
            if (code.length <= 1) {
                el.style.fontSize = '12px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '11px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '8px';
                el.style.letterSpacing = '-0.4px';
        }
            break;
        }
        case 'rectangle-border':
        default: {
            // A) rounded-rect ring, transparent background
            el.style.backgroundColor = darkBackground;
            el.style.color = dark ? '#fff' : '#000';

            el.style.border = `3.5px solid ${borderColor || 'transparent'}`;
            el.style.borderRadius = '4px';
            el.style.height = '25px';
            el.style.width = '25px';
            el.style.padding = '0 6px';
            el.style.paddingBottom = '2px';

            el.style.fontWeight = '800';
            if (code.length <= 1) {
                el.style.fontSize = '12px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '11px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '8px';
                el.style.letterSpacing = '-0.4px';
            }
            break;
        }
    }
};

const applyStationCodeBadgeStyleForTheme = (el) => {
    if (!(el instanceof HTMLElement)) return;

    const code = toText(el.dataset.code);
    if (!code) return;

    const routeColor = toText(el.dataset.lineColor);
    const dark = isDarkThemeActive();
    const borderColor = resolveBorderColorForTheme(routeColor) || routeColor || 'transparent';

    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.boxSizing = 'border-box';
    el.style.userSelect = 'none';
    el.style.backgroundColor = dark ? '#000' : '#fff';
    el.style.color = dark ? '#fff' : '#000';
    el.style.border = `2px solid ${borderColor}`;
    el.style.borderRadius = '10px';
    el.style.height = '20px';
    el.style.minWidth = '20px';
    el.style.padding = '0 5px';
    el.style.lineHeight = '1';
    el.style.fontWeight = '700';

    if (code.length <= 2) {
        el.style.fontSize = '11px';
        el.style.letterSpacing = '0px';
    } else if (code.length <= 4) {
        el.style.fontSize = '10px';
        el.style.letterSpacing = '-0.1px';
    } else {
        el.style.fontSize = '9px';
        el.style.letterSpacing = '-0.2px';
    }
};

export const createStationCodeBadgeElement = ({ code, color }) => {
    const c = toText(code);
    if (!c) return null;

    const el = document.createElement('span');
    el.className = 'rw-station-code-badge';
    el.textContent = c;
    el.dataset.code = c;
    el.dataset.lineColor = toText(color);

    applyStationCodeBadgeStyleForTheme(el);
    ensureThemeObserver();
    return el;
};

let _themeObserverStarted = false;

const ensureThemeObserver = () => {
    if (_themeObserverStarted) return;
    _themeObserverStarted = true;

    try {
        const target = document.documentElement;
        const obs = new MutationObserver(() => {
            document.querySelectorAll('.rw-line-icon').forEach((el) => applyIconStyleForTheme(el));
            document.querySelectorAll('.rw-station-code-badge').forEach((el) => applyStationCodeBadgeStyleForTheme(el));
        });
        obs.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    } catch {
        // Ignore
    }
};

export const createLineIconElement = ({ routeId, code, color }) => {
    const id = toText(routeId);
    const resolvedId = resolveMainLineIdForIcon(id, _routesIndex instanceof Map ? _routesIndex : null) || id;
    const sourceMeta = _routesIndex instanceof Map ? (_routesIndex.get(id) || null) : null;
    const mainMeta = _routesIndex instanceof Map ? (_routesIndex.get(resolvedId) || null) : null;
    const sourceRailColor = _railwayColorIndex instanceof Map ? toText(_railwayColorIndex.get(id) || '') : '';
    const mainRailColor = _railwayColorIndex instanceof Map ? toText(_railwayColorIndex.get(resolvedId) || '') : '';
    const c = toText(sourceMeta?.code) || toText(mainMeta?.code) || toText(code);
    const resolvedColor = toText(color) || sourceRailColor || mainRailColor || toText(sourceMeta?.color) || toText(mainMeta?.color);
    if (!resolvedId || (!c && !resolvedColor)) return null;

    const el = document.createElement('span');
    el.className = 'rw-line-icon';
    el.textContent = c;

    el.dataset.routeId = resolvedId;
    el.dataset.sourceRouteId = id;
    el.dataset.code = c;
    el.dataset.routeColor = resolvedColor;
    el.dataset.preset = selectLineIconPreset(resolvedId, c);

    applyIconStyleForTheme(el);
    ensureThemeObserver();

    return el;
};

export const ensureLineIconForRwLineContent = async (rwLineContentEl, routeId) => {
    if (!(rwLineContentEl instanceof HTMLElement)) return;

    // Try to find the left container; fall back to the anchor itself.
    const left =
        rwLineContentEl.querySelector('.RW-line-left') ||
        rwLineContentEl.querySelector('.rw-line-left') ||
        rwLineContentEl;

    if (left.querySelector('.rw-line-icon')) return;

    const meta = await getResolvedRouteIconMeta(routeId);
    if (!meta || (!meta.code && !meta.color)) return;

    const icon = createLineIconElement({ routeId: meta.id, code: meta.code, color: meta.color });
    if (!icon) return;

    // Keep spacing stable.
    icon.style.marginRight = '4px';

    left.prepend(icon);
};
