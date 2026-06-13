export const ROUTE_MAP_SHOW_EVENT = '__TokyoRailShowRouteMapPanel';
export const ROUTE_MAP_RETURN_EVENT = '__TokyoRailRouteMapReturnPanel';

export const createPanelRouteMapBridge = ({
    target = globalThis.window,
    EventCtor = globalThis.CustomEvent
} = {}) => {
    const requestLineRouteMapPanel = ({
        lineId,
        lineName,
        placement = 'mobile-panel',
        returnTarget = 'panel'
    } = {}) => {
        if (!target?.dispatchEvent || typeof EventCtor !== 'function') return false;
        try {
            target.dispatchEvent(new EventCtor(ROUTE_MAP_SHOW_EVENT, {
                detail: {
                    lineId,
                    lineName,
                    placement,
                    returnTarget
                }
            }));
            return true;
        } catch {
            return false;
        }
    };

    const onReturn = (handler) => {
        if (!target?.addEventListener || typeof handler !== 'function') return () => {};
        target.addEventListener(ROUTE_MAP_RETURN_EVENT, handler);
        return () => target?.removeEventListener?.(ROUTE_MAP_RETURN_EVENT, handler);
    };

    return {
        onReturn,
        requestLineRouteMapPanel
    };
};
