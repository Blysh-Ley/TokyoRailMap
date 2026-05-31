export const createPanelMapSelectController = ({
    doc = globalThis.document,
    stopEvent = (event) => event?.preventDefault?.(),
    loadIcon = () => {},
    onSelectField = () => {},
    labels = {}
} = {}) => {
    const root = doc.createElement('div');
    root.className = 'panel-map-select-ui';

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'panel-map-select-btn';
    button.setAttribute('data-panel-map-select-btn', '1');
    button.setAttribute('aria-label', labels.button || 'Add station to journey');

    const icon = doc.createElement('img');
    icon.className = 'panel-map-select-icon';
    icon.alt = '';
    button.appendChild(icon);
    try {
        loadIcon(icon);
    } catch {
        // ignore
    }

    const menu = doc.createElement('div');
    menu.className = 'panel-map-select-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', labels.menu || 'Use station as origin or destination');

    const originItem = doc.createElement('button');
    originItem.type = 'button';
    originItem.className = 'panel-map-select-item';
    originItem.textContent = labels.origin || 'Origin';
    originItem.setAttribute('role', 'menuitem');

    const destinationItem = doc.createElement('button');
    destinationItem.type = 'button';
    destinationItem.className = 'panel-map-select-item';
    destinationItem.textContent = labels.destination || 'Destination';
    destinationItem.setAttribute('role', 'menuitem');

    menu.appendChild(originItem);
    menu.appendChild(destinationItem);
    root.appendChild(button);
    root.appendChild(menu);

    const open = () => {
        root.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
        root.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
    };

    const isOpen = () => root.classList.contains('is-open');

    const toggle = () => {
        if (isOpen()) close();
        else open();
    };

    let hoverCloseTimer = null;
    const cancelHoverClose = () => {
        if (hoverCloseTimer == null) return;
        clearTimeout(hoverCloseTimer);
        hoverCloseTimer = null;
    };

    const scheduleHoverClose = (delayMs = 200) => {
        cancelHoverClose();
        hoverCloseTimer = setTimeout(() => {
            hoverCloseTimer = null;
            close();
        }, Math.max(0, Number(delayMs) || 0));
    };

    button.addEventListener('mouseenter', () => {
        cancelHoverClose();
        open();
    });
    button.addEventListener('mouseleave', () => {
        scheduleHoverClose(220);
    });
    menu.addEventListener('mouseenter', () => {
        cancelHoverClose();
        open();
    });
    menu.addEventListener('mouseleave', () => {
        scheduleHoverClose(220);
    });

    let lastPointerDownAt = 0;
    button.addEventListener('pointerdown', (event) => {
        stopEvent(event);
        lastPointerDownAt = Date.now();
        toggle();
    }, { passive: false });
    button.addEventListener('click', (event) => {
        stopEvent(event);
        if (Date.now() - lastPointerDownAt < 700) return;
        toggle();
    }, { passive: false });

    const select = (field, event) => {
        stopEvent(event);
        close();
        onSelectField(field);
    };

    originItem.addEventListener('click', (event) => {
        select('origin', event);
    }, { passive: false });
    destinationItem.addEventListener('click', (event) => {
        select('destination', event);
    }, { passive: false });

    doc.addEventListener('pointerdown', (event) => {
        if (!isOpen()) return;
        const target = event?.target;
        if (target && root.contains(target)) return;
        close();
    }, true);

    return {
        close,
        el: root,
        isOpen,
        open,
        toggle
    };
};
