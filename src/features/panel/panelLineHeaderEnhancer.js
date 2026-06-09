import {
    createLineIconElement as defaultCreateLineIconElement,
    createStationCodeBadgeElement as defaultCreateStationCodeBadgeElement,
    getResolvedRouteIconMeta as defaultGetResolvedRouteIconMeta
} from '../../lib/line-icons.js';
import { THROUGH_SERVICE_CONFIGS } from '../../lib/throughServiceManager.js';

const defaultToText = (value) => String(value ?? '').trim();

const applyLineIconStyle = (icon, { marginRight = '4px' } = {}) => {
    if (!icon?.style) return;
    icon.style.marginRight = marginRight;
    icon.style.verticalAlign = 'middle';
    icon.style.transform = 'translateY(-2px)';
};

const applyStationBadgeStyle = (badge) => {
    if (!badge?.style) return;
    badge.style.marginLeft = '0';
    badge.style.marginRight = '0';
    badge.style.verticalAlign = 'middle';
    badge.style.transform = 'none';
};

export const enhancePanelLineHeaderIcons = async (rootEl, {
    documentRef = globalThis.document,
    ElementRef = globalThis.Element,
    HTMLElementRef = globalThis.HTMLElement,
    throughServiceConfigs = THROUGH_SERVICE_CONFIGS,
    createLineIconElement = defaultCreateLineIconElement,
    createStationCodeBadgeElement = defaultCreateStationCodeBadgeElement,
    getResolvedRouteIconMeta = defaultGetResolvedRouteIconMeta,
    toText = defaultToText
} = {}) => {
    if (!ElementRef || !(rootEl instanceof ElementRef)) return;

    const names = rootEl.querySelectorAll?.('.panel-line-name') || [];
    for (const nameEl of names) {
        if (HTMLElementRef && !(nameEl instanceof HTMLElementRef)) continue;

        const lineEl = nameEl.closest?.('.panel-line');
        const lineId = toText(lineEl?.getAttribute?.('data-line-id'));
        if (!lineId) continue;

        const throughInfo = Array.isArray(throughServiceConfigs)
            ? throughServiceConfigs.find((item) => lineId === item?.tempId)
            : null;

        if (throughInfo && !nameEl.querySelector?.('.rw-line-icon')) {
            const fragment = documentRef?.createDocumentFragment?.();
            for (let index = 0; index < throughInfo.codes.length; index += 1) {
                const code = throughInfo.codes[index];
                const iconRouteId = throughInfo.routeIds[index];
                const icon = createLineIconElement?.({
                    routeId: iconRouteId,
                    code,
                    color: throughInfo.color
                });
                if (!icon) continue;
                applyLineIconStyle(icon, {
                    marginRight: index === throughInfo.codes.length - 1 ? '4px' : '3px'
                });
                fragment?.appendChild?.(icon);
            }
            if (fragment) nameEl.prepend?.(fragment);
            continue;
        }

        const meta = await getResolvedRouteIconMeta?.(lineId);
        if (!meta || (!meta.code && !meta.color)) continue;

        if (!nameEl.querySelector?.('.rw-line-icon')) {
            const icon = createLineIconElement?.({
                routeId: meta.id,
                code: meta.code,
                color: meta.color
            });
            if (icon) {
                applyLineIconStyle(icon);
                nameEl.prepend?.(icon);
            }
        }

        const stationInfoLeftEl = lineEl?.querySelector?.('.panel-station-info-left') || null;
        const suffixRowEl = lineEl?.querySelector?.('[data-line-suffix-row]') || null;
        const suffixInNameEl = nameEl.querySelector?.('.panel-line-name-suffix');

        if (suffixInNameEl) {
            if (suffixRowEl) suffixRowEl.appendChild?.(suffixInNameEl);
            else if (stationInfoLeftEl) stationInfoLeftEl.appendChild?.(suffixInNameEl);
        }

        const stationCode = toText(nameEl.getAttribute?.('data-transfer-station-code'));
        if (!stationCode) continue;

        const stationInfoHostEl = suffixRowEl || stationInfoLeftEl || nameEl;
        if (stationInfoHostEl?.querySelector?.('.rw-station-code-badge')) continue;

        const stationBadge = createStationCodeBadgeElement?.({
            code: stationCode,
            color: meta.color
        });
        if (!stationBadge) continue;

        applyStationBadgeStyle(stationBadge);

        const suffixEl = stationInfoHostEl.querySelector?.('.panel-line-name-suffix');
        if (suffixEl) {
            stationInfoHostEl.insertBefore?.(stationBadge, suffixEl);
            continue;
        }

        const mainEl = nameEl.querySelector?.('.panel-line-name-main');
        if (stationInfoHostEl !== nameEl) stationInfoHostEl.prepend?.(stationBadge);
        else if (mainEl && mainEl.nextSibling) nameEl.insertBefore?.(stationBadge, mainEl.nextSibling);
        else nameEl.appendChild?.(stationBadge);
    }
};
