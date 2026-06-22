import { createLineIconFrameNode, getFittedFrameViewBox } from './lineIconSvgView.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STATION_BADGE_FONT_FAMILY = 'Arial, Helvetica, sans-serif';

const toText = (value) => String(value ?? '').trim();

const setAttributes = (node, attrs = {}) => {
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        node.setAttribute(key, String(value));
    }
    return node;
};

const setStyles = (node, styles = {}) => {
    if (!node?.style) return node;
    for (const [key, value] of Object.entries(styles)) {
        if (value == null) continue;
        const stringValue = String(value);
        if (key.startsWith('--') || key.includes('-')) {
            node.style.setProperty(key, stringValue);
        } else {
            node.style[key] = stringValue;
        }
    }
    return node;
};

const createSvgNode = (documentRef, tagName, attrs = {}, styles = {}) => {
    const node = documentRef.createElementNS(SVG_NS, tagName);
    setAttributes(node, attrs);
    return setStyles(node, styles);
};

const parseColorChannel = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.min(255, numeric)) : null;
};

const parseSimpleColor = (value) => {
    const raw = toText(value).toLowerCase();
    if (!raw || raw === 'none' || raw === 'transparent' || raw.startsWith('url(') || raw.startsWith('var(')) return null;
    if (raw === 'white') return { r: 255, g: 255, b: 255 };
    if (raw === 'black') return { r: 0, g: 0, b: 0 };
    const shortHex = raw.match(/^#([0-9a-f]{3})$/i);
    if (shortHex) {
        return {
            r: parseInt(shortHex[1][0] + shortHex[1][0], 16),
            g: parseInt(shortHex[1][1] + shortHex[1][1], 16),
            b: parseInt(shortHex[1][2] + shortHex[1][2], 16)
        };
    }
    const hex = raw.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        return {
            r: parseInt(hex[1].slice(0, 2), 16),
            g: parseInt(hex[1].slice(2, 4), 16),
            b: parseInt(hex[1].slice(4, 6), 16)
        };
    }
    const rgb = raw.match(/^rgba?\(([^)]+)\)$/);
    if (rgb) {
        const parts = rgb[1].split(',').map((part) => parseColorChannel(part.trim()));
        if (parts.length >= 3 && parts.slice(0, 3).every((part) => part != null)) {
            return { r: parts[0], g: parts[1], b: parts[2] };
        }
    }
    return null;
};

const isWhiteColor = (value) => {
    const color = parseSimpleColor(value);
    if (!color) return false;
    return color.r >= 245 && color.g >= 245 && color.b >= 245;
};

const applyMutedStationBadgePalette = (svg, mutedColor = '#c3c7cd') => {
    if (!svg?.querySelectorAll) return;
    const nodes = [svg, ...svg.querySelectorAll('*')];
    for (const node of nodes) {
        for (const attrName of ['fill', 'stroke']) {
            const value = node.getAttribute?.(attrName);
            if (!value || isWhiteColor(value)) continue;
            const parsed = parseSimpleColor(value);
            if (!parsed) continue;
            node.setAttribute(attrName, mutedColor);
        }
        for (const propName of ['fill', 'stroke']) {
            const value = node.style?.[propName];
            if (!value || isWhiteColor(value)) continue;
            const parsed = parseSimpleColor(value);
            if (!parsed) continue;
            node.style[propName] = mutedColor;
        }
    }
};

const clearChildren = (node) => {
    if (typeof node.replaceChildren === 'function') {
        node.replaceChildren();
        return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
};

const parseCssSize = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const raw = toText(value);
    const match = raw.match(/^(-?\d+(?:\.\d+)?)/);
    if (!match) return fallback;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) return fallback;
    if (raw.endsWith('em') || raw.endsWith('rem')) return numeric * 10;
    return numeric;
};

const parseBorderRadius = (value, size, fallback = 0) => {
    const raw = toText(value);
    if (raw.endsWith('%')) return size * (parseCssSize(raw, 0) / 100);
    return parseCssSize(raw, fallback);
};

const pickCodeLengthStyle = (rules = [], length = 0, fallback = {}) => {
    for (const rule of Array.isArray(rules) ? rules : []) {
        if (!rule || typeof rule !== 'object') continue;
        const max = Number(rule.max);
        if (Number.isFinite(max) && length > max) continue;
        const { max: _max, ...style } = rule;
        return style;
    }
    return fallback;
};

const hasStyleValue = (styles = {}, key) => (
    Object.prototype.hasOwnProperty.call(styles || {}, key) &&
    styles[key] != null &&
    toText(styles[key]) !== ''
);

const getStyleValue = (styles = {}, keys = [], fallback = '') => {
    for (const key of keys) {
        if (hasStyleValue(styles, key)) return styles[key];
    }
    return fallback;
};

const parseBoxPart = (value, fallback = 0, relative = 10) => {
    const raw = toText(value);
    if (!raw) return fallback;
    if (raw.endsWith('%')) return fallback;
    const match = raw.match(/^(-?\d+(?:\.\d+)?)/);
    if (!match) return fallback;
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) return fallback;
    if (raw.endsWith('em') || raw.endsWith('rem')) return numeric * relative;
    return numeric;
};

const parseBoxShorthand = (value, relative = 10) => {
    const parts = toText(value).split(/\s+/).filter(Boolean);
    if (!parts.length) return { top: 0, right: 0, bottom: 0, left: 0 };
    const values = parts.map((part) => parseBoxPart(part, 0, relative));
    const [top, right = top, bottom = top, left = right] = values;
    return { top, right, bottom, left };
};

const parseBox = (styles = {}, prop = 'padding', relative = 10) => {
    const base = parseBoxShorthand(styles[prop], relative);
    return {
        top: parseBoxPart(styles[`${prop}Top`], base.top, relative),
        right: parseBoxPart(styles[`${prop}Right`], base.right, relative),
        bottom: parseBoxPart(styles[`${prop}Bottom`], base.bottom, relative),
        left: parseBoxPart(styles[`${prop}Left`], base.left, relative)
    };
};

const omitStyles = (styles = {}, omittedKeys = new Set()) => {
    const result = {};
    for (const [key, value] of Object.entries(styles || {})) {
        if (value == null || omittedKeys.has(key)) continue;
        result[key] = value;
    }
    return result;
};

const LAYOUT_STYLE_KEYS = new Set([
    'display', 'flex', 'flexBasis', 'flexDirection', 'flexGrow', 'flexShrink', 'alignItems',
    'alignSelf', 'justifyContent', 'boxSizing', 'userSelect', 'width', 'height', 'minWidth',
    'minHeight', 'maxWidth', 'maxHeight', 'padding', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom',
    'marginLeft', 'lineHeight', 'textAlign'
]);

const FRAME_RESERVED_STYLE_KEYS = new Set([
    ...LAYOUT_STYLE_KEYS,
    'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius',
    'borderBottomLeftRadius', 'borderTop', 'borderTopWidth', 'borderTopColor',
    'borderTopInset', 'borderWidth', 'color', 'fontFamily', 'fontSize', 'fontStyle', 'fontWeight',
    'letterSpacing', 'textDecoration', 'textTransform', 'transform', 'transformOrigin'
]);

const TEXT_RESERVED_STYLE_KEYS = new Set([
    ...LAYOUT_STYLE_KEYS,
    'background', 'backgroundColor', 'border', 'borderColor', 'borderRadius', 'borderWidth'
]);

const resolveTextAnchor = (textAlign, fallback = 'middle') => {
    const align = toText(textAlign).toLowerCase();
    if (align === 'left' || align === 'start') return 'start';
    if (align === 'right' || align === 'end') return 'end';
    return fallback;
};

const buildTextStyle = ({
    rootStyle = {},
    lengthStyle = {},
    partStyle = {},
    fallbackFill = '#000',
    fallbackFontSize = 10,
    fallbackFontWeight = '800'
} = {}) => {
    const merged = {
        ...omitStyles(rootStyle, TEXT_RESERVED_STYLE_KEYS),
        ...omitStyles(lengthStyle, TEXT_RESERVED_STYLE_KEYS),
        ...omitStyles(partStyle, TEXT_RESERVED_STYLE_KEYS)
    };
    const fill = getStyleValue(partStyle, ['fill', 'color'],
        getStyleValue(lengthStyle, ['fill', 'color'],
            getStyleValue(rootStyle, ['fill', 'color'], fallbackFill)));
    const fontSize = getStyleValue(partStyle, ['fontSize'],
        getStyleValue(lengthStyle, ['fontSize'],
            getStyleValue(rootStyle, ['fontSize'], fallbackFontSize)));
    const fontWeight = getStyleValue(partStyle, ['fontWeight'],
        getStyleValue(lengthStyle, ['fontWeight'],
            getStyleValue(rootStyle, ['fontWeight'], fallbackFontWeight)));
    const fontFamily = getStyleValue(partStyle, ['fontFamily'],
        getStyleValue(lengthStyle, ['fontFamily'],
            getStyleValue(rootStyle, ['fontFamily'], STATION_BADGE_FONT_FAMILY)));
    const configuredTextAnchor = getStyleValue(partStyle, ['textAnchor'],
        getStyleValue(lengthStyle, ['textAnchor'],
            getStyleValue(rootStyle, ['textAnchor'], '')));
    const textAlign = getStyleValue(partStyle, ['textAlign'],
        getStyleValue(lengthStyle, ['textAlign'],
            getStyleValue(rootStyle, ['textAlign'], 'center')));

    return {
        ...merged,
        fill,
        color: fill,
        fontSize,
        fontWeight,
        fontFamily,
        textAnchor: configuredTextAnchor || resolveTextAnchor(textAlign)
    };
};

const estimateTextWidth = (text, fontSize, letterSpacing = 0) => {
    const safeText = toText(text);
    if (!safeText) return 0;
    return safeText.length * parseCssSize(fontSize, 10) * 0.62 + Math.max(0, safeText.length - 1) * parseCssSize(letterSpacing, 0);
};

const resolveTextX = ({
    styles = {},
    areaX = 0,
    areaWidth = 0,
    padding = { left: 0, right: 0 },
    fallback = null
} = {}) => {
    if (hasStyleValue(styles, 'x')) return styles.x;
    const left = areaX + (padding.left || 0);
    const right = areaX + areaWidth - (padding.right || 0);
    const anchor = toText(styles.textAnchor);
    if (anchor === 'start') return left;
    if (anchor === 'end') return right;
    return fallback ?? ((left + right) / 2);
};

const resolveTextY = (styles = {}, fallback) => (
    hasStyleValue(styles, 'y') ? styles.y : fallback
);

const normalizeSvgTextTransform = (value) => {
    const raw = toText(value);
    const axisScale = raw.match(/^scale([XY])\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*\)$/i);
    if (!axisScale) return value;
    return axisScale[1].toUpperCase() === 'X'
        ? `scale(${axisScale[2]} 1)`
        : `scale(1 ${axisScale[2]})`;
};

const getSvgTextAttrsFromStyles = (styles = {}) => {
    const attrs = {};
    for (const [styleKey, attrKey] of [
        ['dx', 'dx'],
        ['dy', 'dy'],
        ['rotate', 'rotate'],
        ['textLength', 'textLength'],
        ['lengthAdjust', 'lengthAdjust'],
        ['transform', 'transform'],
        ['dominantBaseline', 'dominant-baseline'],
        ['alignmentBaseline', 'alignment-baseline']
    ]) {
        if (!hasStyleValue(styles, styleKey)) continue;
        attrs[attrKey] = attrKey === 'transform'
            ? normalizeSvgTextTransform(styles[styleKey])
            : styles[styleKey];
    }
    return attrs;
};

const createText = ({
    documentRef,
    x,
    y,
    text,
    fill,
    fontSize,
    fontWeight,
    className,
    styles = {},
    extraAttrs = {}
}) => {
    const textStyle = {
        ...styles,
        fill: getStyleValue(styles, ['fill', 'color'], fill),
        color: getStyleValue(styles, ['fill', 'color'], fill),
        fontSize: getStyleValue(styles, ['fontSize'], fontSize),
        fontWeight: getStyleValue(styles, ['fontWeight'], fontWeight),
        fontFamily: getStyleValue(styles, ['fontFamily'], STATION_BADGE_FONT_FAMILY)
    };
    const node = createSvgNode(documentRef, 'text', {
        x: hasStyleValue(textStyle, 'x') ? textStyle.x : x,
        y: hasStyleValue(textStyle, 'y') ? textStyle.y : y,
        fill: textStyle.fill,
        'font-size': textStyle.fontSize,
        'font-weight': textStyle.fontWeight,
        'font-family': textStyle.fontFamily,
        'text-anchor': textStyle.textAnchor || 'middle',
        'dominant-baseline': 'central',
        lengthAdjust: 'spacingAndGlyphs',
        class: className,
        ...getSvgTextAttrsFromStyles(textStyle),
        ...extraAttrs
    }, textStyle);
    node.textContent = text;
    return node;
};

const createFrameShape = ({
    documentRef,
    width,
    height,
    borderWidth,
    borderRadius,
    fill,
    stroke,
    shape,
    styles = {}
}) => {
    const frameStyles = omitStyles(styles, FRAME_RESERVED_STYLE_KEYS);
    if (shape === 'hexagon') {
        return createSvgNode(documentRef, 'polygon', {
            points: `${width / 2} ${borderWidth / 2},${width - borderWidth / 2} ${height * 0.24},${width - borderWidth / 2} ${height * 0.76},${width / 2} ${height - borderWidth / 2},${borderWidth / 2} ${height * 0.76},${borderWidth / 2} ${height * 0.24}`,
            fill,
            stroke,
            'stroke-width': borderWidth,
            'stroke-linejoin': 'round',
            'data-station-badge-frame': 'true'
        }, frameStyles);
    }

    if (shape === 'circle') {
        const radius = (Math.min(width, height) - borderWidth) / 2;
        return createSvgNode(documentRef, 'circle', {
            cx: width / 2,
            cy: height / 2,
            r: Math.max(0, radius),
            fill,
            stroke,
            'stroke-width': borderWidth,
            'data-station-badge-frame': 'true'
        }, frameStyles);
    }

    const inset = borderWidth / 2;
    return createSvgNode(documentRef, 'rect', {
        x: inset,
        y: inset,
        width: Math.max(0, width - borderWidth),
        height: Math.max(0, height - borderWidth),
        rx: Math.max(0, borderRadius),
        ry: Math.max(0, borderRadius),
        fill,
        stroke,
        'stroke-width': borderWidth,
        'data-station-badge-frame': 'true'
    }, frameStyles);
};

const resolveDecorationValue = (value, context = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    if (Object.prototype.hasOwnProperty.call(context, value)) return context[value];
    return value.replace(/\b(backgroundColor|borderColor|prefixBackground|prefixText|suffixText)\b/g, (token) => (
        Object.prototype.hasOwnProperty.call(context, token) ? toText(context[token]) : token
    ));
};

const resolveDecorationMap = (values = {}, context = {}) => {
    const resolved = {};
    for (const [key, value] of Object.entries(values || {})) {
        resolved[key] = resolveDecorationValue(value, context);
    }
    return resolved;
};

const appendFrameDecorations = ({
    documentRef,
    svg,
    decorations = [],
    context = {}
}) => {
    if (!Array.isArray(decorations) || !decorations.length) return;
    decorations.forEach((decoration) => {
        if (!decoration?.tag) return;
        const node = createSvgNode(
            documentRef,
            decoration.tag,
            resolveDecorationMap(decoration.attrs || {}, context),
            resolveDecorationMap(decoration.style || {}, context)
        );
        const text = decoration.text ?? decoration.textContent;
        if (text != null) node.textContent = String(text);
        svg.appendChild(node);
    });
};

const createStackedSuffixBackground = ({
    documentRef,
    x,
    y,
    width,
    height,
    outerWidth,
    outerHeight,
    borderWidth,
    borderRadius,
    shape,
    fill,
    className,
    styles = {}
}) => {
    if (!fill || toText(fill) === 'transparent') return null;
    const backgroundStyles = omitStyles(styles, FRAME_RESERVED_STYLE_KEYS);

    if (shape === 'circle') {
        const radius = Math.max(0, (Math.min(outerWidth, outerHeight) - borderWidth) / 2);
        const cx = outerWidth / 2;
        const cy = outerHeight / 2;
        const topY = Math.max(cy - radius, Math.min(cy + radius, y));
        const dy = topY - cy;
        const halfChord = Math.sqrt(Math.max(0, radius * radius - dy * dy));
        const leftX = cx - halfChord;
        const rightX = cx + halfChord;
        const bottomY = cy + radius;
        return createSvgNode(documentRef, 'path', {
            d: `M ${leftX} ${topY} H ${rightX} A ${radius} ${radius} 0 0 1 ${cx} ${bottomY} A ${radius} ${radius} 0 0 1 ${leftX} ${topY} Z`,
            fill,
            class: `${className} rw-station-code-badge-suffix-bg`,
            'data-station-badge-suffix-bg': 'true'
        }, backgroundStyles);
    }

    const resolvedWidth = Math.max(0, width);
    const resolvedHeight = Math.max(0, height);
    const maxRadius = Math.min(resolvedWidth, resolvedHeight) / 2;
    const clampRadius = (value) => Math.max(0, Math.min(maxRadius, value));
    const fallbackRadius = clampRadius(parseBorderRadius(styles.borderRadius, Math.min(resolvedWidth, resolvedHeight), borderRadius));
    const topLeft = clampRadius(parseBorderRadius(styles.borderTopLeftRadius, Math.min(resolvedWidth, resolvedHeight), fallbackRadius));
    const topRight = clampRadius(parseBorderRadius(styles.borderTopRightRadius, Math.min(resolvedWidth, resolvedHeight), fallbackRadius));
    const bottomRight = clampRadius(parseBorderRadius(styles.borderBottomRightRadius, Math.min(resolvedWidth, resolvedHeight), fallbackRadius));
    const bottomLeft = clampRadius(parseBorderRadius(styles.borderBottomLeftRadius, Math.min(resolvedWidth, resolvedHeight), fallbackRadius));

    return createSvgNode(documentRef, 'path', {
        d: [
            `M ${x + topLeft} ${y}`,
            `H ${x + resolvedWidth - topRight}`,
            `Q ${x + resolvedWidth} ${y} ${x + resolvedWidth} ${y + topRight}`,
            `V ${y + resolvedHeight - bottomRight}`,
            `Q ${x + resolvedWidth} ${y + resolvedHeight} ${x + resolvedWidth - bottomRight} ${y + resolvedHeight}`,
            `H ${x + bottomLeft}`,
            `Q ${x} ${y + resolvedHeight} ${x} ${y + resolvedHeight - bottomLeft}`,
            `V ${y + topLeft}`,
            `Q ${x} ${y} ${x + topLeft} ${y}`,
            'Z'
        ].join(' '),
        fill,
        class: `${className} rw-station-code-badge-suffix-bg`,
        'data-station-badge-suffix-bg': 'true'
    }, backgroundStyles);
};

const parseCssBorderLine = (value = '') => {
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

const createStackedDivider = ({
    documentRef,
    x,
    y,
    width,
    styles = {},
    className
}) => {
    const borderTop = parseCssBorderLine(styles.borderTop);
    const lineHeight = parseCssSize(styles.borderTopWidth || borderTop.width, 0);
    const lineColor = toText(styles.borderTopColor || borderTop.color);
    if (!(lineHeight > 0) || !lineColor || lineColor === 'transparent') return null;

    const inset = parseCssSize(styles.borderTopInset, 0);
    return createSvgNode(documentRef, 'rect', {
        x: x + inset,
        y,
        width: Math.max(0, width - inset * 2),
        height: lineHeight,
        fill: lineColor,
        class: `${className} rw-station-code-badge-divider`,
        'data-station-badge-divider': 'true'
    });
};

const resolveShape = (rootStyle = {}) => {
    if (toText(rootStyle.clipPath).includes('polygon')) return 'hexagon';
    if (toText(rootStyle.borderRadius) === '50%') return 'circle';
    return 'rect';
};

const markStationBadgeFrame = (node, source = 'station-badge') => {
    if (!node?.setAttribute) return node;
    node.setAttribute('data-station-badge-frame', 'true');
    node.setAttribute('data-station-badge-frame-source', source);
    node.querySelectorAll?.('*')?.forEach((child) => {
        child.setAttribute('data-station-badge-frame', 'true');
        child.setAttribute('data-station-badge-frame-source', source);
    });
    return node;
};

const createReusedLineIconFrameShape = ({
    documentRef,
    width,
    height,
    lineIconFrame,
    styles = {}
}) => {
    if (!lineIconFrame?.design) return null;

    const frameNode = createLineIconFrameNode({
        documentRef,
        design: lineIconFrame.design,
        borderColor: lineIconFrame.borderColor,
        fillColor: lineIconFrame.fillColor,
        backgroundColor: lineIconFrame.backgroundColor,
        trainIconHref: lineIconFrame.trainIconHref,
        imageConfig: lineIconFrame.imageConfig
    });
    if (!frameNode) return null;

    markStationBadgeFrame(frameNode, 'line-icon');

    const styleContext = {
        borderColor: lineIconFrame.borderColor,
        fillColor: lineIconFrame.fillColor,
        backgroundColor: lineIconFrame.backgroundColor,
        lineColor: lineIconFrame.fillColor
    };
    const fittedViewBox = getFittedFrameViewBox(lineIconFrame.design, styleContext);
    if (fittedViewBox) {
        const svg = createSvgNode(documentRef, 'svg', {
            viewBox: fittedViewBox,
            x: 0,
            y: 0,
            width,
            height,
            overflow: 'visible',
            'data-station-badge-frame': 'true',
            'data-station-badge-frame-source': 'line-icon',
            'data-station-badge-frame-wrapper': 'line-icon'
        }, omitStyles(styles, FRAME_RESERVED_STYLE_KEYS));
        svg.appendChild(frameNode);
        return svg;
    }

    const group = createSvgNode(documentRef, 'g', {
        transform: `scale(${width / 100} ${height / 100})`,
        'data-station-badge-frame': 'true',
        'data-station-badge-frame-source': 'line-icon',
        'data-station-badge-frame-wrapper': 'line-icon'
    }, omitStyles(styles, FRAME_RESERVED_STYLE_KEYS));
    group.appendChild(frameNode);
    return group;
};

const createSplitBadge = ({
    documentRef,
    svg,
    prefix,
    suffix,
    width,
    height,
    borderWidth,
    borderRadius,
    backgroundColor,
    borderColor,
    prefixBackground,
    prefixText,
    suffixText,
    rootStyle,
    prefixStyle,
    suffixStyle,
    lengthStyle,
    classNames,
    lineIconFrame,
    frameDecorations = []
}) => {
    const prefixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: prefixStyle,
        fallbackFill: prefixText,
        fallbackFontSize: 10,
        fallbackFontWeight: toText(rootStyle.fontWeight) || '700'
    });
    const suffixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: suffixStyle,
        fallbackFill: suffixText,
        fallbackFontSize: 10,
        fallbackFontWeight: toText(rootStyle.fontWeight) || '700'
    });
    const prefixFontSize = parseCssSize(prefixTextStyle.fontSize, 10);
    const suffixFontSize = parseCssSize(suffixTextStyle.fontSize, 10);
    const rootPadding = parseBox(rootStyle, 'padding', Math.max(prefixFontSize, suffixFontSize));
    const prefixPadding = parseBox(prefixStyle, 'padding', prefixFontSize);
    const prefixMargin = parseBox(prefixStyle, 'margin', prefixFontSize);
    const suffixPadding = parseBox(suffixStyle, 'padding', suffixFontSize);

    svg.appendChild(createReusedLineIconFrameShape({
        documentRef,
        width,
        height,
        lineIconFrame,
        styles: rootStyle
    }) || createFrameShape({
        documentRef,
        width,
        height,
        borderWidth,
        borderRadius,
        fill: backgroundColor,
        stroke: borderColor,
        shape: 'rect',
        styles: rootStyle
    }));

    appendFrameDecorations({
        documentRef,
        svg,
        decorations: frameDecorations,
        context: { backgroundColor, borderColor, prefixBackground, prefixText, suffixText }
    });

    const inset = borderWidth / 2;
    const contentX = inset + rootPadding.left;
    const contentY = inset + rootPadding.top;
    const contentWidth = Math.max(0, width - borderWidth - rootPadding.left - rootPadding.right);
    const contentHeight = Math.max(0, height - borderWidth - rootPadding.top - rootPadding.bottom);
    const prefixWidth = suffix
        ? Math.max(12, estimateTextWidth(prefix, prefixTextStyle.fontSize, prefixTextStyle.letterSpacing) + prefixPadding.left + prefixPadding.right)
        : Math.max(contentWidth, 12);
    const prefixRectWidth = Math.min(contentWidth, prefixWidth);
    const prefixFill = getStyleValue(prefixStyle, ['fill', 'backgroundColor', 'background'], prefixBackground);
    const prefixRadius = hasStyleValue(prefixStyle, 'borderRadius')
        ? parseBorderRadius(prefixStyle.borderRadius, Math.min(prefixRectWidth, contentHeight), Math.max(0, borderRadius - inset))
        : Math.max(0, borderRadius - inset);
    svg.appendChild(createSvgNode(documentRef, 'rect', {
        x: contentX,
        y: contentY,
        width: Math.max(0, prefixRectWidth),
        height: Math.max(0, contentHeight),
        rx: prefixRadius,
        ry: prefixRadius,
        fill: prefixFill,
        class: `${classNames.prefix} rw-station-code-badge-prefix-bg`,
        'data-station-badge-prefix-bg': 'true'
    }, omitStyles(prefixStyle, FRAME_RESERVED_STYLE_KEYS)));

    const textY = contentY + contentHeight / 2;
    svg.appendChild(createText({
        documentRef,
        x: resolveTextX({
            styles: prefixTextStyle,
            areaX: contentX,
            areaWidth: prefixRectWidth,
            padding: prefixPadding,
            fallback: contentX + prefixRectWidth / 2
        }),
        y: resolveTextY(prefixTextStyle, textY),
        text: prefix,
        fill: prefixText,
        fontSize: prefixFontSize,
        fontWeight: prefixTextStyle.fontWeight,
        styles: prefixTextStyle,
        className: `${classNames.prefix} rw-station-code-badge-prefix-text`,
        extraAttrs: { 'data-station-badge-prefix-text': 'true' }
    }));

    if (!suffix) return;

    const suffixAreaX = contentX + prefixRectWidth + prefixMargin.right;
    const suffixAreaWidth = Math.max(10, width - suffixAreaX - inset - rootPadding.right);
    svg.appendChild(createText({
        documentRef,
        x: resolveTextX({
            styles: suffixTextStyle,
            areaX: suffixAreaX,
            areaWidth: suffixAreaWidth,
            padding: suffixPadding,
            fallback: suffixAreaX + suffixAreaWidth / 2
        }),
        y: resolveTextY(suffixTextStyle, textY),
        text: suffix,
        fill: suffixText,
        fontSize: suffixFontSize,
        fontWeight: suffixTextStyle.fontWeight,
        styles: suffixTextStyle,
        className: `${classNames.suffix} rw-station-code-badge-suffix-text`,
        extraAttrs: { 'data-station-badge-suffix-text': 'true' }
    }));
};

const createStackedBadge = ({
    documentRef,
    svg,
    prefix,
    suffix,
    width,
    height,
    borderWidth,
    borderRadius,
    backgroundColor,
    borderColor,
    prefixBackground,
    prefixText,
    suffixText,
    rootStyle,
    prefixStyle,
    suffixStyle,
    lengthStyle,
    classNames,
    shape,
    lineIconFrame,
    frameDecorations = []
}) => {
    const prefixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: prefixStyle,
        fallbackFill: prefixText,
        fallbackFontSize: 9,
        fallbackFontWeight: toText(rootStyle.fontWeight) || '800'
    });
    const suffixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: suffixStyle,
        fallbackFill: suffixText,
        fallbackFontSize: 12,
        fallbackFontWeight: toText(rootStyle.fontWeight) || '800'
    });
    const prefixFontSize = parseCssSize(prefixTextStyle.fontSize, 9);
    const suffixFontSize = parseCssSize(suffixTextStyle.fontSize, 12);
    const rootPadding = parseBox(rootStyle, 'padding', Math.max(prefixFontSize, suffixFontSize));
    const prefixPadding = parseBox(prefixStyle, 'padding', prefixFontSize);
    const suffixPadding = parseBox(suffixStyle, 'padding', suffixFontSize);

    svg.appendChild(createReusedLineIconFrameShape({
        documentRef,
        width,
        height,
        lineIconFrame,
        styles: rootStyle
    }) || createFrameShape({
        documentRef,
        width,
        height,
        borderWidth,
        borderRadius,
        fill: backgroundColor,
        stroke: borderColor,
        shape,
        styles: rootStyle
    }));

    appendFrameDecorations({
        documentRef,
        svg,
        decorations: frameDecorations,
        context: { backgroundColor, borderColor, prefixBackground, prefixText, suffixText }
    });

    const prefixHidden = toText(prefixStyle.display) === 'none' || !prefix;
    const explicitPrefixHeight = parseCssSize(prefixStyle.height, 0);
    const contentX = borderWidth + rootPadding.left;
    const contentY = borderWidth + rootPadding.top;
    const contentWidth = Math.max(0, width - borderWidth * 2 - rootPadding.left - rootPadding.right);
    const contentHeight = Math.max(0, height - borderWidth * 2 - rootPadding.top - rootPadding.bottom);
    const prefixHeight = prefixHidden ? 0 : Math.min(contentHeight, explicitPrefixHeight || Math.max(8, height * 0.38));

    if (!prefixHidden) {
        const prefixFill = getStyleValue(prefixStyle, ['fill', 'backgroundColor', 'background'], prefixBackground);
        const prefixRadius = hasStyleValue(prefixStyle, 'borderRadius')
            ? parseBorderRadius(prefixStyle.borderRadius, Math.min(contentWidth, prefixHeight), 0)
            : 0;
        svg.appendChild(createSvgNode(documentRef, 'rect', {
            x: contentX,
            y: contentY,
            width: contentWidth,
            height: Math.max(0, prefixHeight),
            rx: prefixRadius,
            ry: prefixRadius,
            fill: prefixFill,
            class: `${classNames.prefix} rw-station-code-badge-prefix-bg`,
            'data-station-badge-prefix-bg': 'true'
        }, omitStyles(prefixStyle, FRAME_RESERVED_STYLE_KEYS)));
        svg.appendChild(createText({
            documentRef,
            x: resolveTextX({
                styles: prefixTextStyle,
                areaX: contentX,
                areaWidth: contentWidth,
                padding: prefixPadding,
                fallback: contentX + contentWidth / 2
            }),
            y: resolveTextY(prefixTextStyle, contentY + prefixHeight / 2),
            text: prefix,
            fill: prefixText,
            fontSize: prefixFontSize,
            fontWeight: prefixTextStyle.fontWeight,
            styles: prefixTextStyle,
            className: `${classNames.prefix} rw-station-code-badge-prefix-text`,
            extraAttrs: { 'data-station-badge-prefix-text': 'true' }
        }));
    }

    const suffixValue = suffix || (!prefixHidden ? '' : prefix);
    if (!suffixValue) return;

    const suffixAreaY = contentY + prefixHeight;
    const suffixAreaHeight = Math.max(0, contentHeight - prefixHeight);
    const suffixFill = getStyleValue(suffixStyle, ['backgroundColor', 'background', 'fill'], '');
    const suffixBackground = createStackedSuffixBackground({
        documentRef,
        x: contentX,
        y: suffixAreaY,
        width: contentWidth,
        height: suffixAreaHeight,
        outerWidth: width,
        outerHeight: height,
        borderWidth,
        borderRadius,
        shape,
        fill: suffixFill,
        className: classNames.suffix,
        styles: suffixStyle
    });
    if (suffixBackground) svg.appendChild(suffixBackground);

    const divider = createStackedDivider({
        documentRef,
        x: contentX,
        y: suffixAreaY,
        width: contentWidth,
        styles: suffixStyle,
        className: classNames.suffix
    });
    if (divider) svg.appendChild(divider);

    const suffixY = prefixHidden
        ? contentY + contentHeight / 2
        : suffixAreaY + suffixAreaHeight / 2 + borderWidth * 0.2;
    svg.appendChild(createText({
        documentRef,
        x: resolveTextX({
            styles: suffixTextStyle,
            areaX: contentX,
            areaWidth: contentWidth,
            padding: suffixPadding,
            fallback: contentX + contentWidth / 2
        }),
        y: resolveTextY(suffixTextStyle, suffixY),
        text: suffixValue,
        fill: suffixText,
        fontSize: suffixFontSize,
        fontWeight: suffixTextStyle.fontWeight,
        styles: suffixTextStyle,
        className: `${classNames.suffix} rw-station-code-badge-suffix-text`,
        extraAttrs: { 'data-station-badge-suffix-text': 'true' }
    }));
};

const resolveSplitWidth = ({
    prefix,
    suffix,
    height,
    minWidth,
    borderWidth,
    rootStyle = {},
    prefixStyle = {},
    suffixStyle = {},
    lengthStyle = {}
}) => {
    if (!suffix) return Math.max(minWidth, height);
    const prefixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: prefixStyle,
        fallbackFontSize: 10
    });
    const suffixTextStyle = buildTextStyle({
        rootStyle,
        lengthStyle,
        partStyle: suffixStyle,
        fallbackFontSize: 10
    });
    const prefixFontSize = parseCssSize(prefixTextStyle.fontSize, 10);
    const suffixFontSize = parseCssSize(suffixTextStyle.fontSize, 10);
    const rootPadding = parseBox(rootStyle, 'padding', Math.max(prefixFontSize, suffixFontSize));
    const prefixPadding = parseBox(prefixStyle, 'padding', prefixFontSize);
    const prefixMargin = parseBox(prefixStyle, 'margin', prefixFontSize);
    const suffixPadding = parseBox(suffixStyle, 'padding', suffixFontSize);
    const prefixWidth = Math.max(
        12,
        estimateTextWidth(prefix, prefixTextStyle.fontSize, prefixTextStyle.letterSpacing) +
            prefixPadding.left + prefixPadding.right
    );
    const suffixWidth = Math.max(
        12,
        estimateTextWidth(suffix, suffixTextStyle.fontSize, suffixTextStyle.letterSpacing) +
            suffixPadding.left + suffixPadding.right
    );
    return Math.max(
        minWidth,
        Math.ceil(prefixWidth + prefixMargin.right + suffixWidth + rootPadding.left + rootPadding.right + borderWidth * 1.5)
    );
};

export const renderStationBadgeSvg = (root, {
    documentRef = globalThis.document,
    code = '',
    prefix = '',
    suffix = '',
    design = {},
    borderColor = 'transparent',
    borderWidth = '2px',
    backgroundColor = '#fff',
    prefixBackground = 'transparent',
    prefixText = '#000',
    suffixText = '#000',
    classNames = {},
    lineIconFrame = null,
    muted = false,
    mutedColor = '#c3c7cd',
    rootStyle = {},
    svgStyle = {}
} = {}) => {
    if (!root?.style || !documentRef?.createElementNS) return null;

    const safeCode = toText(code);
    const safePrefix = toText(prefix);
    const safeSuffix = toText(suffix);
    const html = design.html || {};
    const resolvedRootStyle = {
        ...(html.rootStyle || {}),
        ...rootStyle
    };
    const prefixStyle = html.prefixStyle || {};
    const suffixStyle = html.suffixStyle || {};
    const lengthStyle = pickCodeLengthStyle(design.fontSizeByCodeLength, safeCode.length, {});
    const numericBorderWidth = parseCssSize(borderWidth, 2);
    const configuredHeight = parseCssSize(resolvedRootStyle.height, 25);
    const configuredMinWidth = parseCssSize(resolvedRootStyle.minWidth, configuredHeight);
    const isSplit = toText(resolvedRootStyle.flexDirection) !== 'column' && safeSuffix;
    const width = isSplit
        ? resolveSplitWidth({
            prefix: safePrefix,
            suffix: safeSuffix,
            height: configuredHeight,
            minWidth: configuredMinWidth,
            borderWidth: numericBorderWidth,
            rootStyle: resolvedRootStyle,
            prefixStyle,
            suffixStyle,
            lengthStyle
        })
        : parseCssSize(resolvedRootStyle.width, configuredMinWidth);
    const height = configuredHeight;
    const shape = resolveShape(resolvedRootStyle);
    const borderRadius = shape === 'circle'
        ? height / 2
        : parseBorderRadius(resolvedRootStyle.borderRadius, Math.min(width, height), 0);
    const prefixClass = toText(classNames.prefix) || 'rw-station-code-badge-prefix';
    const suffixClass = toText(classNames.suffix) || 'rw-station-code-badge-suffix';

    const svg = createSvgNode(documentRef, 'svg', {
        viewBox: `0 0 ${width} ${height}`,
        width: '100%',
        height: '100%',
        'aria-hidden': 'true',
        focusable: 'false',
        role: 'img'
    }, {
        display: 'block',
        overflow: 'visible',
        ...svgStyle
    });

    const badgeModel = {
        documentRef,
        svg,
        prefix: safePrefix,
        suffix: safeSuffix,
        width,
        height,
        borderWidth: numericBorderWidth,
        borderRadius,
        backgroundColor,
        borderColor,
        prefixBackground,
        prefixText,
        suffixText,
        rootStyle: resolvedRootStyle,
        prefixStyle,
        suffixStyle,
        lengthStyle,
        classNames: { prefix: prefixClass, suffix: suffixClass },
        shape,
        lineIconFrame,
        frameDecorations: Array.isArray(design.frameDecorations) ? design.frameDecorations : []
    };

    if (isSplit) createSplitBadge(badgeModel);
    else createStackedBadge(badgeModel);

    if (muted) applyMutedStationBadgePalette(svg, mutedColor);

    setStyles(root, {
        ...resolvedRootStyle,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        flex: resolvedRootStyle.flex || '0 0 auto',
        userSelect: resolvedRootStyle.userSelect || 'none',
        width: `${width}px`,
        minWidth: `${width}px`,
        height: `${height}px`,
        padding: '0',
        border: '0',
        borderRadius: '0',
        background: 'transparent',
        color: 'inherit',
        lineHeight: '0',
        letterSpacing: '0',
        fontWeight: resolvedRootStyle.fontWeight || '',
        overflow: 'visible'
    });

    clearChildren(root);
    root.appendChild(svg);
    return svg;
};
