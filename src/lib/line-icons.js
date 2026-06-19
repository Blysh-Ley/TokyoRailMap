import { getCachedJson, getCompanyLogoCandidates } from './fetch.js';
import { resolveMainLineIdByBranchRule } from './special-condition.js';
import { renderLineIconSvg } from '../ui/lineIconSvgView.js';
import { renderStationBadgeSvg } from '../ui/stationBadgeSvgView.js';
import { lineIconSettings } from '../config/lineIconSettings.js';

const toText = (v) => String(v ?? '').trim();
const LINE_COMPANY_SETTINGS = Array.isArray(lineIconSettings.companies) ? lineIconSettings.companies : [];
const LINE_ICON_SETTINGS = lineIconSettings.lineIcon || {};
const LINE_ICON_DESIGNS = lineIconSettings.lineIconDesigns || {};
const STATION_BADGE_SETTINGS = lineIconSettings.stationBadge || lineIconSettings.stationCodeBadge || {};
const STATION_BADGE_DESIGNS = lineIconSettings.stationBadgeDesigns || STATION_BADGE_SETTINGS.designs || {};
const DEFAULT_STATION_BADGE_DESIGN_NAME = STATION_BADGE_SETTINGS.defaultDesign || 'split-rectangle';
const DEFAULT_STATION_BADGE_DESIGN = STATION_BADGE_DESIGNS[DEFAULT_STATION_BADGE_DESIGN_NAME] || lineIconSettings.stationCodeBadge || {};
const LINE_ICON_CLASS = LINE_ICON_SETTINGS.className || 'rw-line-icon';
const STATION_BADGE_CLASS_NAMES = DEFAULT_STATION_BADGE_DESIGN.classNames || STATION_BADGE_SETTINGS.classNames || {};
const STATION_BADGE_ROOT_CLASS = STATION_BADGE_CLASS_NAMES.root || 'rw-station-code-badge';

const resolveStationStyleValue = (value, context = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('dark' in value || 'light' in value) return context.dark ? value.dark : value.light;
        return value;
    }
    if (typeof value !== 'string') return value;
    if (Object.prototype.hasOwnProperty.call(context, value)) return context[value];
    return value.replace(/\b(lineColor|fillColor|borderColor|prefixBackground|prefixText)\b/g, (token) => (
        Object.prototype.hasOwnProperty.call(context, token) ? toText(context[token]) : token
    ));
};

const resolveStationStyleMap = (styles = {}, context = {}) => {
    const resolved = {};
    for (const [key, value] of Object.entries(styles || {})) {
        resolved[key] = resolveStationStyleValue(value, context);
    }
    return resolved;
};

const getStationStyleValue = (styles = {}, keys = []) => {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(styles || {}, key)) continue;
        const value = toText(styles[key]);
        if (value) return value;
    }
    return '';
};

const parseCssBorder = (value) => {
    const raw = toText(value);
    if (!raw) return {};
    const width = raw.match(/(?:^|\s)(\d+(?:\.\d+)?(?:px|em|rem)?)(?=\s|$)/i)?.[1] || '';
    const styleWords = new Set(['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
    const color = raw
        .split(/\s+/)
        .filter(Boolean)
        .filter((part) => part !== width && !styleWords.has(part.toLowerCase()))
        .join(' ');
    return { width, color };
};

const pickByCodeLength = (rules = [], length = 0, fallback = null) => {
    for (const rule of Array.isArray(rules) ? rules : []) {
        if (!rule || typeof rule !== 'object') continue;
        const max = Number(rule.max);
        if (Number.isFinite(max) && length > max) continue;
        const { max: _max, ...style } = rule;
        return style;
    }
    return fallback;
};

const routeIdMatches = (id, match = {}) => {
    const routeIds = Array.isArray(match.routeIds) ? match.routeIds.map(toText) : [];
    if (routeIds.includes(id)) return true;

    const routePrefixes = Array.isArray(match.routePrefixes) ? match.routePrefixes.map(toText).filter(Boolean) : [];
    return routePrefixes.some((prefix) => id.startsWith(prefix));
};

const selectLineIconConfig = (routeId, code) => {
    const id = toText(routeId);
    if (!id) return { design: LINE_ICON_SETTINGS.emptyRouteDesign || 'default' };

    for (const company of LINE_COMPANY_SETTINGS) {
        if (!routeIdMatches(id, company?.match)) continue;
        const config = company?.lineIcon && typeof company.lineIcon === 'object' ? company.lineIcon : {};
        const design = toText(config.design) || toText(config.preset);
        if (design) return { ...config, design };
    }

    return { design: LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border' };
};

const getLineIconImageConfig = (lineIconConfig = {}) => {
    const imageSource = lineIconConfig.image && typeof lineIconConfig.image === 'object'
        ? lineIconConfig.image
        : lineIconConfig;
    const result = {};

    for (const key of ['logo', 'companyLogo', 'href', 'src', 'url', 'fit', 'sizing', 'aspectRatio', 'naturalWidth', 'naturalHeight']) {
        if (!Object.prototype.hasOwnProperty.call(imageSource || {}, key)) continue;
        const value = imageSource[key];
        if (value == null || value === '') continue;
        result[key] = value;
    }

    return Object.keys(result).length ? result : null;
};

const getLineIconImageConfigFromDataset = (el) => {
    if (!(el instanceof HTMLElement)) return null;
    const result = {};
    const map = {
        lineIconLogo: 'logo',
        lineIconCompanyLogo: 'companyLogo',
        lineIconHref: 'href',
        lineIconSrc: 'src',
        lineIconUrl: 'url',
        lineIconFit: 'fit',
        lineIconSizing: 'sizing',
        lineIconAspectRatio: 'aspectRatio',
        lineIconNaturalWidth: 'naturalWidth',
        lineIconNaturalHeight: 'naturalHeight'
    };

    for (const [datasetKey, configKey] of Object.entries(map)) {
        const value = toText(el.dataset[datasetKey]);
        if (!value) continue;
        result[configKey] = value;
    }

    return Object.keys(result).length ? result : null;
};

const applyLineIconConfigDataset = (el, lineIconConfig = {}) => {
    if (!(el instanceof HTMLElement)) return;
    const imageConfig = getLineIconImageConfig(lineIconConfig) || {};
    const map = {
        logo: 'lineIconLogo',
        companyLogo: 'lineIconCompanyLogo',
        href: 'lineIconHref',
        src: 'lineIconSrc',
        url: 'lineIconUrl',
        fit: 'lineIconFit',
        sizing: 'lineIconSizing',
        aspectRatio: 'lineIconAspectRatio',
        naturalWidth: 'lineIconNaturalWidth',
        naturalHeight: 'lineIconNaturalHeight'
    };

    for (const [configKey, datasetKey] of Object.entries(map)) {
        const value = toText(imageConfig[configKey]);
        if (value) {
            el.dataset[datasetKey] = value;
        } else {
            delete el.dataset[datasetKey];
        }
    }
};

const getStationBadgeDesign = (designName) => {
    const name = toText(designName) || DEFAULT_STATION_BADGE_DESIGN_NAME;
    return STATION_BADGE_DESIGNS[name] || DEFAULT_STATION_BADGE_DESIGN || {};
};

const getLineIconDesign = (designName) => {
    const name = toText(designName);
    const fallbackName = LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border';
    return LINE_ICON_DESIGNS[name] || LINE_ICON_DESIGNS[fallbackName] || LINE_ICON_DESIGNS.default || null;
};

const shouldReuseLineIconFrameForStationBadge = (design = {}) => {
    const frame = design?.frame || {};
    return design?.reuseLineIconFrame === true ||
        frame.reuseLineIconFrame === true ||
        toText(frame.source) === 'line-icon';
};

const resolveLineIconFrameForStationBadge = ({
    stationBadgeDesign,
    routeId,
    code,
    routeColor,
    borderColor
} = {}) => {
    if (!shouldReuseLineIconFrameForStationBadge(stationBadgeDesign)) return null;

    const frame = stationBadgeDesign?.frame || {};
    const lineIconConfig = selectLineIconConfig(routeId, code);
    const preset = toText(frame.preset || frame.lineIconDesign) || toText(lineIconConfig.design) || selectLineIconPreset(routeId, code);
    const design = getLineIconDesign(preset);
    if (!design?.shape && !design?.image) return null;

    const dark = isDarkThemeActive();
    const fillColor = resolveLineColorForTheme(routeColor) || routeColor || borderColor || '#888';
    const frameBorderColor = resolveBorderColorForTheme(routeColor) || routeColor || borderColor || 'transparent';
    const trainIconConfig = design?.image || null;
    const imageConfig = getLineIconImageConfig(frame.image || lineIconConfig);
    const effectiveTrainIconConfig = trainIconConfig
        ? {
            ...(trainIconConfig || {}),
            ...(imageConfig || {}),
            attrs: {
                ...(trainIconConfig?.attrs || {}),
                ...(imageConfig?.attrs || {})
            },
            style: {
                ...(trainIconConfig?.style || {}),
                ...(imageConfig?.style || {})
            }
        }
        : null;
    const trainIconHref = trainIconConfig
        ? resolveImageHref(effectiveTrainIconConfig, fillColor, preset)
        : '';

    return {
        design,
        preset,
        borderColor: frameBorderColor,
        fillColor,
        backgroundColor: dark ? 'rgba(28, 28, 28, 0.94)' : '#fff',
        trainIconHref,
        imageConfig
    };
};

export const removeCompanyAbbFromLineName = (lineName, abb, { lineId = '', normalize = toText } = {}) => {
    const name = normalize(lineName);
    const companyAbb = normalize(abb);
    if (!name) return normalize(lineId);
    if (!companyAbb) return name;
    if (name === normalize(lineId) || name.includes('.')) return name;
    if (['线', '本线', '新线', '\u7dda', '\u672c\u7dda', '\u65b0\u7dda'].some((suffix) => name === `${companyAbb}${suffix}`)) return name;
    return normalize(name.replace(companyAbb, '')) || name;
};

const splitStationCodeForBadge = (code, design = null) => {
    const c = toText(code);
    const pattern = toText(design?.splitPattern) || toText(STATION_BADGE_SETTINGS.splitPattern) || '^([A-Za-z]+)(.+)$';
    const match = c.match(new RegExp(pattern));
    if (!match) return { prefix: c, suffix: '' };
    return { prefix: match[1], suffix: match[2] };
};

export const normalizeStationCodeBadgeCodes = (code) => {
    const c = toText(code);
    if (!c) return [];

    const seen = new Set();
    const values = c
        .split(/[,/]/)
        .map(toText)
        .filter(Boolean)
        .filter((value) => {
            if (seen.has(value)) return false;
            seen.add(value);
            return true;
        });

    return values.length ? values : [c];
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

    return resolveMainLineIdByBranchRule(id, exists) || id;
};



export const selectLineIconPreset = (routeId, code) => {
    return toText(selectLineIconConfig(routeId, code).design) ||
        LINE_ICON_SETTINGS.defaultDesign ||
        'rectangle-border';
};

export const selectStationBadgeDesign = (routeId, code) => {
    const id = toText(routeId);
    if (!id) return STATION_BADGE_SETTINGS.emptyRouteDesign || DEFAULT_STATION_BADGE_DESIGN_NAME;

    for (const company of LINE_COMPANY_SETTINGS) {
        if (!routeIdMatches(id, company?.match)) continue;
        const design = toText(company?.stationBadge?.design);
        if (design) return design;
    }

    return STATION_BADGE_SETTINGS.defaultDesign || DEFAULT_STATION_BADGE_DESIGN_NAME;
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

const getReadableTextColorForBackground = (color) => {
    const parsed = parseCssColorToRgb(color);
    if (!parsed) return '#fff';
    return relativeLuminance(parsed) > 0.55 ? '#000' : '#fff';
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

const _trainSvgCache = new Map();

const resolveImageHref = (imageConfig = {}, fill = '', preset = '') => {
    if (!imageConfig) return '';

    const directHref = toText(imageConfig.href || imageConfig.src || imageConfig.url);
    if (directHref) return directHref;

    const logoFile = toText(imageConfig.logo || imageConfig.companyLogo);
    if (logoFile) return getCompanyLogoCandidates(logoFile)[0] || logoFile;

    const brand = toText(imageConfig.brand || preset);
    if (!brand) return '';
    const imageFill = imageConfig.fill === 'lineColor'
        ? (fill || '#000')
        : toText(imageConfig.fill);
    return getTrainSvgDataHref(imageFill, brand);
};

const getTrainSvgDataHref = (fill, company, defaultColor = '#000') => {
    const color = toText(fill) || defaultColor;
    const brand = toText(company).toLowerCase();
    const cacheKey = `train_${brand}_${color}`;

    if (_trainSvgCache.has(cacheKey)) return _trainSvgCache.get(cacheKey);

    const safeFill = color.replace(/"/g, '&quot;');
    let svg = '';

        if (brand === 'odakyu') {
        // 外圈使用 fillColor，内部白底固定白色
        svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="105.72" height="106.48" viewBox="0 0 105.72 106.48">
  <path fill="${safeFill}" d="M108,55.24c0,36.43-20.52,53.24-52.86,53.24-32.06,0-52.86-16.81-52.86-53.24C2.28,19.86,23.08,2,55.14,2,87.48,2,108,19.48,108,55.24Z" transform="translate(-2.28 -2)"/>
  <path fill="#FFFFFF" d="M94.18,55.25c0,28.63-13.35,39.51-39.23,39.51S15.72,84.07,15.72,55.25c0-27.41,13.44-39.52,39.23-39.52C80.26,15.73,94.18,26.7,94.18,55.25Z" transform="translate(-2.28 -2)"/>
</svg>`;
        } else if (brand === 'nex') {
                svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="64.492188mm" height="64.492188mm" viewBox="0 0 64.492187 64.492187" version="1.1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(-7.937503,-7.937503)">
        <rect style="display:inline;fill:#ff0000;fill-opacity:1;stroke:#ff0000;stroke-width:0.115812;stroke-linecap:square;stroke-dasharray:none;stroke-opacity:1" width="64.376373" height="64.376373" x="7.995409" y="7.995409"/>
    </g>
    <g transform="translate(-7.937503,-7.937503)">
        <path style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0992187;stroke-dasharray:none;stroke-opacity:1" d="m 11.910618,39.312146 39.218276,-3.463669 14.922052,-14.892802 -0.0098,8.85697 -5.034364,5.082863 5.035477,-0.303955 -0.0011,9.029304 -5.020484,-0.375036 4.9892,4.972906 0.03665,8.888254 L 51.12892,42.427617 Z"/>
    </g>
    <g transform="translate(-519.8682,114.84832)">
        <path style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0966675;stroke-dasharray:none;stroke-opacity:1" d="m 523.88532,-66.782095 1.93612,0.0064 0.0281,-5.535806 5.4518,5.529438 h 1.4169 l -0.003,-8.81015 -1.90484,-0.01593 -0.006,5.558104 -5.5425,-5.507139 -1.36999,-0.01593 z"/>
        <path style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0942312;stroke-dasharray:none;stroke-opacity:1" d="m 533.30985,-75.609739 v 1.819472 l 1.82247,-1.817285 z"/>
        <path style="display:inline;fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0986585;stroke-dasharray:none;stroke-opacity:1" d="m 535.80645,-75.607581 h 8.79353 l 0.023,1.973453 -6.78976,-0.009 -0.009,1.42377 6.78516,0.01802 0.005,1.973456 -6.78976,-0.009 -0.005,1.495858 6.78516,0.0045 0.005,1.950924 -8.81657,0.009 z"/>
        <path style="fill:#ffffff;fill-opacity:1;stroke:#ffffff;stroke-width:0.0977648;stroke-dasharray:none;stroke-opacity:1" d="m 556.75832,-75.585343 -2.7461,-0.02252 -2.95019,3.003691 -3.05323,-2.99018 -2.70992,-0.0045 4.38786,4.339118 -4.40143,4.461039 2.69634,0.01351 3.09393,-3.09904 3.14927,3.108048 2.73253,-0.009 -4.54001,-4.488034 z"/>
        <path style="fill:#ff0000;fill-opacity:1;stroke:#ff0000;stroke-width:0.0986635;stroke-linecap:square;stroke-dasharray:none;stroke-opacity:1" d="m 551.06167,-72.604479 -1.37337,1.345016 1.38688,1.373972 1.34241,-1.386833 z"/>
    </g>
</svg>`;
    } else if (brand === 'seibu') {
        // seibu: 外圈用 fillColor，内部白区固定白色
        svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 110 110">
  <g>
    <path fill="${safeFill}" d="M95.8,110.2H84.6L71.3,93.5H38.7l-13.2,16.7H14.2l20-24.9c-3-0.4-6-1-9-1.6c-3.5-6.5-5.6-14.1-5.6-22.2V17.9c0-6.8,5.1-12.5,11.6-13.4h47.7c6.5,0.9,11.6,6.6,11.6,13.4v43.6c0,8-2.2,15.6-5.6,22.2c-2.9,0.6-6,1.3-9,1.8L95.8,110.2z"/>
    <path fill="#FFFFFF" d="M83.2,37.2c0,15.6-12.6,28.2-28.2,28.2c-15.6,0-28.2-12.6-28.2-28.2V19.9c0-5.6,4.6-10.2,10.2-10.2h36c5.6,0,10.2,4.6,10.2,10.2V37.2z"/>
    <path fill="#FFFFFF" d="M40.1,68.4c0-3-2.3-5.2-5.1-5.2c-2.8,0-5.1,2.2-5.1,5.2c0,2.7,2.3,5.1,5.1,5.1C37.9,73.4,40.1,71.1,40.1,68.4"/>
    <path fill="#FFFFFF" d="M75,73.4c2.8,0,5.1-2.4,5.1-5.1c0-3-2.3-5.2-5.1-5.2c-2.8,0-5.1,2.2-5.1,5.2C69.9,71.1,72.2,73.4,75,73.4"/>
  </g>
</svg>`;
    }else if(brand === 'arakawa'){
        svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="144" height="144" viewBox="0 0 144 144" xmlns="http://www.w3.org/2000/svg">
    <path id="path1" fill="#d75b80" stroke="none" d="M 144 72 C 144 111.764503 111.764503 144 72 144 C 32.235497 144 0 111.764503 0 72 C 0 32.235497 32.235497 0 72 0 C 111.764503 0 144 32.235497 144 72 Z"/>
    <path id="path2" fill="#ffffff" stroke="none" d="M 67.73333 12.800003 C 67.73333 12.800003 68.897827 15.199997 72 15.199997 C 75.102173 15.199997 76.26667 12.800003 76.26667 12.800003 C 84.474815 17.866508 93.134239 25.228203 96.4375 38.362511 C 109.950806 37.444641 119.627975 43.406815 126.983345 49.647919 C 126.983345 49.647919 125.06221 51.497581 126.020836 54.447914 C 126.979462 57.398262 129.620834 57.764587 129.620834 57.764587 C 127.338646 67.137108 123.013664 77.647575 111.541664 84.847916 C 116.590446 97.416199 113.910614 108.461449 110.247917 117.385414 C 110.247917 117.385414 107.895126 116.12867 105.385414 117.952087 C 102.875702 119.775497 103.345833 122.402084 103.345833 122.402084 C 93.726799 123.127869 82.392982 122.262573 72 113.577087 C 61.607018 122.262573 50.273193 123.127869 40.654167 122.402084 C 40.654167 122.402084 41.124302 119.775497 38.614582 117.952087 C 36.104874 116.12867 33.752087 117.385414 33.752087 117.385414 C 30.089376 108.461449 27.409557 97.416199 32.458336 84.847916 C 20.986336 77.647575 16.661354 67.137108 14.379168 57.764587 C 14.379168 57.764587 17.020544 57.398262 17.979168 54.447914 C 18.937794 51.497581 17.016672 49.647919 17.016672 49.647919 C 24.372032 43.406815 34.049206 37.444641 47.562496 38.362511 C 50.865772 25.228203 59.525185 17.866508 67.73333 12.800003"/>
</svg>`
    }

    const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    _trainSvgCache.set(cacheKey, dataUrl);
    return dataUrl;
};

let _routesIndexPromise = null;
let _routesIndex = null;
let _railwayColorIndexPromise = null;
let _railwayColorIndex = null;

export const getRoutesIndex = async (url = './data/railways.json') => {
    if (_routesIndex instanceof Map) return _routesIndex;
    if (_routesIndexPromise) return _routesIndexPromise;

    _routesIndexPromise = (async () => {
        try {
            const list = await getCachedJson(url);
            const map = new Map();
            for (const row of Array.isArray(list) ? list : []) {
                const id = toText(row?.id);
                if (!id) continue;
                const code = toText(row?.code);
                const rawColor = toText(row?.color);
                const color = rawColor ? (rawColor.startsWith('#') ? rawColor : `#${rawColor}`) : '';
                map.set(id, { id, code, color });
            }
            _routesIndex = map;
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
            const map = new Map();
            const index = await getRoutesIndex(url);
            for (const [id, meta] of index.entries()) {
                const raw = toText(meta?.color);
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
    const darkBackground = dark ? 'rgba(28, 28, 28, 0.94)' : '#fff';
    const designConfig = LINE_ICON_DESIGNS[preset] || LINE_ICON_DESIGNS[LINE_ICON_SETTINGS.defaultDesign] || null;
    const imageConfig = getLineIconImageConfigFromDataset(el);
    const trainIconConfig = designConfig?.image
        ? {
            ...(designConfig.image || {}),
            ...(imageConfig || {}),
            attrs: {
                ...(designConfig.image?.attrs || {}),
                ...(imageConfig?.attrs || {})
            },
            style: {
                ...(designConfig.image?.style || {}),
                ...(imageConfig?.style || {})
            }
        }
        : null;
    const trainIconHref = trainIconConfig
        ? resolveImageHref(trainIconConfig, fillColor, preset)
        : '';

    renderLineIconSvg(el, {
        code,
        preset,
        borderColor: borderColor || 'transparent',
        fillColor: fillColor || (dark ? '#000' : '#fff'),
        backgroundColor: darkBackground,
        dark,
        trainIconHref,
        imageConfig
    });
};

const applyStationCodeBadgeStyleForTheme = (el) => {
    if (!(el instanceof HTMLElement)) return;

    const code = toText(el.dataset.code);
    if (!code) return;

    const routeColor = toText(el.dataset.lineColor);
    const fillColor = resolveLineColorForTheme(routeColor) || routeColor;
    const designName = toText(el.dataset.stationBadgeDesign) || selectStationBadgeDesign(el.dataset.routeId, code);
    const design = getStationBadgeDesign(designName);
    const classNames = design.classNames || {};
    const styleConfig = design.html || design.style || {};
    const rawRootStyle = styleConfig.rootStyle || styleConfig.root || {};
    const rawPrefixStyle = styleConfig.prefixStyle || styleConfig.prefix || {};
    const rawSuffixStyle = styleConfig.suffixStyle || styleConfig.suffix || {};
    const colors = design.colors || {};
    const baseStyleContext = {
        lineColor: routeColor,
        fillColor,
        borderColor: routeColor,
        dark: isDarkThemeActive()
    };
    const rootStyleBase = resolveStationStyleMap(rawRootStyle, baseStyleContext);
    const prefixStyleBase = resolveStationStyleMap(rawPrefixStyle, baseStyleContext);
    const suffixStyleBase = resolveStationStyleMap(rawSuffixStyle, baseStyleContext);
    const rootBorder = parseCssBorder(rootStyleBase.border);
    const configuredDesignBorder = resolveStationStyleValue(design.borderColor, baseStyleContext);
    const configuredBorder = resolveStationStyleValue(colors.border, baseStyleContext);
    const borderSource =
        toText(configuredDesignBorder) ||
        toText(configuredBorder) ||
        getStationStyleValue(rootStyleBase, ['borderColor']) ||
        rootBorder.color ||
        routeColor;
    const borderColor = resolveBorderColorForTheme(borderSource) || borderSource || 'transparent';
    const borderWidth =
        toText(design.borderWidth) ||
        toText(colors.borderWidth) ||
        toText(styleConfig.borderWidth) ||
        getStationStyleValue(rootStyleBase, ['borderWidth']) ||
        rootBorder.width ||
        '2px';
    const prefixStyleBackground = getStationStyleValue(prefixStyleBase, ['backgroundColor', 'background']);
    const rawPrefixBackground = resolveStationStyleValue(colors.prefixBackground, {
        ...baseStyleContext,
        borderColor
    });
    const prefixBackground = toText(rawPrefixBackground) === 'lineColor'
        ? routeColor
        : toText(rawPrefixBackground) === 'fillColor'
            ? fillColor
            : toText(rawPrefixBackground) === 'borderColor'
            ? borderColor
            : toText(rawPrefixBackground) || prefixStyleBackground || borderColor;
    const prefixTextColor = getReadableTextColorForBackground(prefixBackground || borderColor);
    const rawPrefixText = resolveStationStyleValue(colors.prefixText, {
        ...baseStyleContext,
        borderColor,
        prefixBackground
    });
    const prefixText = toText(rawPrefixText) === 'readableOnPrefixBackground'
        ? getReadableTextColorForBackground(prefixBackground)
        : toText(rawPrefixText) || getStationStyleValue(prefixStyleBase, ['fill', 'color']) || prefixTextColor;
    const styleContext = {
        lineColor: routeColor,
        fillColor,
        borderColor,
        prefixBackground,
        prefixText,
        dark: isDarkThemeActive()
    };
    const rootStyle = resolveStationStyleMap(rawRootStyle, styleContext);
    const prefixStyle = resolveStationStyleMap(rawPrefixStyle, styleContext);
    const suffixStyle = resolveStationStyleMap(rawSuffixStyle, styleContext);
    const backgroundColor =
        getStationStyleValue(rootStyle, ['fill', 'backgroundColor', 'background']) ||
        '#fff';
    const suffixText =
        getStationStyleValue(suffixStyle, ['fill', 'color']) ||
        getStationStyleValue(rootStyle, ['fill', 'color']) ||
        '#000';
    const lengthStyle = resolveStationStyleMap(
        pickByCodeLength(design.fontSizeByCodeLength || STATION_BADGE_SETTINGS.fontSizeByCodeLength, code.length, {}),
        styleContext
    );
    const { prefix, suffix } = splitStationCodeForBadge(code, design);
    const lineIconFrame = resolveLineIconFrameForStationBadge({
        stationBadgeDesign: design,
        routeId: el.dataset.routeId,
        code,
        routeColor,
        borderColor
    });
    const muted = toText(el.dataset.stationBadgeMuted) === '1';
    const mutedColor = isDarkThemeActive() ? '#777d86' : '#c3c7cd';

    renderStationBadgeSvg(el, {
        code,
        prefix,
        suffix,
        design: {
            ...design,
            html: {
                ...(design.html || {}),
                rootStyle,
                prefixStyle,
                suffixStyle
            }
        },
        borderColor,
        borderWidth,
        backgroundColor,
        prefixBackground,
        prefixText,
        suffixText,
        classNames,
        lineIconFrame,
        muted,
        mutedColor,
        rootStyle: lengthStyle
    });
};

export const createStationCodeBadgeElement = ({ code, color, routeId = '', design = '', muted = false }) => {
    const c = toText(code);
    if (!c) return null;

    const id = toText(routeId);
    const designName = toText(design) || selectStationBadgeDesign(id, c);
    const designConfig = getStationBadgeDesign(designName);
    const classNames = designConfig.classNames || {};
    const rootClass = classNames.root || STATION_BADGE_ROOT_CLASS;

    const el = document.createElement('span');
    el.className = rootClass;
    el.dataset.code = c;
    el.dataset.lineColor = toText(color);
    el.dataset.routeId = id;
    el.dataset.stationBadgeDesign = designName;
    if (muted) el.dataset.stationBadgeMuted = '1';

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
            document.querySelectorAll(`.${LINE_ICON_CLASS}`).forEach((el) => applyIconStyleForTheme(el));
            document.querySelectorAll('[data-station-badge-design]').forEach((el) => applyStationCodeBadgeStyleForTheme(el));
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
    el.className = LINE_ICON_CLASS;

    el.dataset.routeId = resolvedId;
    el.dataset.sourceRouteId = id;
    el.dataset.code = c;
    el.dataset.routeColor = resolvedColor;
    const lineIconConfig = selectLineIconConfig(resolvedId, c);
    el.dataset.preset = toText(lineIconConfig.design) || selectLineIconPreset(resolvedId, c);
    applyLineIconConfigDataset(el, lineIconConfig);

    applyIconStyleForTheme(el);
    ensureThemeObserver();

    return el;
};

export const prependLineIconElements = (targetEl, {
    routeId,
    codes = [],
    color = ''
} = {}) => {
    if (!(targetEl instanceof HTMLElement)) return [];
    if (targetEl.querySelector(`.${LINE_ICON_CLASS}`)) return [];

    const iconNodes = [];
    for (const code of Array.isArray(codes) ? codes : []) {
        const cleanCode = toText(code);
        if (!cleanCode) continue;
        const baseRouteId = toText(routeId);
        const iconRouteId = baseRouteId ? `${baseRouteId}.${cleanCode}` : cleanCode;
        const icon = createLineIconElement({ routeId: iconRouteId, code: cleanCode, color });
        if (!icon) continue;
        icon.style.marginRight = '4px';
        iconNodes.push(icon);
    }

    for (let i = iconNodes.length - 1; i >= 0; i -= 1) {
        targetEl.prepend(iconNodes[i]);
    }

    return iconNodes;
};

export const ensureLineIconForRwLineContent = async (rwLineContentEl, routeId) => {
    if (!(rwLineContentEl instanceof HTMLElement)) return;

    // Try to find the left container; fall back to the anchor itself.
    const left =
        rwLineContentEl.querySelector('.RW-line-left') ||
        rwLineContentEl.querySelector('.rw-line-left') ||
        rwLineContentEl;

    if (left.querySelector(`.${LINE_ICON_CLASS}`)) return;

    const meta = await getResolvedRouteIconMeta(routeId);
    if (!meta || (!meta.code && !meta.color)) return;

    const icon = createLineIconElement({ routeId: meta.id, code: meta.code, color: meta.color });
    if (!icon) return;

    // Keep spacing stable.
    icon.style.marginRight = '4px';

    left.prepend(icon);
};
