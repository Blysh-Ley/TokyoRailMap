export const installPanelTimetablePrintPayloadBuilder = ({
    windowRef = globalThis.window,
    buildLineStationPrintPayload,
    createLineStationPrintPayloadSession
} = {}) => {
    try {
        if (!windowRef) return false;
        windowRef.TokyoRailPanelTimetablePrintPayloadBuilder = {
            buildLineStationPrintPayload,
            createLineStationPrintPayloadSession
        };
        return true;
    } catch {
        return false;
    }
};
