const ATTRIBUTION_ITEMS = Object.freeze([
    {
        group: 'engine',
        label: 'MapLibre',
        href: 'https://maplibre.org/'
    },
    {
        group: 'map',
        label: 'CARTO',
        href: 'https://carto.com/'
    },
    {
        group: 'map',
        label: 'OpenStreetMap',
        href: 'https://www.openstreetmap.org/copyright'
    },
    {
        group: 'data',
        label: 'mini-tokyo-3d',
        href: 'https://github.com/nagix/mini-tokyo-3d'
    },
    {
        group: 'fare',
        label: 'fare-map-tokyo',
        href: 'https://github.com/fksms/FareMapTokyo'
    }
]);

const ATTRIBUTION_GROUP_LABELS = Object.freeze({
    data: 'Data',
    engine: '',
    fare: 'Fare',
    map: 'Map'
});

const createAttributionLink = (item, doc) => {
    const link = doc.createElement('a');
    link.href = item.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.label;
    return link;
};

const appendGroup = (root, group, items, doc) => {
    const groupEl = doc.createElement('span');
    groupEl.className = `map-attribution-group map-attribution-group--${group}`;

    const groupLabel = ATTRIBUTION_GROUP_LABELS[group] || '';
    if (groupLabel) {
        const labelEl = doc.createElement('span');
        labelEl.className = 'map-attribution-label';
        labelEl.textContent = `${groupLabel}:`;
        groupEl.appendChild(labelEl);
    }

    items.forEach((item, index) => {
        if (index > 0) {
            const sep = doc.createElement('span');
            sep.className = 'map-attribution-link-separator';
            sep.textContent = '/';
            groupEl.appendChild(sep);
        }
        groupEl.appendChild(createAttributionLink(item, doc));
    });

    root.appendChild(groupEl);
};

export const renderMapAttributionInner = (inner, { doc = globalThis.document } = {}) => {
    if (!inner || !doc) return false;

    const root = doc.createElement('span');
    root.className = 'map-attribution';
    root.setAttribute('aria-label', 'Map and data attribution');

    const groupOrder = ['engine', 'map', 'data', 'fare'];
    const groups = new Map();
    for (const item of ATTRIBUTION_ITEMS) {
        if (!groups.has(item.group)) groups.set(item.group, []);
        groups.get(item.group).push(item);
    }

    groupOrder.forEach((group, index) => {
        const items = groups.get(group);
        if (!items?.length) return;
        if (index > 0) {
            const sep = doc.createElement('span');
            sep.className = 'map-attribution-separator';
            sep.textContent = '•';
            root.appendChild(sep);
        }
        appendGroup(root, group, items, doc);
    });

    inner.replaceChildren(root);
    return true;
};

const resolveAttributionControl = (inner) => {
    const closest = inner?.closest?.('.maplibregl-ctrl-attrib');
    if (closest) return closest;
    let node = inner?.parentElement || inner?.parentNode || null;
    while (node) {
        if (typeof node.matches === 'function' && node.matches('.maplibregl-ctrl-attrib')) return node;
        node = node.parentElement || node.parentNode || null;
    }
    return null;
};

const syncAttributionToggleState = (control, compact) => {
    if (!control) return false;
    const shouldCompact = compact === true;
    control.setAttribute('data-map-attribution-mobile', shouldCompact ? '1' : '0');
    if (shouldCompact) {
        if (!control.getAttribute('data-map-attribution-expanded')) {
            control.setAttribute('data-map-attribution-expanded', '0');
        }
    } else {
        control.removeAttribute?.('data-map-attribution-expanded');
    }

    const button = control.querySelector?.('.maplibregl-ctrl-attrib-button, button');
    if (button) {
        button.setAttribute('aria-expanded', shouldCompact && control.getAttribute('data-map-attribution-expanded') !== '1' ? 'false' : 'true');
    }
    return true;
};

const bindAttributionToggle = (control) => {
    if (!control || control.__tokyoRailAttributionToggleBound) return;
    control.__tokyoRailAttributionToggleBound = true;
    control.addEventListener?.('click', (event) => {
        if (control.getAttribute('data-map-attribution-mobile') !== '1') return;
        const target = event?.target;
        const isToggle = target === control
            || target?.closest?.('.maplibregl-ctrl-attrib-button')
            || target?.tagName === 'BUTTON';
        if (!isToggle) return;
        const nextExpanded = control.getAttribute('data-map-attribution-expanded') === '1' ? '0' : '1';
        control.setAttribute('data-map-attribution-expanded', nextExpanded);
        const button = control.querySelector?.('.maplibregl-ctrl-attrib-button, button');
        button?.setAttribute?.('aria-expanded', nextExpanded === '1' ? 'true' : 'false');
    });
};

export const installMapAttributionView = ({
    doc = globalThis.document,
    mapEngine = null,
    isCompact = false
} = {}) => {
    const apply = () => {
        try {
            const inner = doc?.querySelector?.('.maplibregl-ctrl-attrib-inner');
            const rendered = renderMapAttributionInner(inner, { doc });
            const control = resolveAttributionControl(inner);
            bindAttributionToggle(control);
            syncAttributionToggleState(control, typeof isCompact === 'function' ? isCompact() : isCompact);
            return rendered;
        } catch {
            return false;
        }
    };

    apply();
    mapEngine?.on?.('styledata', apply);
    return { apply };
};
