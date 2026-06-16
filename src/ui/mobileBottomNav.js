import { JOURNEY_CLEAR_REQUEST_EVENT } from '../store/events.js';

export const MOBILE_BOTTOM_NAV_EVENT = 'tokyoRail:mobileNavSelect';

// Icons are inline Lucide SVG paths. Lucide is ISC licensed; search is MIT via Feather.
// Sources: https://lucide.dev/icons/map, /menu, /search, /settings and https://lucide.dev/license
const ICONS = Object.freeze({
    map: `
        <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>
        <path d="M15 5.764v15"/>
        <path d="M9 3.236v15"/>
    `,
    menu: `
        <path d="M4 12h16"/>
        <path d="M4 18h16"/>
        <path d="M4 6h16"/>
    `,
    search: `
        <path d="m21 21-4.34-4.34"/>
        <circle cx="11" cy="11" r="8"/>
    `,
    station: `
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
        <circle cx="12" cy="10" r="3"/>
    `,
    route: `
        <circle cx="6" cy="19" r="3"/>
        <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>
        <circle cx="18" cy="5" r="3"/>
    `,
    settings: `
        <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/>
        <circle cx="12" cy="12" r="3"/>
    `
});

export const MOBILE_BOTTOM_NAV_ITEMS = Object.freeze([
    { id: 'map', label: '地图', icon: 'map' },
    { id: 'menu', label: '线路', icon: 'menu' },
    { id: 'search', label: '搜索', icon: 'search' },
    { id: 'settings', label: '设置', icon: 'settings' }
]);

const MOBILE_SEARCH_MODES = Object.freeze([
    { id: 'station', label: '搜索', icon: 'station' },
    { id: 'journey', label: '路线规划', icon: 'route' }
]);

const createIconMarkup = (iconName) => `
    <svg class="mobile-bottom-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        ${ICONS[iconName] || ''}
    </svg>
`;

const setActiveDataset = (doc, itemId) => {
    const value = String(itemId || 'map');
    if (doc?.documentElement?.dataset) doc.documentElement.dataset.mobileNavActive = value;
    if (doc?.body?.dataset) doc.body.dataset.mobileNavActive = value;
};

const setMobileSearchFocusDataset = (doc, value) => {
    const focus = String(value || '').trim();
    const root = doc?.documentElement;
    const body = doc?.body;
    if (focus) {
        if (root?.dataset) root.dataset.mobileSearchFocus = focus;
        if (body?.dataset) body.dataset.mobileSearchFocus = focus;
    } else {
        if (root?.dataset) delete root.dataset.mobileSearchFocus;
        if (body?.dataset) delete body.dataset.mobileSearchFocus;
    }
};

const setMobileSearchModeDataset = (doc, value) => {
    const mode = value === 'journey' ? 'journey' : 'station';
    if (doc?.documentElement?.dataset) doc.documentElement.dataset.mobileSearchMode = mode;
    if (doc?.body?.dataset) doc.body.dataset.mobileSearchMode = mode;
    return mode;
};

const isMobileUiActive = (doc) => {
    const rootDataset = doc?.documentElement?.dataset || {};
    const bodyDataset = doc?.body?.dataset || {};
    return rootDataset.mobileUi === '1' || bodyDataset.mobileUi === '1';
};

const isMobileNavItemActive = (doc, nav, itemId) => {
    const id = String(itemId || '').trim();
    if (!id) return false;
    const rootDataset = doc?.documentElement?.dataset || {};
    const bodyDataset = doc?.body?.dataset || {};
    return nav?.dataset?.activeItem === id
        || rootDataset.mobileNavActive === id
        || bodyDataset.mobileNavActive === id;
};

const isJourneyUiActiveForMobile = (doc) => {
    const journeyRoot = doc?.querySelector?.('.journey-ui');
    if (!journeyRoot) return false;
    const rootDataset = doc?.documentElement?.dataset || {};
    const bodyDataset = doc?.body?.dataset || {};
    return !journeyRoot.classList?.contains?.('is-collapsed')
        || rootDataset.mobileSearchMode === 'journey'
        || bodyDataset.mobileSearchMode === 'journey'
        || rootDataset.mobileSearchFocus === 'journey'
        || bodyDataset.mobileSearchFocus === 'journey';
};

const requestJourneyClear = (doc, win, reason) => {
    if (!isJourneyUiActiveForMobile(doc)) return false;
    try {
        win?.dispatchEvent?.(new CustomEvent(JOURNEY_CLEAR_REQUEST_EVENT, {
            detail: {
                reason,
                source: 'mobile-bottom-nav',
                ts: Date.now()
            }
        }));
        return true;
    } catch {
        return false;
    }
};

const closeMobileSettingsPanel = (doc) => {
    const settingsRoot = doc?.querySelector?.('.settings-ui');
    if (!settingsRoot) return false;
    settingsRoot.classList?.add?.('is-collapsed');
    settingsRoot.classList?.remove?.('is-mobile-settings-panel');
    settingsRoot.querySelector?.('.settings-content')?.classList?.add?.('is-hidden');
    return true;
};

const collapseLegacyFloatingUi = (doc, win, itemId) => {
    if (itemId !== 'search') {
        requestJourneyClear(doc, win, 'nav-switch');
        doc?.querySelector?.('.search-ui')?.classList?.add?.('is-collapsed');
        doc?.querySelector?.('.journey-ui')?.classList?.add?.('is-collapsed');
        setMobileSearchFocusDataset(doc, '');
        setMobileSearchModeDataset(doc, 'station');
    }
    if (itemId !== 'settings') {
        closeMobileSettingsPanel(doc);
    }
};

const openMobileSettingsPanel = (doc) => {
    const settingsRoot = doc?.querySelector?.('.settings-ui');
    if (!settingsRoot) return false;
    settingsRoot.classList.remove('is-collapsed');
    settingsRoot.classList.add('is-mobile-settings-panel');
    settingsRoot.querySelector?.('.settings-content')?.classList?.remove?.('is-hidden');
    return true;
};

const isMobileSettingsPanelOpen = (doc, nav) => {
    if (!isMobileUiActive(doc)) return false;
    if (isMobileNavItemActive(doc, nav, 'settings')) return true;
    const settingsRoot = doc?.querySelector?.('.settings-ui');
    if (!settingsRoot) return false;
    return settingsRoot.classList?.contains?.('is-mobile-settings-panel') === true
        && settingsRoot.classList?.contains?.('is-collapsed') !== true;
};

const openLegacyFloatingUi = (doc, win, itemId, getSearchMode = () => 'station') => {
    if (itemId === 'search') {
        const mode = setMobileSearchModeDataset(doc, getSearchMode());
        setMobileSearchFocusDataset(doc, mode);
        if (mode === 'journey') {
            doc?.querySelector?.('.search-ui')?.classList?.add?.('is-collapsed');
            doc?.querySelector?.('.journey-ui')?.classList?.remove?.('is-collapsed');
        } else {
            doc?.querySelector?.('.journey-ui')?.classList?.add?.('is-collapsed');
        }
    }

    if (itemId === 'settings' && openMobileSettingsPanel(doc)) return;

    const selector = itemId === 'search'
        ? '.search-fab'
        : (itemId === 'settings' ? '.settings-fab' : '');
    if (!selector) return;

    const run = () => {
        const button = doc?.querySelector?.(selector);
        button?.click?.();
    };
    if (typeof win?.requestAnimationFrame === 'function') win.requestAnimationFrame(run);
    else run();
};

const createSearchModeSwitch = (doc) => {
    const root = doc.createElement('div');
    root.className = 'mobile-search-mode-switch';
    root.setAttribute('role', 'tablist');
    root.setAttribute('aria-label', '移动端搜索模式');

    const buttons = new Map();
    for (const mode of MOBILE_SEARCH_MODES) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'mobile-search-mode-btn';
        button.dataset.mobileSearchMode = mode.id;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-label', mode.label);
        button.innerHTML = `${createIconMarkup(mode.icon)}<span>${mode.label}</span>`;
        root.appendChild(button);
        buttons.set(mode.id, button);
    }

    const setActive = (mode) => {
        const id = mode === 'journey' ? 'journey' : 'station';
        root.dataset.activeMode = id;
        for (const [buttonId, button] of buttons) {
            const active = buttonId === id;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        return id;
    };

    setActive('station');
    return { buttons, root, setActive };
};

export const installMobileBottomNav = ({
    doc = globalThis.document,
    win = globalThis.window,
    onSelect = null
} = {}) => {
    if (!doc?.createElement) return null;

    const existing = doc.querySelector?.('.mobile-bottom-nav');
    if (existing?.__tokyoRailMobileBottomNavController) {
        return existing.__tokyoRailMobileBottomNavController;
    }

    const nav = doc.createElement('nav');
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', '移动端导航');
    nav.dataset.activeItem = 'map';

    const buttons = new Map();
    for (const item of MOBILE_BOTTOM_NAV_ITEMS) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'mobile-bottom-nav-btn';
        button.dataset.mobileBottomNavItem = item.id;
        button.setAttribute('aria-label', item.label);
        button.innerHTML = `${createIconMarkup(item.icon)}<span class="mobile-bottom-nav-label">${item.label}</span>`;
        nav.appendChild(button);
        buttons.set(item.id, button);
    }

    const searchModeSwitch = createSearchModeSwitch(doc);
    let searchMode = 'station';

    const setSearchMode = (mode, { focus = true } = {}) => {
        const previousSearchMode = searchMode;
        searchMode = searchModeSwitch.setActive(setMobileSearchModeDataset(doc, mode));
        if (searchMode === 'journey') {
            setMobileSearchFocusDataset(doc, 'journey');
            doc?.querySelector?.('.search-ui')?.classList?.add?.('is-collapsed');
            doc?.querySelector?.('.journey-ui')?.classList?.remove?.('is-collapsed');
            if (focus) doc?.querySelector?.('.journey-input-origin')?.focus?.();
        } else {
            if (previousSearchMode === 'journey') {
                requestJourneyClear(doc, win, 'search-mode-switch');
            }
            setMobileSearchFocusDataset(doc, 'station');
            doc?.querySelector?.('.journey-ui')?.classList?.add?.('is-collapsed');
            if (focus) doc?.querySelector?.('.search-input')?.focus?.();
        }
    };

    const emitSelect = (itemId) => {
        try {
            win?.dispatchEvent?.(new CustomEvent(MOBILE_BOTTOM_NAV_EVENT, {
                detail: {
                    item: itemId,
                    ts: Date.now()
                }
            }));
        } catch {
            // ignore
        }
    };

    const setActive = (itemId, { emit = true } = {}) => {
        const id = buttons.has(itemId) ? itemId : 'map';
        nav.dataset.activeItem = id;
        setActiveDataset(doc, id);
        collapseLegacyFloatingUi(doc, win, id);
        for (const [buttonId, button] of buttons) {
            const active = buttonId === id;
            button.classList.toggle('is-active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        }
        if (id === 'search') setSearchMode(searchMode, { focus: false });
        openLegacyFloatingUi(doc, win, id, () => searchMode);
        if (typeof onSelect === 'function') onSelect(id);
        if (emit) emitSelect(id);
    };

    const handleBackIntent = () => {
        if (!isMobileSettingsPanelOpen(doc, nav)) return false;
        setActive('map', { emit: false });
        return true;
    };

    nav.addEventListener('click', (event) => {
        const button = event.target?.closest?.('.mobile-bottom-nav-btn');
        const itemId = button?.dataset?.mobileBottomNavItem;
        if (!itemId) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        setActive(itemId);
    });

    searchModeSwitch.root.addEventListener('click', (event) => {
        const button = event.target?.closest?.('.mobile-search-mode-btn');
        const mode = button?.dataset?.mobileSearchMode;
        if (!mode) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        setActive('search');
        setSearchMode(mode, { focus: true });
    });

    (doc.body || doc.documentElement)?.appendChild?.(nav);
    (doc.body || doc.documentElement)?.appendChild?.(searchModeSwitch.root);
    const controller = {
        root: nav,
        searchModeRoot: searchModeSwitch.root,
        setActive,
        setSearchMode,
        handleBackIntent,
        getActive: () => nav.dataset.activeItem || 'map'
    };
    nav.__tokyoRailMobileBottomNavController = controller;
    setActive('map', { emit: false });
    return controller;
};
