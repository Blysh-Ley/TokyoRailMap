const toText = (v) => String(v ?? '').trim();

export const hasTripNmMarker = (trip) => {
    if (!trip || typeof trip !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(trip, 'nm')) return false;
    const nm = trip.nm;
    if (Array.isArray(nm)) return nm.length > 0;
    if (nm && typeof nm === 'object') return Object.keys(nm).length > 0;
    return toText(nm) !== '';
};
