export const DEFAULT_TRANSFER_PENALTY_MS = 3 * 60 * 1000;

export const DEMON_STATION_GATE_PENALTY = {
    Tokyo: 8.0,
    Shinjuku: 6.0,
    Shibuya: 6.0,
    Ikebukuro: 5.0,
    Yokohama: 5.0
};

export const parseStopId = (id) => {
    const parts = String(id ?? '').split('.');
    if (parts.length >= 3) {
        return { company: parts[0], line: parts[1], station: parts[2] };
    }
    return null;
};

export const calculateTransferPenaltyMs = ({
    distanceMeters,
    fromStopInfo,
    toStopInfo
} = {}) => {
    const dist = Number(distanceMeters);
    if (!Number.isFinite(dist)) return DEFAULT_TRANSFER_PENALTY_MS;

    const infoA = fromStopInfo || null;
    const infoB = toStopInfo || null;
    const isSameCompany = infoA && infoB && infoA.company === infoB.company;

    if (!infoA || !infoB) {
        return (2.0 + (dist / 100) * 1.5) * 60 * 1000;
    }

    const demonPenaltyA = DEMON_STATION_GATE_PENALTY[infoA.station];
    const demonPenaltyB = DEMON_STATION_GATE_PENALTY[infoB.station];
    const demonGatePenalty = Math.max(demonPenaltyA || 0, demonPenaltyB || 0);
    const isDemonStation = demonGatePenalty > 0;

    let transferMinutes = 0;
    if (isSameCompany) {
        if (dist <= 8) {
            transferMinutes = 2.0;
        } else if (dist <= 35) {
            transferMinutes = 2.0 + (dist / 100) * 1.0;
        } else if (dist <= 150) {
            transferMinutes = 2.0 + (dist / 100) * 1.2;
        } else {
            transferMinutes = 3.0 + (dist / 100) * 1.5;
        }
    } else {
        const gatePenalty = isDemonStation ? demonGatePenalty : 3.0;
        if (dist <= 25) {
            transferMinutes = gatePenalty + 2.0;
        } else {
            transferMinutes = gatePenalty + 2.0 + (dist / 100) * 1.8;
        }
    }

    return transferMinutes * 60 * 1000;
};
