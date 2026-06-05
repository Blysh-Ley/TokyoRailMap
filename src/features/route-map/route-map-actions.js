import { captureRouteMapElementAsPng } from '../../services/routeMapCaptureService.js';

export const captureRouteMapImage = async ({ element, filenameBase, buttonEl } = {}) =>
    captureRouteMapElementAsPng({ element, filenameBase, buttonEl });
