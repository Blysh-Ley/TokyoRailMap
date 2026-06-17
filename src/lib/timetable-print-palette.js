import { getMacaronColor } from './macaron.js';

const DEFAULT_LINE_COLOR = '#3498db';
const CYBER_SURFACE_ALT = '#101827';
const CYBER_TEXT_DARK = '#06111F';
const toText = (value) => String(value ?? '').trim();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeHex = (value, fallback = DEFAULT_LINE_COLOR) => {
    const text = toText(value);
    const match = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/i);
    if (!match) return fallback;
    const raw = match[1];
    const hex = raw.length === 3
        ? raw.split('').map((char) => `${char}${char}`).join('')
        : raw;
    return `#${hex.toUpperCase()}`;
};
const hexToRgb = (value) => {
    const hex = normalizeHex(value).slice(1);
    return {
        r: Number.parseInt(hex.slice(0, 2), 16),
        g: Number.parseInt(hex.slice(2, 4), 16),
        b: Number.parseInt(hex.slice(4, 6), 16)
    };
};
const rgbToHex = ({ r, g, b }) => {
    const part = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();
    return `#${part(r)}${part(g)}${part(b)}`;
};
const rgbToHsl = ({ r, g, b }) => {
    const rr = r / 255;
    const gg = g / 255;
    const bb = b / 255;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (max === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
    return { h: (h + 360) % 360, s, l };
};
const hslToRgb = ({ h, s, l }) => {
    const hue = ((h % 360) + 360) % 360;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - chroma / 2;
    let rr = 0;
    let gg = 0;
    let bb = 0;
    if (hue < 60) [rr, gg, bb] = [chroma, x, 0];
    else if (hue < 120) [rr, gg, bb] = [x, chroma, 0];
    else if (hue < 180) [rr, gg, bb] = [0, chroma, x];
    else if (hue < 240) [rr, gg, bb] = [0, x, chroma];
    else if (hue < 300) [rr, gg, bb] = [x, 0, chroma];
    else [rr, gg, bb] = [chroma, 0, x];
    return {
        r: (rr + m) * 255,
        g: (gg + m) * 255,
        b: (bb + m) * 255
    };
};
const withAlpha = (value, alphaHex) => `${normalizeHex(value)}${toText(alphaHex).padStart(2, '0').slice(0, 2)}`;
const toCyberNeon = (value, hueShift = 0) => {
    const { h } = rgbToHsl(hexToRgb(value));
    return rgbToHex(hslToRgb({
        h: h + hueShift,
        s: 0.96,
        l: 0.62
    }));
};
const resolveMacaronColor = (color) => {
    try {
        return getMacaronColor(color).macaron;
    } catch {
        return getMacaronColor(DEFAULT_LINE_COLOR).macaron;
    }
};

export const resolveTimetablePrintPalette = ({
    lineColor = '',
    serviceDayColorMode = '',
    isDarkTheme = false
} = {}) => {
    const safeLineColor = toText(lineColor) || DEFAULT_LINE_COLOR;
    const macaronColor = resolveMacaronColor(safeLineColor);
    const useComplementaryServiceDayColor = toText(serviceDayColorMode) === 'complementary';
    const baseServiceDayAccentColor = useComplementaryServiceDayColor ? macaronColor.complementary : macaronColor.hex;
    const baseServiceDayAccentTextColor = useComplementaryServiceDayColor ? macaronColor.complementaryText : macaronColor.textColor;
    const serviceDayPalette = useComplementaryServiceDayColor ? resolveMacaronColor(baseServiceDayAccentColor) : macaronColor;
    const baseSpecialTripColor = useComplementaryServiceDayColor ? serviceDayPalette.complementary : macaronColor.complementary;
    const baseSpecialTripTextColor = useComplementaryServiceDayColor ? serviceDayPalette.complementaryText : macaronColor.complementaryText;

    if (isDarkTheme) {
        const baseNeonColor = toCyberNeon(safeLineColor);
        const complementaryNeonColor = toCyberNeon(safeLineColor, 175);
        const serviceDayAccentColor = useComplementaryServiceDayColor ? complementaryNeonColor : baseNeonColor;
        const rightAccentColor = useComplementaryServiceDayColor ? baseNeonColor : complementaryNeonColor;

        return {
            lineColor: safeLineColor,
            macaronColor,
            serviceDayAccentColor,
            serviceDayAccentTextColor: CYBER_TEXT_DARK,
            serviceDayHourColor: serviceDayAccentColor,
            serviceDayHourTextColor: CYBER_TEXT_DARK,
            specialTripColor: rightAccentColor,
            specialTripTextColor: CYBER_TEXT_DARK,
            gridBaseTripsColor: CYBER_SURFACE_ALT,
            gridHeaderTripsColor: serviceDayAccentColor,
            gridRowTripsColor: withAlpha(serviceDayAccentColor, '30'),
            rightGridHeaderTripsColor: rightAccentColor,
            rightGridRowTripsColor: withAlpha(rightAccentColor, '34'),
            rightPaneTextColor: CYBER_TEXT_DARK,
            rightServiceDayAccentColor: rightAccentColor
        };
    }

    const serviceDayAccentColor = baseServiceDayAccentColor;
    const serviceDayAccentTextColor = baseServiceDayAccentTextColor;

    return {
        lineColor: safeLineColor,
        macaronColor,
        serviceDayAccentColor,
        serviceDayAccentTextColor,
        serviceDayHourColor: serviceDayPalette.ink,
        serviceDayHourTextColor: serviceDayPalette.inkText,
        specialTripColor: baseSpecialTripColor,
        specialTripTextColor: baseSpecialTripTextColor,
        gridBaseTripsColor: '#fff',
        gridHeaderTripsColor: `${serviceDayAccentColor}5f`,
        gridRowTripsColor: `${serviceDayAccentColor}46`,
        rightGridHeaderTripsColor: `${macaronColor.complementary}73`,
        rightGridRowTripsColor: `${macaronColor.complementary}52`,
        rightPaneTextColor: macaronColor.complementaryText
    };
};
