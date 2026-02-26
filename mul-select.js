/*
 * mul-select.js
 * 多选模式 FAB（ms-fab）
 */

(() => {
    'use strict';

    const EVENT = '__TokyoRailMultiSelectModeChanged';
    const LAYERS_EVENT = '__TokyoRailMultiSelectLayersUpdated';
    const COMMAND_EVENT = '__TokyoRailMultiSelectLayersCommand';
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

    const setImgWithFallback = (img, candidates) => {
        const list = Array.isArray(candidates) ? candidates.slice() : [];
        if (!img || !list.length) return;
        let idx = 0;
        img.src = list[idx];
        img.addEventListener('error', () => {
            idx += 1;
            if (idx < list.length) img.src = list[idx];
        });
    };

    const sendLayerCommand = (action, id) => {
        try {
            const ctrl = window.__TokyoRailMultiSelectLayerControl;
            if (ctrl && typeof ctrl.runCommand === 'function') {
                ctrl.runCommand(action, id);
                return;
            }
        } catch {
            // ignore
        }

        try {
            window.dispatchEvent(new CustomEvent(COMMAND_EVENT, {
                detail: {
                    action: String(action || '').trim(),
                    id: String(id || '').trim(),
                    ts: Date.now()
                }
            }));
        } catch {
            // ignore
        }
    };

    const mount = () => {
        if (document.querySelector('.ms-ui')) return;

        const root = document.createElement('div');
        root.className = 'ms-ui is-collapsed';

        const fab = document.createElement('button');
        fab.type = 'button';
        fab.className = 'ms-fab';
        fab.setAttribute('aria-label', '多选模式');
        fab.setAttribute('aria-pressed', 'false');

        const icon = document.createElement('img');
        icon.className = 'ms-fab-icon';
        icon.alt = '';
        setImgWithFallback(icon, ['./icons/mul-select.svg', '/icons/mul-select.svg']);

        fab.appendChild(icon);

        const content = document.createElement('div');
        content.className = 'settings-content ms-content is-hidden';

        const list = document.createElement('div');
        list.className = 'ms-layer-list';
        content.appendChild(list);

        const footer = document.createElement('div');
        footer.className = 'ms-footer';

        const exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.className = 'ms-exit-btn';
        exitBtn.textContent = '退出全选';
        footer.appendChild(exitBtn);
        content.appendChild(footer);

        root.appendChild(fab);
        root.appendChild(content);
        document.body.appendChild(root);

        let enabled = false;
        let expanded = false;
        let items = [];

        const updateFabState = () => {
            fab.classList.toggle(ACTIVE_CLASS, enabled);
            fab.setAttribute('aria-pressed', enabled ? 'true' : 'false');
            document.body.classList.toggle('is-multi-select', enabled);
        };

        const expand = () => {
            if (!enabled) return;
            expanded = true;
            root.classList.remove('is-collapsed');
            content.classList.remove('is-hidden');
        };

        const collapse = () => {
            expanded = false;
            root.classList.add('is-collapsed');
            content.classList.add('is-hidden');
        };

        const buildRow = (item) => {
            const row = document.createElement('div');
            row.className = 'ms-layer-row';
            if (item?.visible === false) row.classList.add('is-hidden-on-map');

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'ms-layer-btn ms-layer-btn-toggle';
            toggleBtn.setAttribute('aria-label', item?.visible === false ? '显示图层' : '隐藏图层');

            const toggleIcon = document.createElement('img');
            toggleIcon.className = 'ms-layer-btn-icon';
            toggleIcon.alt = '';
            if (item?.visible === false) {
                setImgWithFallback(toggleIcon, ['./icons/eye-slash.svg', '/icons/eye-slash.svg']);
            } else {
                setImgWithFallback(toggleIcon, ['./icons/eye.svg', '/icons/eye.svg']);
            }
            toggleBtn.appendChild(toggleIcon);

            const text = document.createElement('div');
            text.className = 'ms-layer-text';
            const lineName = String(item?.lineName || '未知线路').trim() || '未知线路';
            const originName = String(item?.originName || '-').trim() || '-';
            const terminalName = String(item?.terminalName || '-').trim() || '-';
            const typeName = String(item?.typeName || '-').trim() || '-';
            if (String(item?.scope || '') === 'base') {
                text.textContent = lineName;
            } else {
                text.textContent = `${lineName} / ${originName} - ${terminalName} / ${typeName}`;
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'ms-layer-btn ms-layer-btn-remove';
            removeBtn.setAttribute('aria-label', '删除图层');

            const removeIcon = document.createElement('img');
            removeIcon.className = 'ms-layer-btn-icon';
            removeIcon.alt = '';
            setImgWithFallback(removeIcon, ['./icons/x.svg', '/icons/x.svg']);
            removeBtn.appendChild(removeIcon);

            toggleBtn.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                sendLayerCommand('toggle-visibility', String(item?.id || ''));
            });

            removeBtn.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();
                sendLayerCommand('remove', String(item?.id || ''));
            });

            row.appendChild(toggleBtn);
            row.appendChild(text);
            row.appendChild(removeBtn);
            return row;
        };

        const renderItems = () => {
            list.innerHTML = '';

            if (!enabled) return;

            if (!Array.isArray(items) || !items.length) {
                const empty = document.createElement('div');
                empty.className = 'ms-layer-empty';
                empty.textContent = '暂无已选图层';
                list.appendChild(empty);
                return;
            }

            for (const item of items) {
                list.appendChild(buildRow(item));
            }
        };

        const setEnabled = (next) => {
            enabled = next === true;
            updateFabState();
            if (!enabled) {
                collapse();
            }
            renderItems();
            dispatchState(enabled);
            if (enabled) {
                try {
                    window.__TokyoRailMultiSelectLayerControl?.requestSync?.();
                } catch {
                    // ignore
                }
            }
        };

        fab.addEventListener('mouseenter', () => {
            if (enabled) expand();
        });

        root.addEventListener('mouseenter', () => {
            if (enabled) expand();
        });

        root.addEventListener('mouseleave', () => {
            if (enabled) collapse();
        });

        fab.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (!enabled) {
                setEnabled(true);
                expand();
                return;
            }

            if (expanded) {
                setEnabled(false);
            } else {
                expand();
            }
        });

        exitBtn.addEventListener('click', (evt) => {
            evt.preventDefault?.();
            evt.stopPropagation?.();
            if (!enabled) return;
            setEnabled(false);
        });

        window.addEventListener(LAYERS_EVENT, (evt) => {
            const detail = evt?.detail || {};
            items = Array.isArray(detail?.items) ? detail.items : [];
            if (typeof detail?.enabled === 'boolean' && detail.enabled !== enabled) {
                enabled = detail.enabled === true;
                updateFabState();
                if (!enabled) collapse();
            }
            renderItems();
        });

        updateFabState();
        dispatchState(false);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }
})();
