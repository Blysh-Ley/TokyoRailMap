import { buildMobileSelectionViewportFit } from '../domain/selectionViewportFit.js';
import { DEFAULT_MOBILE_SHEET_PEEK_PX, getMobileSheetOffsetForState } from './mobileSheetSnap.js';

export const readMobileSelectionViewportFit = ({
    canvas,
    panelElement = null,
    routeMapElement = null,
    isMobile = false,
    kind = 'line',
    win = globalThis.window
} = {}) => {
    if (!isMobile) return null;
    const rect = canvas?.getBoundingClientRect?.();
    const width = Number(canvas?.clientWidth || rect?.width || win?.innerWidth || 0);
    const height = Number(canvas?.clientHeight || rect?.height || win?.innerHeight || 0);
    const drawer = kind === 'line' && routeMapElement?.classList?.contains?.('is-mobile-panel-placement')
        ? routeMapElement : panelElement;
    const drawerHeight = Number(drawer?.offsetHeight || drawer?.getBoundingClientRect?.().height || height * 0.88);
    const peekPx = parseFloat(drawer?.style?.getPropertyValue?.('--panel-mobile-peek-height')
        || drawer?.style?.getPropertyValue?.('--mobile-sheet-peek-height')) || DEFAULT_MOBILE_SHEET_PEEK_PX;
    const halfDrawerInset = Math.max(0, drawerHeight - getMobileSheetOffsetForState('half', { height: drawerHeight, peekPx }));
    return buildMobileSelectionViewportFit({
        width, height, layoutWidth: Number(win?.innerWidth || width), halfDrawerInset, kind
    });
};
