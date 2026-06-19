import { lineIconSettings } from '../config/lineIconSettings.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const toText = (value) => String(value ?? '').trim();
const LINE_ICON_SETTINGS = lineIconSettings.lineIcon || {};
const LINE_ICON_DESIGNS = lineIconSettings.lineIconDesigns || {};

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

const clearChildren = (node) => {
    if (typeof node.replaceChildren === 'function') {
        node.replaceChildren();
        return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
};

const pickByCodeLength = (rules = [], length = 0, fallback = undefined) => {
    for (const rule of Array.isArray(rules) ? rules : []) {
        if (!rule || typeof rule !== 'object') continue;
        const max = Number(rule.max);
        if (Number.isFinite(max) && length > max) continue;
        if ('value' in rule) return rule.value;
        return rule;
    }
    return fallback;
};

const resolveConfiguredValue = (value, context = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('dark' in value || 'light' in value) return context.dark ? value.dark : value.light;
        return value;
    }
    if (typeof value !== 'string') return value;
    if (Object.prototype.hasOwnProperty.call(context, value)) return context[value];
    return value.replace(/\b(borderColor|fillColor|backgroundColor|lineColor)\b/g, (token) => (
        Object.prototype.hasOwnProperty.call(context, token) ? toText(context[token]) : token
    ));
};

const resolveConfiguredAttrs = (attrs = {}, context = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(attrs || {})) {
        result[key] = resolveConfiguredValue(value, context);
    }
    return result;
};

const resolveConfiguredStyles = (styles = {}, context = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(styles || {})) {
        result[key] = resolveConfiguredValue(value, context);
    }
    return result;
};

const parseSvgNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const match = toText(value).match(/^-?\d+(?:\.\d+)?/);
    if (!match) return fallback;
    const numeric = Number(match[0]);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const getStrokeWidth = (attrs = {}) => parseSvgNumber(attrs['stroke-width'] ?? attrs.strokeWidth, 0);

const getShapeVisualBounds = (shapeConfig = {}, context = {}) => {
    if (!shapeConfig?.tag || shapeConfig.custom) return null;

    const attrs = resolveConfiguredAttrs(shapeConfig.attrs, context);
    const strokeInset = getStrokeWidth(attrs) / 2;

    if (shapeConfig.tag === 'circle') {
        const cx = parseSvgNumber(attrs.cx, 50);
        const cy = parseSvgNumber(attrs.cy, 50);
        const r = parseSvgNumber(attrs.r, 50);
        return {
            minX: cx - r - strokeInset,
            minY: cy - r - strokeInset,
            maxX: cx + r + strokeInset,
            maxY: cy + r + strokeInset
        };
    }

    if (shapeConfig.tag === 'rect') {
        const x = parseSvgNumber(attrs.x, 0);
        const y = parseSvgNumber(attrs.y, 0);
        const width = parseSvgNumber(attrs.width, 100);
        const height = parseSvgNumber(attrs.height, 100);
        return {
            minX: x - strokeInset,
            minY: y - strokeInset,
            maxX: x + width + strokeInset,
            maxY: y + height + strokeInset
        };
    }

    if (shapeConfig.tag === 'polygon') {
        const points = toText(attrs.points)
            .split(/[\s,]+/)
            .map((part) => Number(part))
            .filter(Number.isFinite);
        if (points.length < 4) return null;
        const xs = [];
        const ys = [];
        for (let i = 0; i + 1 < points.length; i += 2) {
            xs.push(points[i]);
            ys.push(points[i + 1]);
        }
        if (!xs.length || !ys.length) return null;
        return {
            minX: Math.min(...xs) - strokeInset,
            minY: Math.min(...ys) - strokeInset,
            maxX: Math.max(...xs) + strokeInset,
            maxY: Math.max(...ys) + strokeInset
        };
    }

    return null;
};

const isNearlyEqual = (a, b) => Math.abs(a - b) < 0.001;

export const getFittedFrameViewBox = (design = {}, context = {}) => {
    const bounds = getShapeVisualBounds(design.shape, context);
    if (!bounds) return '';

    const minX = Math.max(0, bounds.minX);
    const minY = Math.max(0, bounds.minY);
    const maxX = Math.min(100, bounds.maxX);
    const maxY = Math.min(100, bounds.maxY);
    const width = maxX - minX;
    const height = maxY - minY;
    if (!(width > 0 && height > 0)) return '';
    if (!isNearlyEqual(width, height)) return '';
    return `${minX} ${minY} ${width} ${height}`;
};

const getImageAspectRatio = (imageConfig = {}) => {
    const direct = parseSvgNumber(imageConfig.aspectRatio, 0);
    if (direct > 0) return direct;

    const naturalWidth = parseSvgNumber(imageConfig.naturalWidth, 0);
    const naturalHeight = parseSvgNumber(imageConfig.naturalHeight, 0);
    if (naturalWidth > 0 && naturalHeight > 0) return naturalWidth / naturalHeight;

    return 0;
};

const getImageFittedAttrs = (imageConfig = {}, context = {}) => {
    const attrs = resolveConfiguredAttrs(imageConfig.attrs || {}, context);
    const fit = toText(imageConfig.fit || imageConfig.sizing);
    if (fit !== 'width') return attrs;

    const aspectRatio = getImageAspectRatio(imageConfig);
    if (!(aspectRatio > 0)) return attrs;

    const width = parseSvgNumber(attrs.width, 100);
    const height = width / aspectRatio;
    const x = parseSvgNumber(attrs.x, 0);
    const y = Object.prototype.hasOwnProperty.call(attrs, 'y')
        ? parseSvgNumber(attrs.y, 0)
        : (100 - height) / 2;

    return {
        ...attrs,
        x,
        y,
        width,
        height,
        preserveAspectRatio: attrs.preserveAspectRatio || 'xMidYMid meet'
    };
};

const getLineIconDesign = (designName) => {
    const name = toText(designName);
    const fallbackName = LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border';
    return LINE_ICON_DESIGNS[name] || LINE_ICON_DESIGNS[fallbackName] || LINE_ICON_DESIGNS.default || null;
};

const getEffectiveDesign = (design = {}, imageConfig = null) => {
    if (!imageConfig || typeof imageConfig !== 'object') return design;
    return {
        ...design,
        image: {
            ...(design?.image || {}),
            ...imageConfig,
            attrs: {
                ...(design?.image?.attrs || {}),
                ...(imageConfig.attrs || {})
            },
            style: {
                ...(design?.image?.style || {}),
                ...(imageConfig.style || {})
            }
        }
    };
};

const createNipporiToneriFrame = (documentRef) => {
    const group = createSvgNode(documentRef, 'g', {
        transform: 'scale(0.588) translate(-0.124 -0.34)'
    });

    [
        {
            fill: '#D53A77',
            d: `M170.203,150.575c0,10.914-8.929,19.844-19.843,19.844H19.966c-10.913,0-19.842-8.93-19.842-19.844V20.182
                C0.124,9.269,9.053,0.34,19.966,0.34H150.36c10.914,0,19.843,8.929,19.843,19.842V150.575z`
        },
        {
            fill: '#FCFCFC',
            d: `M12.926,147.616c0,5.502,4.5,10.002,10,10.002h124.472c5.501,0,10.001-4.5,10.001-10.002V23.143
                c0-5.5-4.5-10-10.001-10H22.927c-5.5,0-10,4.5-10,10V147.616z`
        },
        {
            fill: '#69B444',
            d: `M150.054,141.767c0,4.678-3.827,8.504-8.504,8.504H28.776c-4.677,0-8.504-3.826-8.504-8.504V28.993
                c0-4.677,3.827-8.504,8.504-8.504H141.55c4.677,0,8.504,3.827,8.504,8.504V141.767z`
        }
    ].forEach((attrs) => {
        group.appendChild(createSvgNode(documentRef, 'path', attrs));
    });

    group.appendChild(createSvgNode(documentRef, 'rect', {
        x: 27.924,
        y: 28.141,
        fill: '#FCFCFC',
        width: 114.479,
        height: 114.479
    }));

    return group;
};

const createShape = ({
    documentRef,
    design,
    borderColor,
    fillColor,
    backgroundColor
}) => {
    const shapeConfig = design?.shape || null;
    if (shapeConfig?.custom === 'nipporiToneriFrame') return createNipporiToneriFrame(documentRef);
    if (!shapeConfig?.tag) return null;

    const styleContext = {
        borderColor,
        fillColor,
        backgroundColor,
        lineColor: fillColor
    };
    return createSvgNode(
        documentRef,
        shapeConfig.tag,
        resolveConfiguredAttrs(shapeConfig.attrs, styleContext),
        resolveConfiguredStyles(shapeConfig.style || {}, styleContext)
    );
};

const createImageFrame = ({
    documentRef,
    design,
    trainIconHref,
    borderColor,
    fillColor,
    backgroundColor
}) => {
    const href = toText(trainIconHref);
    if (!href || !design?.image) return null;
    const styleContext = {
        borderColor,
        fillColor,
        backgroundColor,
        lineColor: fillColor
    };
    return createSvgNode(
        documentRef,
        'image',
        {
            ...getImageFittedAttrs(design.image || {}, styleContext),
            href
        },
        resolveConfiguredStyles(design.image.style || {}, styleContext)
    );
};

const createDecorationNodes = ({
    documentRef,
    design,
    borderColor,
    fillColor,
    backgroundColor
}) => {
    const decorations = Array.isArray(design?.decorations) ? design.decorations : [];
    if (!decorations.length) return [];
    const styleContext = {
        borderColor,
        fillColor,
        backgroundColor,
        lineColor: fillColor
    };

    return decorations
        .map((decoration) => {
            if (!decoration?.tag) return null;
            return createSvgNode(
                documentRef,
                decoration.tag,
                resolveConfiguredAttrs(decoration.attrs || {}, styleContext),
                resolveConfiguredStyles(decoration.style || {}, styleContext)
            );
        })
        .filter(Boolean);
};

export const createLineIconFrameNode = ({
    documentRef = globalThis.document,
    design,
    borderColor = 'transparent',
    fillColor = '#888',
    backgroundColor = '#fff',
    trainIconHref = '',
    imageConfig = null
} = {}) => {
    const effectiveDesign = getEffectiveDesign(design, imageConfig);
    const frameNode = effectiveDesign?.image
        ? createImageFrame({
            documentRef,
            design: effectiveDesign,
            trainIconHref,
            borderColor,
            fillColor,
            backgroundColor
        })
        : createShape({
            documentRef,
            design: effectiveDesign,
            borderColor,
            fillColor,
            backgroundColor
        });
    if (!frameNode) return null;

    const decorations = createDecorationNodes({
        documentRef,
        design: effectiveDesign,
        borderColor,
        fillColor,
        backgroundColor
    });
    if (!decorations.length) return frameNode;

    const group = createSvgNode(documentRef, 'g');
    group.appendChild(frameNode);
    decorations.forEach((node) => group.appendChild(node));
    return group;
};

const getTextModel = ({ code, design, dark, fillColor }) => {
    const length = toText(code).length;
    const model = design?.text || {};
    const explicitTextLength = model.textLength ??
        model.textWidth ??
        model.attrs?.textLength ??
        model.attrs?.textWidth ??
        model.attrs?.['text-width'];

    return {
        ...model,
        color: resolveConfiguredValue(model.color, { dark, fillColor }),
        fontSize: pickByCodeLength(model.fontSizeByCodeLength, length, model.fontSize),
        textLength: explicitTextLength ?? pickByCodeLength(model.textLengthByCodeLength, length, model.textLength)
    };
};

const appendCenteredText = ({ svg, documentRef, code, design, dark, fillColor }) => {
    const safeCode = toText(code);
    if (!safeCode) return;

    const textModel = getTextModel({ code: safeCode, design, dark, fillColor });
    if (textModel.hidden) return;
    const textLength = textModel.textLength || pickByCodeLength(textModel.textLengthByCodeLength, safeCode.length, 66);
    const { textWidth: _textWidth, 'text-width': _textWidthAttr, textLength: _textLengthAttr, ...configuredAttrs } = textModel.attrs || {};
    const textAttrs = {
        ...configuredAttrs,
        y: textModel.y,
        fill: textModel.color,
        'font-size': textModel.fontSize,
        textLength
    };
    if (textModel.transform) textAttrs.transform = textModel.transform;

    const text = createSvgNode(documentRef, 'text', textAttrs);
    text.textContent = safeCode;
    svg.appendChild(text);
};

const appendTrainImage = ({
    svg,
    documentRef,
    design,
    trainIconHref,
    borderColor,
    fillColor,
    backgroundColor
}) => {
    const href = toText(trainIconHref);
    if (!href) return;

    const styleContext = {
        borderColor,
        fillColor,
        backgroundColor,
        lineColor: fillColor
    };
    svg.appendChild(createSvgNode(documentRef, 'image', {
        ...getImageFittedAttrs(design?.image || {}, styleContext),
        href,
    }, resolveConfiguredStyles(design?.image?.style || {}, styleContext)));
};

export const renderLineIconSvg = (root, {
    documentRef = globalThis.document,
    code = '',
    preset = LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border',
    borderColor = 'transparent',
    fillColor = '#888',
    backgroundColor = '#fff',
    dark = false,
    trainIconHref = '',
    imageConfig = null,
    rootStyle = {},
    svgStyle = {}
} = {}) => {
    if (!root?.style || !documentRef?.createElementNS) return null;

    const safePreset = toText(preset) || LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border';
    const design = getEffectiveDesign(getLineIconDesign(safePreset), imageConfig);
    if (!design) return null;

    const safeCode = toText(code);
    const styleContext = {
        borderColor,
        fillColor,
        backgroundColor,
        lineColor: fillColor,
        dark
    };
    const fittedViewBox = getFittedFrameViewBox(design, styleContext);
    const svg = createSvgNode(documentRef, 'svg', {
        ...(design.svg?.attrs || {}),
        ...(fittedViewBox ? { viewBox: fittedViewBox } : {})
    });
    setStyles(svg, {
        ...resolveConfiguredStyles(design.svg?.style || {}, styleContext),
        ...svgStyle
    });

    if (design.image) {
        appendTrainImage({
            svg,
            documentRef,
            design,
            trainIconHref,
            borderColor,
            fillColor,
            backgroundColor
        });
    } else {
        const shape = createLineIconFrameNode({
            documentRef,
            design,
            borderColor,
            fillColor,
            backgroundColor
        });
        if (shape) svg.appendChild(shape);
    }

    appendCenteredText({ svg, documentRef, code: safeCode, design, dark, fillColor });

    const resolvedRootStyle = resolveConfiguredStyles(design.html?.rootStyle || {}, styleContext);
    setStyles(root, {
        ...resolvedRootStyle,
        width: root.style.width || resolvedRootStyle.width || '25px',
        height: root.style.height || resolvedRootStyle.height || '25px',
        ...rootStyle
    });

    clearChildren(root);
    root.appendChild(svg);
    return svg;
};
