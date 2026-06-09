const defaultToText = (value) => String(value ?? '').trim();

export const panelIsDarkThemeActive = ({
    documentRef = globalThis.document
} = {}) => {
    try {
        return documentRef?.documentElement?.getAttribute?.('data-theme') === 'dark';
    } catch {
        return false;
    }
};

export const panelParseCssColorToRgb = (input) => {
    const value = String(input || '').trim();
    if (!value) return null;

    const hex = value.match(/^#([0-9a-fA-F]{3,8})$/);
    if (hex) {
        const raw = hex[1];
        if (raw.length === 3 || raw.length === 4) {
            return {
                r: parseInt(raw[0] + raw[0], 16),
                g: parseInt(raw[1] + raw[1], 16),
                b: parseInt(raw[2] + raw[2], 16)
            };
        }
        if (raw.length === 6 || raw.length === 8) {
            return {
                r: parseInt(raw.slice(0, 2), 16),
                g: parseInt(raw.slice(2, 4), 16),
                b: parseInt(raw.slice(4, 6), 16)
            };
        }
    }

    const rgb = value.match(/^rgba?\(\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*,\s*([0-9]+(?:\.[0-9]+)?)(?:\s*,\s*([0-9]+(?:\.[0-9]+)?))?\s*\)$/i);
    if (!rgb) return null;

    return {
        r: Math.max(0, Math.min(255, Math.round(Number(rgb[1])))),
        g: Math.max(0, Math.min(255, Math.round(Number(rgb[2])))),
        b: Math.max(0, Math.min(255, Math.round(Number(rgb[3]))))
    };
};

export const panelRgbToHex = ({ r, g, b }) => {
    const to2 = (value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))).toString(16).padStart(2, '0');
    return `#${to2(r)}${to2(g)}${to2(b)}`;
};

export const panelRelativeLuminance = ({ r, g, b }) => {
    const toLinear = (value) => {
        const normalized = Math.max(0, Math.min(255, Number(value) || 0)) / 255;
        return normalized <= 0.03928 ? (normalized / 12.92) : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };

    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
};

export const getPanelDarkInvertTriggerLuminance = () => {
    const reference = panelParseCssColorToRgb('#005AAA');
    return reference ? panelRelativeLuminance(reference) : 0.102;
};

export const panelAdjustColorForDarkThemeIfNeeded = (color, {
    toText = defaultToText,
    invertTriggerLuminance = getPanelDarkInvertTriggerLuminance()
} = {}) => {
    const parsed = panelParseCssColorToRgb(color);
    if (!parsed) return toText(color);

    const luminance = panelRelativeLuminance(parsed);
    if (!(luminance < invertTriggerLuminance)) return toText(color);

    return panelRgbToHex({
        r: 255 - parsed.r,
        g: 255 - parsed.g,
        b: 255 - parsed.b
    });
};

export const resolveTrainTypeColorForTheme = (color, {
    toText = defaultToText,
    isDarkTheme = panelIsDarkThemeActive()
} = {}) => {
    const raw = toText(color);
    if (!raw) return raw;
    if (!isDarkTheme) return raw;
    return panelAdjustColorForDarkThemeIfNeeded(raw, { toText });
};

export const resolvePanelBadgeTextColor = (bgColor) => {
    const parsed = panelParseCssColorToRgb(bgColor);
    if (!parsed) return '#fff';
    return panelRelativeLuminance(parsed) > 0.55 ? '#111' : '#fff';
};
