import { captureRouteMapElementAsPng } from '../../services/routeMapCaptureService.js';

const ROUTE_MAP_LINE_TIMETABLES_PRINT_EVENT = '__TokyoRailRouteMapLineTimetablesPrintRequested';

export const captureRouteMapImage = async ({ element, filenameBase, buttonEl } = {}) =>
    captureRouteMapElementAsPng({ element, filenameBase, buttonEl });

export const requestRouteMapLineTimetablesPrint = ({ lineId, lineName } = {}) => {
    const lid = String(lineId ?? '').trim();
    if (!lid) return;
    window.dispatchEvent(new CustomEvent(ROUTE_MAP_LINE_TIMETABLES_PRINT_EVENT, {
        detail: {
            lineId: lid,
            lineName: String(lineName ?? '').trim() || lid
        }
    }));
};
