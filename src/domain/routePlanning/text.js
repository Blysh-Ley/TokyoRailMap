export const normalizeText = (value) => String(value ?? '').trim();

export const parseTripServiceDayFromId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    if (m?.[1]) return m[1];
    if (id.includes('.Weekday')) return 'Weekday';
    if (id.includes('.SaturdayHoliday')) return 'SaturdayHoliday';
    return '';
};

export const getTripBaseKey = (tripLike) => {
    const t = normalizeText(tripLike?.t || '');
    if (t) return t;
    const id = normalizeText(tripLike?.id || tripLike?.tripId || '');
    if (!id) return '';
    return id.replace(/\.(Weekday|SaturdayHoliday)(\.[0-9]+)?$/, '');
};

export const normalizeRefArray = (value) => {
    if (Array.isArray(value)) return value.map((x) => normalizeText(x)).filter(Boolean);
    const s = normalizeText(value);
    return s ? [s] : [];
};

export const getTripCanonicalId = (trip) => normalizeText(trip?.rawTripId || trip?.tripId || '');

export const getTripFileNameByLineId = (lineId) => {
    const id = normalizeText(lineId);
    return id ? `${id}.json` : '';
};

export const extractLineIdFromTripId = (tripId) => {
    const id = normalizeText(tripId);
    if (!id) return '';
    const m = id.match(/^(.*)\.[^.]+\.(Weekday|SaturdayHoliday)(?:\.[0-9]+)?$/);
    return normalizeText(m?.[1] || '');
};
