/*
 * mul-select.js
 * 多选模式 FAB（ms-fab）
 */

(() => {
    'use strict';

    const EVENT = '__TokyoRailMultiSelectModeChanged';
    const ACTIVE_CLASS = 'is-active';

    const dispatchState = (enabled) => {
        try {
            window.__TokyoRailMultiSelectEnabled = enabled === true;
        } catch {
            // ignore
        }

        try {
            window.dispatchEvent(new CustomEvent(EVENT, {
                detail: {
                    enabled: enabled === true,
                    ts: Date.now()
                }
            }));
        } catch {
            // ignore
        }
    };

    const mount = () => {
        if (document.querySelector('.ms-fab')) return;

        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'ms-fab';
        fab.setAttribute('aria-label', '多选模式');
        fab.setAttribute('aria-pressed', 'false');

        const icon = document.createElement('img');
        icon.className = 'ms-fab-icon';
        icon.alt = '';
        {
            const candidates = ['./icons/mul-select.svg', '/icons/mul-select.svg'];
            let idx = 0;
            icon.src = candidates[idx];
            icon.addEventListener('error', () => {
                idx += 1;
                if (idx < candidates.length) icon.src = candidates[idx];
            });
        }

        fab.appendChild(icon);
        document.body.appendChild(fab);

        let enabled = false;

        const setEnabled = (next) => {
            enabled = next === true;
            fab.classList.toggle(ACTIVE_CLASS, enabled);
            fab.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            document.body.classList.toggle('is-multi-select', enabled);
            dispatchState(enabled);
        };

        fab.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            setEnabled(!enabled);
        });

        dispatchState(false);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})();
