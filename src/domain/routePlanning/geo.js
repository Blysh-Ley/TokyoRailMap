export const INF_DISTANCE_METERS = Number.POSITIVE_INFINITY;

const toRadians = (deg) => (Number(deg) * Math.PI) / 180;

export const isLngLatCoord = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return false;
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    return Number.isFinite(lng) && Number.isFinite(lat);
};

export const distanceMeters = (coordA, coordB) => {
    if (!isLngLatCoord(coordA) || !isLngLatCoord(coordB)) return INF_DISTANCE_METERS;
    const lng1 = Number(coordA[0]);
    const lat1 = Number(coordA[1]);
    const lng2 = Number(coordB[0]);
    const lat2 = Number(coordB[1]);
    const R = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const isWithinDistanceMeters = ({ coordA, coordB, maxDistanceMeters } = {}) => {
    if (!isLngLatCoord(coordA) || !isLngLatCoord(coordB)) return false;
    const dist = distanceMeters(coordA, coordB);
    return Number.isFinite(dist) && dist <= Number(maxDistanceMeters);
};
