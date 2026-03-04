import { searchRailEntities, getLineMetaByIds } from './search.js';

function el(tag, className, attrs = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null) continue;
        if (k === 'text') node.textContent = String(v);
        else node.setAttribute(k, String(v));
    }
    return node;
}

const normalizeText = (v) => String(v ?? '').trim();

function buildStationIcon(isTransfer) {
    const wrap = el('span', 'search-result-icon');
    const dot = el('span', 'search-result-icon--station');
    const border = isTransfer ? 4 : 0.5;
    const size = isTransfer ? 18 : 12;
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.borderWidth = `${border}px`;
    wrap.appendChild(dot);
    return wrap;
}

export function mountTravelSearchUI() {
    if (document.querySelector('.journey-ui')) {
        return window.TokyoRailJourneyUI;
    }

    const root = el('div', 'journey-ui is-collapsed');

    const fab = el('button', 'journey-fab', { type: 'button', 'aria-label': '行程搜索' });
    const fabIcon = el('img', 'journey-fab-icon', { alt: '' });
    {
        const candidates = ['./icons/travel.svg', '/icons/travel.svg', './icons/search.svg', '/icons/search.svg'];
        let idx = 0;
        fabIcon.src = candidates[idx];
        fabIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) fabIcon.src = candidates[idx];
        });
    }
    fab.appendChild(fabIcon);

    const bar = el('div', 'journey-bar');
    const originWrap = el('div', 'journey-input-wrap');
    const originInput = el('input', 'journey-input journey-input-origin', {
        type: 'search',
        placeholder: '起点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const originMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择起点站' });
    const originMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    {
        const candidates = ['./icons/map-select.svg', '/icons/map-select.svg'];
        let idx = 0;
        originMapPickIcon.src = candidates[idx];
        originMapPickIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) originMapPickIcon.src = candidates[idx];
        });
    }
    originMapPickBtn.appendChild(originMapPickIcon);
    originWrap.appendChild(originInput);
    originWrap.appendChild(originMapPickBtn);

    const divider = el('span', 'journey-divider', { 'aria-hidden': 'true' });

    const destinationWrap = el('div', 'journey-input-wrap');
    const destinationInput = el('input', 'journey-input journey-input-destination', {
        type: 'search',
        placeholder: '终点站',
        autocomplete: 'off',
        spellcheck: 'false'
    });
    const destinationMapPickBtn = el('button', 'journey-map-pick-btn', { type: 'button', 'aria-label': '地图选择终点站' });
    const destinationMapPickIcon = el('img', 'journey-map-pick-icon', { alt: '' });
    {
        const candidates = ['./icons/map-select.svg', '/icons/map-select.svg'];
        let idx = 0;
        destinationMapPickIcon.src = candidates[idx];
        destinationMapPickIcon.addEventListener('error', () => {
            idx += 1;
            if (idx < candidates.length) destinationMapPickIcon.src = candidates[idx];
        });
    }
    destinationMapPickBtn.appendChild(destinationMapPickIcon);
    destinationWrap.appendChild(destinationInput);
    destinationWrap.appendChild(destinationMapPickBtn);

    bar.appendChild(originWrap);
    bar.appendChild(divider);
    bar.appendChild(destinationWrap);

    const results = el('div', 'journey-results is-hidden');
    const list = el('ul', 'search-results-list');
    results.appendChild(list);

    root.appendChild(fab);
    root.appendChild(bar);
    root.appendChild(results);
    document.body.appendChild(root);

    let activeField = 'origin';
    let selectedOriginId = '';
    let selectedDestinationId = '';
    let composingOrigin = false;
    let composingDestination = false;
    let mapPickTarget = null; // 'origin' | 'destination' | null

    const getMapInstance = () => {
        try {
            return window.__TokyoRailMap || null;
        } catch {
            return null;
        }
    };

    const setMapPickTarget = (target) => {
        mapPickTarget = target === 'origin' || target === 'destination' ? target : null;
        originMapPickBtn.classList.toggle('is-active', mapPickTarget === 'origin');
        destinationMapPickBtn.classList.toggle('is-active', mapPickTarget === 'destination');
    };

    const resolveStationByName = async (name) => {
        const q = normalizeText(name);
        if (!q) return null;
        const hits = await searchRailEntities(q, { limit: 20, allowedTypes: new Set(['station']) });
        const list = Array.isArray(hits) ? hits : [];
        const exact = list.find((x) => normalizeText(x?.text) === q);
        return exact || list[0] || null;
    };

    const applyPickedStation = async ({ target, stationId, stationName }) => {
        const key = target === 'destination' ? 'destination' : 'origin';
        const input = key === 'destination' ? destinationInput : originInput;

        let resolvedId = normalizeText(stationId);
        let resolvedName = normalizeText(stationName);

        if (!resolvedId && resolvedName) {
            const hit = await resolveStationByName(resolvedName);
            if (hit) {
                resolvedId = normalizeText(hit.id);
                if (!resolvedName) resolvedName = normalizeText(hit.text);
            }
        }

        if (!resolvedName && resolvedId) {
            const byId = await searchRailEntities(resolvedId, { limit: 10, allowedTypes: new Set(['station']) });
            const list = Array.isArray(byId) ? byId : [];
            const hit = list.find((x) => normalizeText(x?.id) === resolvedId) || list[0] || null;
            if (hit) resolvedName = normalizeText(hit.text);
        }

        if (!resolvedName && !resolvedId) return;

        input.value = resolvedName || input.value;
        input.dataset.stationId = resolvedId || '';
        if (key === 'origin') selectedOriginId = resolvedId || '';
        else selectedDestinationId = resolvedId || '';

        setMapPickTarget(null);
        results.classList.add('is-hidden');
    };

    const handleMapStationPick = async (eventLike) => {
        if (!mapPickTarget) return;

        const map = getMapInstance();
        if (!map) return;

        const point = eventLike?.point;
        const fromFeatures = (() => {
            const list = Array.isArray(eventLike?.features) ? eventLike.features : [];
            if (list.length) return list;
            if (!point) return [];
            try {
                return map.queryRenderedFeatures(point, { layers: ['stations-layer'] }) || [];
            } catch {
                return [];
            }
        })();

        const feature = fromFeatures[0];
        const props = feature?.properties || {};
        const stationId = normalizeText(props?.id || feature?.id || '');
        const stationName = normalizeText(props?.name_zh || props?.name || props?.name_ja || '');
        if (!stationId && !stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId,
            stationName
        });
    };

    const onDocumentClickCapture = async (evt) => {
        if (!mapPickTarget) return;
        const target = evt?.target;
        if (!(target instanceof Element)) return;
        const labelEl = target.closest('.station-label');
        if (!labelEl) return;

        const stationName = normalizeText(labelEl.textContent || '');
        if (!stationName) return;

        await applyPickedStation({
            target: mapPickTarget,
            stationId: '',
            stationName
        });
    };

    let mapPickHookBound = false;
    const ensureMapPickHook = () => {
        if (mapPickHookBound) return;
        const map = getMapInstance();
        if (!map || typeof map.on !== 'function') return;
        map.on('click', (e) => {
            handleMapStationPick(e);
        });
        mapPickHookBound = true;
    };

    const mapPickBindTimer = window.setInterval(() => {
        ensureMapPickHook();
        if (mapPickHookBound) window.clearInterval(mapPickBindTimer);
    }, 400);

    const getActiveInput = () => (activeField === 'destination' ? destinationInput : originInput);

    const clearList = () => {
        while (list.firstChild) list.removeChild(list.firstChild);
    };

    const expand = () => {
        if (!root.classList.contains('is-collapsed')) return;
        root.classList.remove('is-collapsed');
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
    };

    const collapse = () => {
        root.classList.add('is-collapsed');
        results.classList.add('is-hidden');
    };

    const collapseIfBothEmpty = () => {
        if (mapPickTarget) return;
        if (normalizeText(originInput.value) || normalizeText(destinationInput.value)) return;
        collapse();
    };

    const renderEmpty = (text) => {
        clearList();
        const li = document.createElement('li');
        li.appendChild(el('div', 'search-empty', { text }));
        list.appendChild(li);
        results.classList.remove('is-hidden');
    };

    const renderStationResults = async (items) => {
        clearList();
        if (!items.length) {
            renderEmpty('暂无站点结果');
            return;
        }

        for (const item of items) {
            const li = document.createElement('li');
            const row = el('div', 'search-result-item');
            const icon = buildStationIcon(item?.isTransfer === true);
            const text = el('div', 'search-result-text');
            const nameSpan = document.createElement('span');
            nameSpan.textContent = String(item?.text ?? '');
            text.appendChild(nameSpan);

            const lineMetas = await getLineMetaByIds(item?.lineIds);
            if (Array.isArray(lineMetas) && lineMetas.length) {
                const wrap = document.createElement('span');
                wrap.style.fontSize = '11px';
                wrap.appendChild(document.createTextNode('  '));

                lineMetas.forEach((meta, idx) => {
                    if (idx > 0) wrap.appendChild(document.createTextNode('、'));
                    const seg = document.createElement('span');
                    seg.textContent = String(meta?.name || '');
                    if (meta?.color) seg.style.color = String(meta.color);
                    wrap.appendChild(seg);
                });

                text.appendChild(wrap);
            }

            row.appendChild(icon);
            row.appendChild(text);

            row.addEventListener('click', (evt) => {
                evt.preventDefault?.();
                evt.stopPropagation?.();

                const input = getActiveInput();
                input.value = String(item?.text ?? '');
                input.dataset.stationId = String(item?.id ?? '');

                if (activeField === 'origin') selectedOriginId = String(item?.id ?? '');
                else selectedDestinationId = String(item?.id ?? '');

                results.classList.add('is-hidden');
            });

            li.appendChild(row);
            list.appendChild(li);
        }

        results.classList.remove('is-hidden');
    };

    const refresh = async () => {
        const input = getActiveInput();
        const q = normalizeText(input.value);
        if (!q) {
            clearList();
            results.classList.add('is-hidden');
            return;
        }

        const stationItems = await searchRailEntities(q, { limit: 30, allowedTypes: new Set(['station']) });
        await renderStationResults(Array.isArray(stationItems) ? stationItems : []);
    };

    const bindInput = (input, key) => {
        const isOrigin = key === 'origin';

        input.addEventListener('focus', () => {
            activeField = key;
            expand();
            refresh();
        });

        input.addEventListener('compositionstart', () => {
            if (isOrigin) composingOrigin = true;
            else composingDestination = true;
        });

        input.addEventListener('compositionend', () => {
            if (isOrigin) composingOrigin = false;
            else composingDestination = false;
            refresh();
        });

        input.addEventListener('input', () => {
            const composing = isOrigin ? composingOrigin : composingDestination;
            if (composing) return;

            if (isOrigin) selectedOriginId = '';
            else selectedDestinationId = '';

            refresh();
        });

        input.addEventListener('search', () => {
            refresh();
        });
    };

    bindInput(originInput, 'origin');
    bindInput(destinationInput, 'destination');

    root.addEventListener('mouseenter', () => {
        expand();
    });

    root.addEventListener('mouseleave', () => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        collapseIfBothEmpty();
    });

    fab.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    fab.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        expand();
    });

    bar.addEventListener('pointerdown', () => {
        expand();
    });

    const mapEl = document.getElementById('map');
    const shouldIgnoreTarget = (target) => {
        if (!target || !(target instanceof Element)) return false;
        if (root.contains(target)) return true;
        if (target.closest('.search-ui')) return true;
        if (target.closest('.RW-wrapper')) return true;
        if (target.closest('.maplibregl-popup')) return true;
        if (target.closest('.maplibregl-ctrl')) return true;
        return false;
    };

    const onMapPress = (evt) => {
        if (root.classList.contains('is-collapsed')) return;
        if (mapPickTarget) return;
        const target = evt?.target;
        if (shouldIgnoreTarget(target)) return;
        if (!mapEl || !target || !(target instanceof Node) || !mapEl.contains(target)) return;
        results.classList.add('is-hidden');
        collapseIfBothEmpty();
    };

    const armMapPick = (target) => {
        activeField = target === 'destination' ? 'destination' : 'origin';
        expand();
        setMapPickTarget(activeField);
        try {
            getActiveInput().focus?.();
        } catch {
            // ignore
        }
        ensureMapPickHook();
    };

    originMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    destinationMapPickBtn.addEventListener('pointerdown', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
    });

    originMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('origin');
    });

    destinationMapPickBtn.addEventListener('click', (evt) => {
        evt.preventDefault?.();
        evt.stopPropagation?.();
        armMapPick('destination');
    });

    if (typeof window !== 'undefined' && 'PointerEvent' in window) {
        document.addEventListener('pointerdown', onMapPress, true);
    } else {
        document.addEventListener('mousedown', onMapPress, true);
        document.addEventListener('touchstart', onMapPress, { capture: true, passive: true });
    }
    document.addEventListener('click', onDocumentClickCapture, true);

    const ui = {
        root,
        fab,
        originInput,
        destinationInput,
        getSelection() {
            return {
                originStationId: selectedOriginId,
                destinationStationId: selectedDestinationId,
                originText: normalizeText(originInput.value),
                destinationText: normalizeText(destinationInput.value)
            };
        }
    };

    window.TokyoRailJourneyUI = ui;
    return ui;
}

mountTravelSearchUI();
