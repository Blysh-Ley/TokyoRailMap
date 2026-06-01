const noop = () => {};

export const createPanelIntentController = ({
    captureElement = null
} = {}) => {
    const captureTripDetail = async ({
        root,
        filenameBase,
        buttonEl
    } = {}) => {
        if (typeof captureElement !== 'function' || !root) return false;
        await captureElement(root, filenameBase, buttonEl);
        return true;
    };

    const requestDirectionPrint = (printRequests, lineId, dirKey) => (
        printRequests?.requestDirectionTimetable?.(lineId, dirKey) === true
    );

    const requestAllPrint = (printRequests) => (
        printRequests?.requestAllTimetables?.() === true
    );

    const bindRouteMapPopoverHover = (target, {
        onEnter = noop,
        onLeave = noop
    } = {}) => {
        if (!target || typeof target.addEventListener !== 'function') {
            return noop;
        }

        const handleEnter = (event) => onEnter(event);
        const handleLeave = (event) => onLeave(event);

        target.addEventListener('__TokyoRailRouteMapPopoverHoverEnter', handleEnter);
        target.addEventListener('__TokyoRailRouteMapPopoverHoverLeave', handleLeave);

        return () => {
            target.removeEventListener?.('__TokyoRailRouteMapPopoverHoverEnter', handleEnter);
            target.removeEventListener?.('__TokyoRailRouteMapPopoverHoverLeave', handleLeave);
        };
    };

    return {
        bindRouteMapPopoverHover,
        captureTripDetail,
        requestAllPrint,
        requestDirectionPrint
    };
};
