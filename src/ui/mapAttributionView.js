const ATTRIBUTION_ITEMS = Object.freeze([
    {
        group: 'engine',
        label: 'MapLibre',
        href: 'https://maplibre.org/'
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

const createMapAttributionControl = (doc) => {
    if (!doc?.createElement) return null;
    const root = doc.createElement('div');
    root.className = 'tokyo-map-attribution-control';
    root.setAttribute('data-map-attribution-mobile', '0');

    const button = doc.createElement('button');
    button.className = 'tokyo-map-attribution-toggle';
    button.type = 'button';
    button.title = 'Map attribution';
    button.setAttribute('aria-label', 'Map attribution');
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'i';

    const inner = doc.createElement('div');
    inner.className = 'tokyo-map-attribution-inner';

    root.append(button, inner);
    return { root, button, inner };
};

export const applyAttributionExpandedState = (control, expanded) => {
    if (!control) return false;
    const shouldExpand = expanded === true;
    control.setAttribute('data-map-attribution-expanded', shouldExpand ? '1' : '0');
    control.classList?.toggle?.('is-expanded', shouldExpand);
    const button = control.querySelector?.('.tokyo-map-attribution-toggle, button');
    button?.setAttribute?.('aria-expanded', shouldExpand ? 'true' : 'false');
    return true;
};

export const syncAttributionToggleState = (control, compact) => {
    if (!control) return false;
    const shouldCompact = compact === true;
    const wasMobile = control.getAttribute('data-map-attribution-mobile') === '1';
    control.setAttribute('data-map-attribution-mobile', shouldCompact ? '1' : '0');
    if (shouldCompact) {
        applyAttributionExpandedState(
            control,
            wasMobile && control.getAttribute('data-map-attribution-expanded') === '1'
        );
    } else {
        applyAttributionExpandedState(control, true);
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
            || target?.closest?.('.tokyo-map-attribution-toggle')
            || target?.tagName === 'BUTTON';
        if (!isToggle) return;
        event?.preventDefault?.();
        applyAttributionExpandedState(
            control,
            control.getAttribute('data-map-attribution-expanded') !== '1'
        );
    });
};

export const installMapAttributionView = ({
    doc = globalThis.document,
    mapEngine = null,
    container = null,
    isCompact = false
} = {}) => {
    const parent = container || doc?.getElementById?.('map') || doc?.body || null;
    const control = createMapAttributionControl(doc);
    if (parent && control?.root) {
        parent.appendChild(control.root);
    }

    const apply = () => {
        try {
            const rendered = renderMapAttributionInner(control?.inner, { doc });
            bindAttributionToggle(control?.root);
            syncAttributionToggleState(control?.root, typeof isCompact === 'function' ? isCompact() : isCompact);
            return rendered;
        } catch {
            return false;
        }
    };

    apply();
    mapEngine?.on?.('styledata', apply);
    return {
        apply,
        destroy: () => {
            control?.root?.remove?.();
        },
        getElement: () => control?.root || null
    };
};
