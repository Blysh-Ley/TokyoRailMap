export const registerTokyoRailMapRuntime = ({ map, mapEngine, target = window } = {}) => {
    if (!target) return false;

    try {
        target.__TokyoRailMap = map;
        target.TokyoRailMapRuntime = {
            ...(target.TokyoRailMapRuntime || {}),
            getBaseMap: () => map,
            getMapEngine: () => mapEngine
        };
        return true;
    } catch {
        return false;
    }
};
