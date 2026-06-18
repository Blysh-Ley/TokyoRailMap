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
        node.style[key] = String(value);
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
    return value;
};

const resolveConfiguredAttrs = (attrs = {}, context = {}) => {
    const result = {};
    for (const [key, value] of Object.entries(attrs || {})) {
        result[key] = resolveConfiguredValue(value, context);
    }
    return result;
};

const getLineIconDesign = (designName) => {
    const name = toText(designName);
    const fallbackName = LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border';
    return LINE_ICON_DESIGNS[name] || LINE_ICON_DESIGNS[fallbackName] || LINE_ICON_DESIGNS.default || null;
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

    return createSvgNode(documentRef, shapeConfig.tag, resolveConfiguredAttrs(shapeConfig.attrs, {
        borderColor,
        fillColor,
        backgroundColor
    }));
};

const getTextModel = ({ code, design, dark, fillColor }) => {
    const length = toText(code).length;
    const model = design?.text || {};

    return {
        ...model,
        color: resolveConfiguredValue(model.color, { dark, fillColor }),
        fontSize: pickByCodeLength(model.fontSizeByCodeLength, length, model.fontSize),
        textLength: pickByCodeLength(model.textLengthByCodeLength, length, model.textLength)
    };
};

const appendCenteredText = ({ svg, documentRef, code, design, dark, fillColor }) => {
    const safeCode = toText(code);
    if (!safeCode) return;

    const textModel = getTextModel({ code: safeCode, design, dark, fillColor });
    if (textModel.hidden) return;
    const textLength = textModel.textLength || pickByCodeLength(textModel.textLengthByCodeLength, safeCode.length, 66);
    const textAttrs = {
        ...(textModel.attrs || {}),
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

const appendTrainImage = ({ svg, documentRef, design, trainIconHref }) => {
    const href = toText(trainIconHref);
    if (!href) return;

    svg.appendChild(createSvgNode(documentRef, 'image', {
        ...(design?.image?.attrs || {}),
        href,
    }));
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
    rootStyle = {},
    svgStyle = {}
} = {}) => {
    if (!root?.style || !documentRef?.createElementNS) return null;

    const safePreset = toText(preset) || LINE_ICON_SETTINGS.defaultDesign || 'rectangle-border';
    const design = getLineIconDesign(safePreset);
    if (!design) return null;

    const safeCode = toText(code);
    const svg = createSvgNode(documentRef, 'svg', design.svg?.attrs || {});
    setStyles(svg, {
        ...(design.svg?.style || {}),
        ...svgStyle
    });

    if (design.image) {
        appendTrainImage({ svg, documentRef, design, trainIconHref });
    } else {
        const shape = createShape({
            documentRef,
            design,
            borderColor,
            fillColor,
            backgroundColor
        });
        if (shape) svg.appendChild(shape);
    }

    appendCenteredText({ svg, documentRef, code: safeCode, design, dark, fillColor });

    setStyles(root, {
        ...(design.html?.rootStyle || {}),
        width: root.style.width || design.html?.rootStyle?.width || '25px',
        height: root.style.height || design.html?.rootStyle?.height || '25px',
        ...rootStyle
    });

    clearChildren(root);
    root.appendChild(svg);
    return svg;
};
