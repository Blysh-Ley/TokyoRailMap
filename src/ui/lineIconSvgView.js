const SVG_NS = 'http://www.w3.org/2000/svg';

const toText = (value) => String(value ?? '').trim();

const setAttributes = (node, attrs = {}) => {
    for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        node.setAttribute(key, String(value));
    }
    return node;
};

const createSvgNode = (documentRef, tagName, attrs = {}) => {
    const node = documentRef.createElementNS(SVG_NS, tagName);
    return setAttributes(node, attrs);
};

const clearChildren = (node) => {
    if (typeof node.replaceChildren === 'function') {
        node.replaceChildren();
        return;
    }
    while (node.firstChild) node.removeChild(node.firstChild);
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
    preset,
    borderColor,
    fillColor,
    backgroundColor
}) => {
    switch (preset) {
        case 'nippori-toneri':
            return createNipporiToneriFrame(documentRef);
        case 'circle':
            return createSvgNode(documentRef, 'circle', {
                cx: 50,
                cy: 50,
                r: 44,
                fill: fillColor
            });
        case 'circle-border':
            return createSvgNode(documentRef, 'circle', {
                cx: 50,
                cy: 50,
                r: 38,
                fill: backgroundColor,
                stroke: borderColor,
                'stroke-width': 20
            });
        case 'circle-thin-border':
            return createSvgNode(documentRef, 'circle', {
                cx: 50,
                cy: 50,
                r: 41,
                fill: backgroundColor,
                stroke: borderColor,
                'stroke-width': 12
            });
        case 'hexagon':
            return createSvgNode(documentRef, 'polygon', {
                points: '50 5,89 27,89 73,50 95,11 73,11 27',
                fill: fillColor
            });
        case 'rectangle':
            return createSvgNode(documentRef, 'rect', {
                x: 8,
                y: 8,
                width: 84,
                height: 84,
                rx: 12,
                fill: fillColor
            });
        case 'rectangle-border':
        default:
            return createSvgNode(documentRef, 'rect', {
                x: 10,
                y: 10,
                width: 80,
                height: 80,
                rx: 11,
                fill: backgroundColor,
                stroke: borderColor,
                'stroke-width': 14
            });
    }
};

const getTextModel = ({ code, preset, dark, fillColor }) => {
    const length = toText(code).length;
    const trainPreset = ['arakawa', 'odakyu', 'seibu'].includes(preset);

    if (preset === 'circle') {
        return {
            color: dark ? '#000' : '#fff',
            fontSize: length <= 1 ? 58 : (length === 2 ? 46 : 34),
            y: 52
        };
    }

    if (preset === 'rectangle') {
        return {
            color: dark ? '#000' : '#fff',
            fontSize: length <= 1 ? 63 : (length === 2 ? 53 : 34),
            y: 52,
            textLength: length <= 1 ? 38 : (length === 2 ? 58 : 72),
            transform: 'translate(0 -3)'
        };
    }

    if (preset === 'nippori-toneri') {
        return {
            color: '#000',
            fontSize: length <= 1 ? 48 : (length === 2 ? 40 : 29),
            y: 52
        };
    }

    if (preset === 'odakyu') {
        return {
            color: fillColor || '#000',
            fontSize: length <= 1 ? 56 : (length === 2 ? 46 : 34),
            y: 51,
            transform: 'translate(0 -3)'
        };
    }

    if (preset === 'seibu') {
        return {
            color: '#000',
            fontSize: length <= 1 ? 48 : (length === 2 ? 36 : 24),
            y: 65,
            transform: 'translate(0 -35)'
        };
    }

    if (trainPreset) {
        return {
            color: '#000',
            fontSize: length <= 1 ? 42 : (length === 2 ? 34 : 26),
            y: 52
        };
    }

    return {
        color: dark ? '#fff' : '#000',
        fontSize: length <= 1 ? 48 : (length === 2 ? 40 : 29),
        y: 52
    };
};

const appendCenteredText = ({ svg, documentRef, code, preset, dark, fillColor }) => {
    const safeCode = toText(code);
    if (!safeCode) return;

    const textModel = getTextModel({ code: safeCode, preset, dark, fillColor });
    const textLength = textModel.textLength || (safeCode.length <= 1 ? 32 : (safeCode.length === 2 ? 50 : 66));
    const textAttrs = {
        x: 50,
        y: textModel.y,
        fill: textModel.color,
        'font-family': 'Arial, Helvetica, sans-serif',
        'font-size': textModel.fontSize,
        'font-weight': 800,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        lengthAdjust: 'spacingAndGlyphs',
        textLength
    };
    if (textModel.transform) textAttrs.transform = textModel.transform;

    const text = createSvgNode(documentRef, 'text', textAttrs);
    text.textContent = safeCode;
    svg.appendChild(text);
};

const appendTrainImage = ({ svg, documentRef, trainIconHref }) => {
    const href = toText(trainIconHref);
    if (!href) return;

    svg.appendChild(createSvgNode(documentRef, 'image', {
        href,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        preserveAspectRatio: 'xMidYMid meet'
    }));
};

export const renderLineIconSvg = (root, {
    documentRef = globalThis.document,
    code = '',
    preset = 'rectangle-border',
    borderColor = 'transparent',
    fillColor = '#888',
    backgroundColor = '#fff',
    dark = false,
    trainIconHref = ''
} = {}) => {
    if (!root?.style || !documentRef?.createElementNS) return null;

    const safePreset = toText(preset) || 'rectangle-border';
    const safeCode = toText(code);
    const isTrainPreset = ['arakawa', 'nex', 'odakyu', 'seibu'].includes(safePreset);
    const svg = createSvgNode(documentRef, 'svg', {
        viewBox: '0 0 100 100',
        width: '100%',
        height: '100%',
        'aria-hidden': 'true',
        focusable: 'false',
        role: 'img'
    });
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    if (isTrainPreset) {
        appendTrainImage({ svg, documentRef, trainIconHref });
    } else {
        svg.appendChild(createShape({
            documentRef,
            preset: safePreset,
            borderColor,
            fillColor,
            backgroundColor
        }));
    }

    if (safePreset !== 'nex') {
        appendCenteredText({
            svg,
            documentRef,
            code: safeCode || '1',
            preset: safePreset,
            dark,
            fillColor
        });
    }

    root.style.display = 'inline-flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.boxSizing = 'border-box';
    root.style.flex = '0 0 auto';
    root.style.userSelect = 'none';
    root.style.width = root.style.width || '25px';
    root.style.height = root.style.height || '25px';
    root.style.padding = '0';
    root.style.border = '0';
    root.style.borderRadius = '0';
    root.style.background = 'transparent';
    root.style.color = 'inherit';
    root.style.lineHeight = '0';
    root.style.letterSpacing = '0';
    root.style.fontSize = '';
    root.style.fontWeight = '';
    root.style.overflow = 'visible';

    clearChildren(root);
    root.appendChild(svg);
    return svg;
};
