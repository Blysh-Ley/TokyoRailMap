import { loadSettingsIcon } from './settingsIconLoader.js';

export const createSettingsMenu = ({
    getIconCandidates,
    getPreferredCachedImageSrc,
    setImageElementFromCache
} = {}) => {
    const existing = document.querySelector('.settings-ui');
    if (existing) {
        return existing.querySelector('.settings-content') || existing;
    }

    const root = document.createElement('div');
    root.className = 'settings-ui is-collapsed';

    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'settings-fab';
    fab.setAttribute('aria-label', 'Settings');

    const fabIcon = document.createElement('img');
    fabIcon.className = 'settings-fab-icon';
    fabIcon.alt = '';
    loadSettingsIcon({
        img: fabIcon,
        iconName: 'settings.svg',
        getIconCandidates,
        getPreferredCachedImageSrc,
        setImageElementFromCache
    });
    fab.appendChild(fabIcon);

    const content = document.createElement('div');
    content.className = 'settings-content is-hidden';

    root.appendChild(fab);
    root.appendChild(content);
    document.body.appendChild(root);

    let collapseTimer = null;
    let enterTimer = null;

    const expand = () => {
        if (collapseTimer) {
            window.clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        root.classList.remove('is-collapsed');
        content.classList.remove('is-hidden');
    };

    const collapse = () => {
        if (collapseTimer) {
            window.clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        root.classList.add('is-collapsed');
        content.classList.add('is-hidden');
    };

    const scheduleCollapse = () => {
        if (collapseTimer) window.clearTimeout(collapseTimer);
        collapseTimer = window.setTimeout(() => {
            collapseTimer = null;
            collapse();
        }, 120);
    };

    root.addEventListener('mouseenter', () => {
        if (collapseTimer) {
            window.clearTimeout(collapseTimer);
            collapseTimer = null;
        }
        if (enterTimer) {
            window.clearTimeout(enterTimer);
            enterTimer = null;
        }
        enterTimer = window.setTimeout(() => {
            enterTimer = null;
            expand();
        }, 100);
    });

    root.addEventListener('mouseleave', (evt) => {
        const toEl = evt?.relatedTarget;
        if (toEl && toEl instanceof Element && toEl.closest('.settings-time-picker')) return;
        if (window.__TokyoRailTimePickerOpen === true) return;
        if (enterTimer) {
            window.clearTimeout(enterTimer);
            enterTimer = null;
        }
        scheduleCollapse();
    });

    fab.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        if (root.classList.contains('is-collapsed')) expand();
        else collapse();
    });

    fab.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        if (root.classList.contains('is-collapsed')) expand();
        else collapse();
    });

    document.addEventListener('pointerdown', (evt) => {
        if (root.classList.contains('is-collapsed')) return;
        const target = evt?.target;
        if (target && root.contains(target)) return;
        if (target && target instanceof Element && target.closest('.settings-time-picker')) return;
        if (window.__TokyoRailTimePickerOpen === true) return;
        collapse();
    }, true);

    return content;
};
