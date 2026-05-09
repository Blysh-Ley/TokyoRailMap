import { getCachedJson } from './fetch.js';
import { resolveMainLineIdByBranchRule } from './special-condition.js';

const toText = (v) => String(v ?? '').trim();

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
    const id = toText(routeId);
    if (!id) return 'default';

    if(
        id=='Toei.NipporiToneri'
    ) {
        return 'rectangle-border';
    }
    else if(
        id=='Toei.Arakawa'
    ){
        return 'arakawa';
    }
    else if(
        id=='JR-East.NaritaExpress'
    ){
        return 'nex';
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
        id.startsWith('Keio.')||
        id.startsWith('ChibaMonorail.')||
        id.startsWith('ToyoRapid.')||
        id.startsWith('SaitamaRailway.')||
        id=="Enoden.Enoden"
    ) {
        return 'circle-thin-border';
    }
    else if(
        id.startsWith('SaitamaTransit.')
    ){
        return 'hexagon'
    }
    else if(
        id.startsWith('Seibu.')
    ){
        return 'seibu';
    }
    else if(
        id.startsWith('Odakyu.')||
        id.startsWith('OdakyuHakone.')
    ){
        return 'odakyu';
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

const _trainSvgCache = new Map();

const getTrainSvgDataUrl = (fill, company, defaultColor = '#000') => {
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

    const dataUrl = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
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
        case 'arakawa' :{
            el.style.color =  '#000' 
            el.style.backgroundColor = 'transparent';
            el.style.backgroundImage = getTrainSvgDataUrl('#000', 'arakawa');
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundPosition = 'center';
            el.style.backgroundSize = 'contain';
            el.style.color = '#000';
            el.style.border = '0';
            el.style.borderRadius = '0';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '2px';

            // Reset mask fields in case this element style was previously masked.
            el.style.maskImage = 'none';
            el.style.maskRepeat = '';
            el.style.maskPosition = '';
            el.style.maskSize = '';
            el.style.setProperty('-webkit-mask-image', 'none');
            el.style.setProperty('-webkit-mask-repeat', '');
            el.style.setProperty('-webkit-mask-position', '');
            el.style.setProperty('-webkit-mask-size', '');
            if (code.length <= 1) {
                el.style.fontSize = '12px';
                el.style.letterSpacing = '0px';
            }else if (code.length === 2) {
                el.style.fontSize = '11px';
                el.style.letterSpacing = '-0.2px';
            }
            else {
                el.style.fontSize = '8px';
                el.style.letterSpacing = '-0.4px';
            }   
            break;

        }
        case 'hexagon': {
            el.style.backgroundColor = fillColor || (dark ? '#000' : '#fff');
            el.style.color = dark ? '#000' : '#fff';
            el.style.border = '0';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '1px';
            el.style.clipPath = 'polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)';
            el.style.fontWeight = 'bold';
            if (code.length <= 1) {
                el.style.fontSize = '12px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '11px';
                el.style.letterSpacing = '-0.2px';
            }
            else {
                el.style.fontSize = '8px';
                el.style.letterSpacing = '-0.4px';
            }   
            break;
        }
        case 'seibu': {
            const seibuColor = fillColor || (dark ? '#000' : '#fff');

            el.style.backgroundColor = 'transparent';
            el.style.backgroundImage = getTrainSvgDataUrl(seibuColor, 'seibu');
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundPosition = 'center';
            el.style.backgroundSize = 'contain';
            el.style.color = '#000';
            el.style.border = '0';
            el.style.borderRadius = '0';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '10px';

            // Reset mask fields in case this element style was previously masked.
            el.style.maskImage = 'none';
            el.style.maskRepeat = '';
            el.style.maskPosition = '';
            el.style.maskSize = '';
            el.style.setProperty('-webkit-mask-image', 'none');
            el.style.setProperty('-webkit-mask-repeat', '');
            el.style.setProperty('-webkit-mask-position', '');
            el.style.setProperty('-webkit-mask-size', '');

            // 文字叠在 SVG 之上
            el.style.fontWeight = '800';
            if (code.length <= 1) {
                el.style.fontSize = '10px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '9px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '7px';
                el.style.letterSpacing = '-0.4px';
            }

            break;
        }
        case 'odakyu': {
            const odakyuColor = fillColor || (dark ? '#000' : '#fff');

            el.style.backgroundColor = 'transparent';
            el.style.backgroundImage = getTrainSvgDataUrl(odakyuColor, 'odakyu');
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundPosition = 'center';
            el.style.backgroundSize = 'contain';
            el.style.color =fillColor || (dark ? '#000' : '#fff');
            el.style.border = '0';
            el.style.borderRadius = '0';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';
            el.style.paddingBottom = '-2px';

            // Reset mask fields in case this element style was previously masked.
            el.style.maskImage = 'none';
            el.style.maskRepeat = '';
            el.style.maskPosition = '';
            el.style.maskSize = '';
            el.style.setProperty('-webkit-mask-image', 'none');
            el.style.setProperty('-webkit-mask-repeat', '');
            el.style.setProperty('-webkit-mask-position', '');
            el.style.setProperty('-webkit-mask-size', '');

            // 文字叠在 SVG 之上
            el.style.fontWeight = '800';
            if (code.length <= 1) {
                el.style.fontSize = '10px';
                el.style.letterSpacing = '0px';
            } else if (code.length === 2) {
                el.style.fontSize = '9px';
                el.style.letterSpacing = '-0.2px';
            } else {
                el.style.fontSize = '7px';
                el.style.letterSpacing = '-0.4px';
            }

            break;
        }
        case 'nex': {
            el.style.backgroundColor = 'transparent';
            el.style.backgroundImage = getTrainSvgDataUrl('', 'nex');
            el.style.backgroundRepeat = 'no-repeat';
            el.style.backgroundPosition = 'center';
            el.style.backgroundSize = 'contain';
            el.style.color = '#fff';
            el.style.border = '0';
            el.style.borderRadius = '4px';
            el.style.width = '25px';
            el.style.height = '25px';
            el.style.padding = '0';

            // Reset mask fields in case this element style was previously masked.
            el.style.maskImage = 'none';
            el.style.maskRepeat = '';
            el.style.maskPosition = '';
            el.style.maskSize = '';
            el.style.setProperty('-webkit-mask-image', 'none');
            el.style.setProperty('-webkit-mask-repeat', '');
            el.style.setProperty('-webkit-mask-position', '');
            el.style.setProperty('-webkit-mask-size', '');

            // NEX 图标仅显示徽标，不叠加线路代码文字。
            el.textContent = '';

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
