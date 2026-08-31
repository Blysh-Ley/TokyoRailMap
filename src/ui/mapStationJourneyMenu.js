const defaultStopEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
};

export const createMapStationJourneyMenu = ({
    doc = globalThis.document,
    container,
    getWaypointOptions = () => [],
    getMenuItems = null,
    onSelectField = () => {},
    stopEvent = defaultStopEvent,
    labels = {}
} = {}) => {
    if (!doc || !container) {
        throw new Error('createMapStationJourneyMenu requires doc and container');
    }

    const root = doc.createElement('div');
    root.className = 'panel-map-select-ui map-station-journey-menu';

    const menu = doc.createElement('div');
    menu.className = 'panel-map-select-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', labels.menu || 'Use station as origin, waypoint or destination');
    root.appendChild(menu);
    container.appendChild(root);

    let activeStation = null;

    const close = () => {
        root.classList.remove('is-open');
        activeStation = null;
    };

    const select = (action, event) => {
        stopEvent(event);
        const station = activeStation;
        close();
        if (!station) return;
        onSelectField(action, station);
    };

    const createMenuItem = ({ action, text }) => {
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'panel-map-select-item';
        item.textContent = text || '';
        item.setAttribute('role', 'menuitem');
        item.addEventListener('click', (event) => select(action, event), { passive: false });
        return item;
    };

    const rebuildMenu = () => {
        while (menu.firstChild) menu.removeChild(menu.firstChild);
        const customItems = typeof getMenuItems === 'function' ? getMenuItems() : null;
        if (Array.isArray(customItems)) {
            menu.setAttribute('aria-label', customItems.length === 1
                ? customItems[0].text || labels.menu || 'Use station'
                : labels.menu || 'Use station');
            for (const item of customItems) menu.appendChild(createMenuItem(item));
            return;
        }
        menu.setAttribute('aria-label', labels.menu || 'Use station as origin, waypoint or destination');
        menu.appendChild(createMenuItem({
            action: { field: 'origin' },
            text: labels.origin || 'Origin'
        }));

        const waypointOptions = typeof getWaypointOptions === 'function' ? getWaypointOptions() : [];
        for (const option of Array.isArray(waypointOptions) ? waypointOptions : []) {
            const index = Number(option?.index);
            if (!Number.isFinite(index) || index < 0) continue;
            menu.appendChild(createMenuItem({
                action: { field: 'waypoint', waypointIndex: index },
                text: option?.label || `Waypoint ${index + 1}`
            }));
        }

        menu.appendChild(createMenuItem({
            action: { field: 'waypoint', waypointIndex: -1 },
            text: labels.newWaypoint || 'New waypoint'
        }));
        menu.appendChild(createMenuItem({
            action: { field: 'destination' },
            text: labels.destination || 'Destination'
        }));
    };

    const open = ({ point, station } = {}) => {
        const x = Number(point?.x);
        const y = Number(point?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !station) return false;

        activeStation = station;
        rebuildMenu();
        root.style.setProperty('--map-station-journey-menu-x', `${x}px`);
        root.style.setProperty('--map-station-journey-menu-y', `${y}px`);
        root.classList.add('is-open');
        return true;
    };

    const onDocumentPointerDown = (event) => {
        if (!root.classList.contains('is-open')) return;
        if (event?.target && root.contains(event.target)) return;
        close();
    };
    doc.addEventListener('pointerdown', onDocumentPointerDown, true);

    return {
        close,
        destroy: () => {
            doc.removeEventListener('pointerdown', onDocumentPointerDown, true);
            root.remove();
        },
        el: root,
        isOpen: () => root.classList.contains('is-open'),
        open
    };
};
